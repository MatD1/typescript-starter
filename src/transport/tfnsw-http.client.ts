import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

export type TfnswKeyRole = 'realtime' | 'static';

export interface TfnswHeadResult {
  status: number;
  lastModified?: string;
  contentLength?: number;
  headers: Record<string, string>;
}

export interface TfnswGetResult {
  status: number;
  data: Buffer;
  lastModified?: string;
  contentLength?: number;
  headers: Record<string, string>;
}

const MAX_RPS = 4;
const MIN_INTERVAL_MS = Math.ceil(1000 / MAX_RPS);
const MAX_RETRIES = 8;
const SCHEDULE_TIMEOUT_MS = 600_000;
const DEFAULT_TIMEOUT_MS = 30_000;

@Injectable()
export class TfnswHttpClient {
  private readonly logger = new Logger(TfnswHttpClient.name);
  private readonly baseUrl: string;
  private readonly keys: Record<TfnswKeyRole, string>;
  private readonly queues: Record<
    TfnswKeyRole,
    { chain: Promise<void>; lastAt: number }
  > = {
    realtime: { chain: Promise.resolve(), lastAt: 0 },
    static: { chain: Promise.resolve(), lastAt: 0 },
  };

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl =
      this.configService.get<string>('transport.baseUrl') ??
      'https://api.transport.nsw.gov.au';
    const realtimeKey = this.normalizeApiKey(
      this.configService.get<string>('transport.apiKey'),
    );
    const staticKey = this.normalizeApiKey(
      this.configService.get<string>('transport.staticApiKey'),
    );
    this.keys = {
      realtime: realtimeKey,
      static: staticKey || realtimeKey,
    };

    if (!this.keys.realtime) {
      this.logger.error(
        'NSW_TRANSPORT_API_KEY is missing or empty. Realtime TfNSW requests are disabled.',
      );
    } else {
      this.logger.log('TfNSW realtime API credential configured');
    }
    if (staticKey) {
      this.logger.log('TfNSW static ingest API credential configured (dedicated key)');
    } else if (realtimeKey) {
      this.logger.warn(
        'NSW_TRANSPORT_STATIC_API_KEY unset; ingest will share NSW_TRANSPORT_API_KEY',
      );
    }
  }

  normalizeApiKey(value?: string | null): string {
    if (!value) return '';
    return value
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2')
      .replace(/^apikey\s+/i, '')
      .trim();
  }

  getApiKey(role: TfnswKeyRole): string {
    return this.keys[role];
  }

  async head(
    url: string,
    role: TfnswKeyRole = 'static',
  ): Promise<TfnswHeadResult> {
    const response = await this.requestWithRetry(role, 'head', url, {
      timeout: DEFAULT_TIMEOUT_MS,
      headers: this.authHeaders(role),
      validateStatus: () => true,
    });
    return {
      status: response.status,
      lastModified: this.header(response, 'last-modified'),
      contentLength: this.parseIntHeader(response, 'content-length'),
      headers: this.flattenHeaders(response),
    };
  }

  async getBuffer(
    url: string,
    role: TfnswKeyRole,
    options?: { timeoutMs?: number },
  ): Promise<TfnswGetResult> {
    const response = await this.requestWithRetry(role, 'get', url, {
      responseType: 'arraybuffer',
      timeout: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      headers: this.authHeaders(role),
      validateStatus: () => true,
    });
    const data = Buffer.from(response.data as ArrayBuffer);
    return {
      status: response.status,
      data,
      lastModified: this.header(response, 'last-modified'),
      contentLength: this.parseIntHeader(response, 'content-length') ?? data.length,
      headers: this.flattenHeaders(response),
    };
  }

  async getScheduleZip(url: string): Promise<TfnswGetResult> {
    return this.getBuffer(url, 'static', { timeoutMs: SCHEDULE_TIMEOUT_MS });
  }

  /** Realtime/trip-planner GET that returns response body (Buffer or parsed JSON). */
  async getRealtime<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.requestWithRetry('realtime', 'get', url, {
      timeout: config?.timeout ?? DEFAULT_TIMEOUT_MS,
      headers: {
        ...this.authHeaders('realtime'),
        ...(config?.headers as Record<string, string> | undefined),
      },
      responseType: config?.responseType,
      params: config?.params,
      validateStatus: () => true,
    });
    if (config?.responseType === 'arraybuffer') {
      return Buffer.from(response.data as ArrayBuffer) as T;
    }
    return response.data as T;
  }

  private authHeaders(role: TfnswKeyRole): Record<string, string> {
    return { Authorization: `apikey ${this.keys[role]}` };
  }

  private async requestWithRetry(
    role: TfnswKeyRole,
    method: 'get' | 'head',
    url: string,
    config: AxiosRequestConfig,
  ): Promise<AxiosResponse> {
    if (!this.keys[role]) {
      throw new ServiceUnavailableException(
        'TfNSW API credentials are not configured',
      );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await this.acquireSlot(role);
      try {
        const response =
          method === 'head'
            ? await firstValueFrom(this.httpService.head(url, config))
            : await firstValueFrom(this.httpService.get(url, config));

        const status = response.status;
        if (status >= 200 && status < 300) return response;

        const detail = this.header(response, 'x-error-detail') ?? '';
        const bodyMsg = this.extractErrorMessage(response.data);

        if (this.isQuotaExhausted(status, detail, bodyMsg)) {
          this.logger.error(
            `TfNSW account over quota [${status}] ${url}: ${detail || bodyMsg}`,
          );
          throw new ServiceUnavailableException(
            'TfNSW daily request quota is exhausted',
          );
        }

        if (this.isRateLimited(status, detail, bodyMsg)) {
          const delay = this.backoffMs(attempt);
          this.logger.warn(
            `TfNSW rate limited [${status}] ${url}; backoff ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await this.sleep(delay);
          continue;
        }

        if (status === 503 || status === 504) {
          const delay = this.backoffMs(attempt);
          this.logger.warn(
            `TfNSW unavailable [${status}] ${url}; backoff ${delay}ms`,
          );
          await this.sleep(delay);
          continue;
        }

        if (status === 401 || status === 403) {
          this.logger.error(
            `TfNSW rejected credential [${status}] ${url}. ${detail || bodyMsg}`,
          );
          throw new ServiceUnavailableException(
            'TfNSW authentication is currently unavailable',
          );
        }

        throw new ServiceUnavailableException(
          `TfNSW request failed [${status}] ${url}`,
        );
      } catch (err) {
        if (
          err instanceof ServiceUnavailableException ||
          (err as { status?: number })?.status === 503
        ) {
          throw err;
        }
        lastError = err;
        const delay = this.backoffMs(attempt);
        this.logger.warn(
          `TfNSW network error ${url}; backoff ${delay}ms: ${err instanceof Error ? err.message : String(err)}`,
        );
        await this.sleep(delay);
      }
    }

    throw new ServiceUnavailableException(
      `TfNSW request failed after retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }

  private acquireSlot(role: TfnswKeyRole): Promise<void> {
    const q = this.queues[role];
    const run = async () => {
      const now = Date.now();
      const wait = Math.max(0, q.lastAt + MIN_INTERVAL_MS - now);
      if (wait > 0) await this.sleep(wait);
      q.lastAt = Date.now();
    };
    const next = q.chain.then(run, run);
    q.chain = next.catch(() => undefined);
    return next;
  }

  private isRateLimited(
    status: number,
    detail: string,
    bodyMsg: string,
  ): boolean {
    if (status === 429) return true;
    const text = `${detail} ${bodyMsg}`.toLowerCase();
    return (
      status === 403 &&
      (text.includes('over rate limit') || text.includes('rate limit'))
    );
  }

  private isQuotaExhausted(
    status: number,
    detail: string,
    bodyMsg: string,
  ): boolean {
    const text = `${detail} ${bodyMsg}`.toLowerCase();
    return (
      (status === 403 || status === 401) &&
      (text.includes('over quota') || text.includes('quota limit'))
    );
  }

  private backoffMs(attempt: number): number {
    const base = Math.min(60_000, 1000 * 2 ** attempt);
    const jitter = Math.floor(Math.random() * 250);
    return base + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      t.unref?.();
    });
  }

  private header(
    response: AxiosResponse,
    name: string,
  ): string | undefined {
    const headers = response.headers as Record<string, unknown>;
    const raw = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(raw)) return String(raw[0]);
    return raw != null ? String(raw) : undefined;
  }

  private parseIntHeader(
    response: AxiosResponse,
    name: string,
  ): number | undefined {
    const v = this.header(response, name);
    if (!v) return undefined;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  }

  private flattenHeaders(response: AxiosResponse): Record<string, string> {
    const out: Record<string, string> = {};
    const headers = response.headers ?? {};
    for (const [k, v] of Object.entries(headers)) {
      if (v == null) continue;
      out[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }
    return out;
  }

  private extractErrorMessage(data: unknown): string {
    if (!data) return '';
    if (Buffer.isBuffer(data)) {
      try {
        return data.toString('utf8').slice(0, 500);
      } catch {
        return '';
      }
    }
    if (typeof data === 'string') return data.slice(0, 500);
    if (typeof data === 'object') {
      const obj = data as {
        message?: string;
        code?: number;
        ErrorDetails?: { Message?: string };
      };
      return (
        obj.ErrorDetails?.Message ??
        obj.message ??
        JSON.stringify(data).slice(0, 500)
      );
    }
    return '';
  }
}
