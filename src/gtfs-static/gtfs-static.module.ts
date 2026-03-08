import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GtfsStaticService } from './gtfs-static.service';
import { GtfsStaticController } from './gtfs-static.controller';
import { GtfsStaticResolver } from './gtfs-static.resolver';
import { GtfsStaticScheduler } from './gtfs-static.scheduler';

@Module({
  imports: [HttpModule],
  controllers: [GtfsStaticController],
  providers: [GtfsStaticService, GtfsStaticResolver, GtfsStaticScheduler],
  exports: [GtfsStaticService],
})
export class GtfsStaticModule {}
