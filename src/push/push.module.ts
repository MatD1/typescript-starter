import { Module } from '@nestjs/common';
import { HistoryModule } from '../history/history.module';
import { CommuteAlertService } from './commute-alert.service';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  imports: [HistoryModule],
  controllers: [PushController],
  providers: [PushService, CommuteAlertService],
  exports: [PushService],
})
export class PushModule {}
