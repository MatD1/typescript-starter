import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  CoordParams,
  DepartureMonitorParams,
  GtfsRtFeedType,
  StopFinderParams,
  TransportMode,
  TripPlannerParams,
} from './transport.types';

@Injectable()
export class TransportService {
  private readonly logger = new Logger(TransportService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('transport.baseUrl')!;
    this.apiKey = this.configService.get<string>('transport.apiKey')!;
  }

  private get authHeaders() {
    return { Authorization: `apikey ${this.apiKey}` };
  }

  async getGtfsRealtime(
    feedType: GtfsRtFeedType,
    mode: TransportMode,
  ): Promise<Buffer> {
    const url = `${this.baseUrl}/v2/gtfs/${feedType}/${mode}`;
    const config: AxiosRequestConfig = {
      headers: { ...this.authHeaders, Accept: 'application/x-google-protobuf' },
      responseType: 'arraybuffer',
    };
    return this.request<Buffer>(url, config);
  }

  async getTripPlan(params: TripPlannerParams): Promise<unknown> {
    const url = `${this.baseUrl}/v2/tp/trip`;
    const config: AxiosRequestConfig = {
      headers: { ...this.authHeaders, Accept: 'application/json' },
      params: {
        outputFormat: 'rapidJSON',
        coordOutputFormat: 'EPSG:4326',
        ...params,
      },
    };
    return this.request<unknown>(url, config);
  }

  async getStopFinder(params: StopFinderParams): Promise<unknown> {
    const url = `${this.baseUrl}/v2/tp/stop_finder`;
    const config: AxiosRequestConfig = {
      headers: { ...this.authHeaders, Accept: 'application/json' },
      params: {
        outputFormat: 'rapidJSON',
        coordOutputFormat: 'EPSG:4326',
        type_sf: 'any',
        ...params,
      },
    };
    return this.request<unknown>(url, config);
  }

  async getDepartureMonitor(params: DepartureMonitorParams): Promise<unknown> {
    const url = `${this.baseUrl}/v2/tp/departure_mon`;
    const config: AxiosRequestConfig = {
      headers: { ...this.authHeaders, Accept: 'application/json' },
      params: {
        outputFormat: 'rapidJSON',
        coordOutputFormat: 'EPSG:4326',
        departureMonitorMacro: true,
        ...params,
      },
    };
    return this.request<unknown>(url, config);
  }

  async getCoord(params: CoordParams): Promise<unknown> {
    const url = `${this.baseUrl}/v2/tp/coord`;
    const config: AxiosRequestConfig = {
      headers: { ...this.authHeaders, Accept: 'application/json' },
      params: {
        outputFormat: 'rapidJSON',
        coordOutputFormat: 'EPSG:4326',
        ...params,
      },
    };
    return this.request<unknown>(url, config);
  }

  private async request<T>(
    url: string,
    config: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(url, config),
      );
      return response.data;
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; statusText?: string };
        message?: string;
      };
      const status = axiosErr?.response?.status;
      const msg = `NSW Transport API error: ${axiosErr?.response?.statusText ?? axiosErr?.message ?? 'Unknown'}`;
      this.logger.error(`${msg} [${status ?? 'N/A'}] ${url}`);
      if (status === 503 || status === 504) {
        throw new ServiceUnavailableException('NSW Transport API unavailable');
      }
      throw new InternalServerErrorException(msg);
    }
  }
}
