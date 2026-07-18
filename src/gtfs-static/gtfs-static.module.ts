import { Module } from '@nestjs/common';
import { GtfsStaticService } from './gtfs-static.service';
import { GtfsStaticController } from './gtfs-static.controller';
import { GtfsStaticResolver } from './gtfs-static.resolver';
import { GtfsStaticScheduler } from './gtfs-static.scheduler';
import { RouteMetadataDataLoader } from './gtfs-route.dataloader';
import { AuthModule } from '../auth/auth.module';
import { TransportModule } from '../transport/transport.module';

@Module({
  imports: [AuthModule, TransportModule],
  controllers: [GtfsStaticController],
  providers: [
    GtfsStaticService,
    GtfsStaticResolver,
    GtfsStaticScheduler,
    RouteMetadataDataLoader,
  ],
  exports: [GtfsStaticService, RouteMetadataDataLoader],
})
export class GtfsStaticModule {}
