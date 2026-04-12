import { Module } from '@nestjs/common';
import { TransportModule } from '../transport/transport.module';
import { GtfsStaticModule } from '../gtfs-static/gtfs-static.module';
import { RealtimeService } from './realtime.service';
import { RealtimeController } from './realtime.controller';
import { RealtimeResolver } from './realtime.resolver';
import { pubSubProvider } from './pubsub.provider';
import { RealtimePollerService } from './realtime-poller.service';
import { VehicleStreamService } from './vehicle-stream.service';

@Module({
  imports: [TransportModule, GtfsStaticModule],
  controllers: [RealtimeController],
  providers: [
    RealtimeService,
    RealtimeResolver,
    pubSubProvider,
    RealtimePollerService,
    VehicleStreamService,
  ],
  exports: [pubSubProvider],
})
export class RealtimeModule { }
