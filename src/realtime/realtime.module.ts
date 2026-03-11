import { Module } from '@nestjs/common';
import { TransportModule } from '../transport/transport.module';
import { GtfsStaticModule } from '../gtfs-static/gtfs-static.module';
import { RealtimeService } from './realtime.service';
import { RealtimeController } from './realtime.controller';
import { RealtimeResolver } from './realtime.resolver';

@Module({
  imports: [TransportModule, GtfsStaticModule],
  controllers: [RealtimeController],
  providers: [RealtimeService, RealtimeResolver],
})
export class RealtimeModule {}
