import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GtfsStaticService } from './gtfs-static.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';

@Injectable()
export class GtfsStaticScheduler {
  private readonly logger = new Logger(GtfsStaticScheduler.name);

  constructor(
    private readonly gtfsStaticService: GtfsStaticService,
    private readonly audit: AuditService,
  ) {}

  /** After TfNSW bus (~04:30) and ferry (~05:15) refresh windows. */
  @Cron('45 5 * * *', { timeZone: 'Australia/Sydney' })
  async handleNightlyIngestion() {
    this.logger.log('Starting nightly GTFS static ingestion...');
    await this.audit.recordBestEffort({
      category: 'gtfs',
      action: AUDIT_ACTIONS.GTFS_INGEST_ATTEMPTED,
      outcome: 'attempted',
      source: 'job',
      actor: { type: 'system', id: 'gtfs-scheduler' },
      targetType: 'gtfs_feed',
      targetId: 'all',
      reason: 'Scheduled nightly GTFS static ingestion',
    });
    try {
      const results = await this.gtfsStaticService.ingestAll();
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        this.logger.warn(
          `GTFS ingestion completed with ${failed.length} failures: ${failed.map((f) => f.feedKey).join(', ')}`,
        );
      } else {
        this.logger.log('Nightly GTFS static ingestion completed successfully.');
      }
      await this.audit.recordBestEffort({
        category: 'gtfs',
        action: AUDIT_ACTIONS.GTFS_INGEST_COMPLETED,
        outcome: failed.length ? 'failed' : 'succeeded',
        source: 'job',
        actor: { type: 'system', id: 'gtfs-scheduler' },
        targetType: 'gtfs_feed',
        targetId: 'all',
        metadata: { total: results.length, failed: failed.length },
      });
    } catch (error) {
      await this.audit.recordBestEffort({
        category: 'gtfs',
        action: AUDIT_ACTIONS.GTFS_INGEST_FAILED,
        outcome: 'failed',
        severity: 'high',
        source: 'job',
        actor: { type: 'system', id: 'gtfs-scheduler' },
        targetType: 'gtfs_feed',
        targetId: 'all',
        error: {
          code: 'SCHEDULED_INGEST_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}
