import { Module } from '@nestjs/common';
import { DisruptionsModule } from '../disruptions/disruptions.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { HistoryResolver } from './history.resolver';
import { HistorySamplerService } from './history-sampler.service';
import { HistoryService } from './history.service';

@Module({
  imports: [RealtimeModule, DisruptionsModule],
  providers: [HistorySamplerService, HistoryService, HistoryResolver],
})
export class HistoryModule {}
