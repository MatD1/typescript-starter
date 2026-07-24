import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';

const DEFAULT_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 365;
const DELETE_BATCH_SIZE = 10_000;

export function normalizeRetentionDays(value: number | undefined): number {
  return Number.isInteger(value) && value! >= 1 && value! <= MAX_RETENTION_DAYS
    ? value!
    : DEFAULT_RETENTION_DAYS;
}

@Injectable()
export class RequestLogRetentionService {
  private readonly logger = new Logger(RequestLogRetentionService.name);
  private readonly retentionDays: number;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    config: ConfigService,
  ) {
    this.retentionDays = normalizeRetentionDays(
      config.get<number>('logging.requestRetentionDays'),
    );
  }

  @Cron('20 3 * * *', { timeZone: 'UTC' })
  async purgeExpiredRequestLogs(): Promise<number> {
    try {
      const result = await this.db.execute(sql`
        with expired as (
          select id
          from request_log
          where created_at < now() - (${this.retentionDays} * interval '1 day')
          order by created_at asc, id asc
          limit ${DELETE_BATCH_SIZE}
        )
        delete from request_log
        using expired
        where request_log.id = expired.id
        returning request_log.id
      `);
      const purged = result.rowCount ?? result.rows.length;
      if (purged > 0) {
        this.logger.log(
          { purged, retentionDays: this.retentionDays },
          'Purged expired request logs',
        );
      }
      return purged;
    } catch (err) {
      this.logger.warn(
        { err, retentionDays: this.retentionDays },
        'Failed to purge expired request logs',
      );
      return 0;
    }
  }
}
