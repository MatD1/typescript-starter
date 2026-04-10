import { Module } from '@nestjs/common';
import { TransportModule } from '../transport/transport.module';
import { GtfsStaticModule } from '../gtfs-static/gtfs-static.module';
import { TripPlannerService } from './trip-planner.service';
import { TripPlannerController } from './trip-planner.controller';
import { TripPlannerResolver, LegResolver, DepartureResolver } from './trip-planner.resolver';

@Module({
  imports: [TransportModule, GtfsStaticModule],
  controllers: [TripPlannerController],
  providers: [TripPlannerService, TripPlannerResolver, LegResolver, DepartureResolver],
})
export class TripPlannerModule { }
