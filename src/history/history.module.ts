import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DisruptionsModule } from '../disruptions/disruptions.module';
import { GtfsStaticModule } from '../gtfs-static/gtfs-static.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { HistoryBackfillService } from './history-backfill.service';
import { HistoryController } from './history.controller';
import { HistoryResolver } from './history.resolver';
import { HistorySamplerService } from './history-sampler.service';
import { HistoryService } from './history.service';
import { LineHealthAlertsService } from './line-health-alerts.service';

@Module({
  imports: [RealtimeModule, DisruptionsModule, GtfsStaticModule, AuthModule],
  controllers: [HistoryController],
  providers: [
    HistorySamplerService,
    HistoryService,
    HistoryBackfillService,
    HistoryResolver,
    LineHealthAlertsService,
  ],
  exports: [HistoryService, HistorySamplerService, LineHealthAlertsService],
})
export class HistoryModule {}
