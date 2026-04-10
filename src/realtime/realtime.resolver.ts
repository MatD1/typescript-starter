import { Args, Query, Resolver, Subscription } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { RealtimePollerService } from './realtime-poller.service';
import { PUB_SUB } from './pubsub.provider';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import { VehiclePositionObject } from './dto/vehicle-position.object';
import { TripUpdateObject } from './dto/trip-update.object';
import { TrackedTripObject } from './dto/tracked-trip.object';
import { TransportModeEnum } from '../transport/transport.types';

@Resolver()
export class RealtimeResolver {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly pollerService: RealtimePollerService,
    @Inject(PUB_SUB) private readonly pubSub: RedisPubSub,
  ) { }

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
  trackTripQuery(
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

  @Subscription(() => TrackedTripObject, {
    resolve: (payload) => payload.trackTrip,
    description: 'Listen to live updates for a specific trip over a WebSocket connection.',
  })
  trackTrip(
    @Args('tripId', { type: () => String }) tripId: string,
    @Args('mode', { type: () => TransportModeEnum, nullable: true }) mode?: TransportModeEnum,
  ) {
    this.pollerService.addTrip(tripId, mode);

    const iterator = this.pubSub.asyncIterableIterator<any>(`trackTrip:${tripId}`);

    // Intercept AsyncIterator return to handle unsubscribe event
    const origReturn = iterator.return?.bind(iterator);
    iterator.return = async () => {
      this.pollerService.removeTrip(tripId);
      if (origReturn) {
        return origReturn();
      }
      return { value: undefined, done: true };
    };

    return iterator;
  }
}
