import { Args, Query, Resolver } from '@nestjs/graphql';
import { RealtimeService } from './realtime.service';
import { VehiclePositionObject } from './dto/vehicle-position.object';
import { TripUpdateObject } from './dto/trip-update.object';
import { TransportModeEnum } from '../transport/transport.types';

@Resolver()
export class RealtimeResolver {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Query(() => [VehiclePositionObject], {
    description:
      'Get live vehicle positions. Optionally filter by transport mode.',
  })
  vehiclePositions(
    @Args('mode', { type: () => TransportModeEnum, nullable: true })
    mode?: TransportModeEnum,
  ) {
    return this.realtimeService.getVehiclePositions(mode);
  }

  @Query(() => [TripUpdateObject], {
    description: 'Get live trip updates. Optionally filter by transport mode.',
  })
  tripUpdates(
    @Args('mode', { type: () => TransportModeEnum, nullable: true })
    mode?: TransportModeEnum,
  ) {
    return this.realtimeService.getTripUpdates(mode);
  }
}
