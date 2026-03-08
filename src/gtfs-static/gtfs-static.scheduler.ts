import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GtfsStaticService } from './gtfs-static.service';

@Injectable()
export class GtfsStaticScheduler {
  private readonly logger = new Logger(GtfsStaticScheduler.name);

  constructor(private readonly gtfsStaticService: GtfsStaticService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleNightlyIngestion() {
    this.logger.log('Starting nightly GTFS static ingestion...');
    const results = await this.gtfsStaticService.ingestAll();
    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      this.logger.warn(
        `GTFS ingestion completed with ${failed.length} failures: ${failed.map((f) => f.mode).join(', ')}`,
      );
    } else {
      this.logger.log('Nightly GTFS static ingestion completed successfully.');
    }
  }
}
