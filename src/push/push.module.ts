import { Module } from '@nestjs/common';
import { HistoryModule } from '../history/history.module';
import { CommuteAlertService } from './commute-alert.service';
import { PushService } from './push.service';

@Module({
  imports: [HistoryModule],
  providers: [PushService, CommuteAlertService],
  exports: [PushService],
})
export class PushModule {}
