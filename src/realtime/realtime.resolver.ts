import { Args, Query, Resolver } from '@nestjs/graphql';
import { RealtimeService } from './realtime.service';
import { VehiclePositionObject } from './dto/vehicle-position.object';
import { TripUpdateObject } from './dto/trip-update.object';
import { TrackedTripObject } from './dto/tracked-trip.object';
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

  @Query(() => TrackedTripObject, {
    nullable: true,
    description:
      'Track a specific trip live. Returns vehicle position, delays, stop-time ' +
      'updates and vehicle amenity info for the given GTFS trip ID. Returns null ' +
      'if the vehicle is not yet active or the trip has ended. ' +
      'Pass the `tripId` field from a planned journey leg (planTrip query).',
  })
  trackTrip(
    @Args('tripId', { type: () => String, description: 'GTFS trip ID from a planned leg' })
    tripId: string,
    @Args('mode', {
      type: () => TransportModeEnum,
      nullable: true,
      description: 'Optional mode hint — improves lookup speed',
    })
    mode?: TransportModeEnum,
  ) {
    return this.realtimeService.trackTrip(tripId, mode);
  }
}
