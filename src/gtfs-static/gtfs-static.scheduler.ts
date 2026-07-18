import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GtfsStaticService } from './gtfs-static.service';

@Injectable()
export class GtfsStaticScheduler {
  private readonly logger = new Logger(GtfsStaticScheduler.name);

  constructor(private readonly gtfsStaticService: GtfsStaticService) {}

  /** After TfNSW bus (~04:30) and ferry (~05:15) refresh windows. */
  @Cron('45 5 * * *', { timeZone: 'Australia/Sydney' })
  async handleNightlyIngestion() {
    this.logger.log('Starting nightly GTFS static ingestion...');
    const results = await this.gtfsStaticService.ingestAll();
    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      this.logger.warn(
        `GTFS ingestion completed with ${failed.length} failures: ${failed.map((f) => f.feedKey).join(', ')}`,
      );
    } else {
      this.logger.log('Nightly GTFS static ingestion completed successfully.');
    }
  }
}
