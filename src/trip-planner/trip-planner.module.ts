import { Module } from '@nestjs/common';
import { TransportModule } from '../transport/transport.module';
import { TripPlannerService } from './trip-planner.service';
import { TripPlannerController } from './trip-planner.controller';
import { TripPlannerResolver } from './trip-planner.resolver';

@Module({
  imports: [TransportModule],
  controllers: [TripPlannerController],
  providers: [TripPlannerService, TripPlannerResolver],
})
export class TripPlannerModule {}
