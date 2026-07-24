import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { AuditEventInput } from '../audit/audit.types';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly client: Redis;

  constructor(configService: ConfigService) {
    this.client = new Redis(configService.get<string>('redis.url'), {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /** Delete all keys matching `${prefix}*`. Used to invalidate a whole cached section (e.g. after a GTFS ingest). */
  async delByPrefix(prefix: string): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        500,
      );
      if (keys.length) await this.client.del(...keys);
      cursor = nextCursor;
    } while (cursor !== '0');
  }

  /**
   * Flush application cache keys while preserving the durable audit retry
   * stream. Audit delivery must not be erasable through the admin cache API.
   */
  async flush(): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'COUNT',
        500,
      );
      const deletable = keys.filter((key) => !key.startsWith('audit:'));
      if (deletable.length) await this.client.del(...deletable);
      cursor = nextCursor;
    } while (cursor !== '0');
  }

  /**
   * Ping Redis to check connectivity.
   * Returns true if Redis responds with PONG, false otherwise.
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await factory();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  /** SET key NX EX ttl — returns true when the lock was acquired. */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    await this.client.del(key);
  }

  async enqueueAuditEvent(event: AuditEventInput): Promise<string> {
    return this.client.xadd(
      'audit:pending',
      'MAXLEN',
      '~',
      '100000',
      '*',
      'event',
      JSON.stringify(event),
    ) as Promise<string>;
  }

  async readAuditEvents(
    limit = 100,
  ): Promise<Array<{ streamId: string; event: AuditEventInput }>> {
    const entries = await this.client.xrange(
      'audit:pending',
      '-',
      '+',
      'COUNT',
      limit,
    );
    return entries.flatMap(([streamId, fields]) => {
      const eventIndex = fields.indexOf('event');
      if (eventIndex < 0 || !fields[eventIndex + 1]) return [];
      try {
        return [
          {
            streamId,
            event: JSON.parse(fields[eventIndex + 1]) as AuditEventInput,
          },
        ];
      } catch {
        return [];
      }
    });
  }

  async ackAuditEvent(streamId: string): Promise<void> {
    await this.client.xdel('audit:pending', streamId);
  }

  async auditQueueLength(): Promise<number> {
    return this.client.xlen('audit:pending');
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
