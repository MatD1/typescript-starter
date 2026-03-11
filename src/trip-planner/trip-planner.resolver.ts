import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { TripPlannerService } from './trip-planner.service';
import {
  TripResultObject,
  StopObject,
  DepartureObject,
} from './dto/trip-planner.objects';
import { StopFinderTypeEnum } from '../transport/transport.types';

@Resolver()
export class TripPlannerResolver {
  constructor(private readonly tripPlannerService: TripPlannerService) {}

  @Query(() => [TripResultObject], {
    description: 'Plan a journey between two locations.',
  })
  planTrip(
    @Args('originId', { nullable: true }) originId?: string,
    @Args('originName', { nullable: true }) originName?: string,
    @Args('originCoord', {
      nullable: true,
      description: 'lon:lat:EPSG:4326 (longitude first)',
    })
    originCoord?: string,
    @Args('destId', { nullable: true }) destId?: string,
    @Args('destName', { nullable: true }) destName?: string,
    @Args('destCoord', {
      nullable: true,
      description: 'lon:lat:EPSG:4326 (longitude first)',
    })
    destCoord?: string,
    @Args('itdDate', { nullable: true }) itdDate?: string,
    @Args('itdTime', { nullable: true }) itdTime?: string,
    @Args('calcNumberOfTrips', { nullable: true, type: () => Int })
    calcNumberOfTrips?: number,
    @Args('wheelchair', { nullable: true }) wheelchair?: boolean,
  ) {
    return this.tripPlannerService.planTrip({
      originId,
      originName,
      originCoord,
      destId,
      destName,
      destCoord,
      itdDate,
      itdTime,
      calcNumberOfTrips,
      wheelchair,
    });
  }

  @Query(() => [StopObject], {
    description: 'Search for stops and stations by name.',
  })
  findStops(
    @Args('query') query: string,
    @Args('type', {
      nullable: true,
      type: () => StopFinderTypeEnum,
      description: 'any | coord | poi | stop',
    })
    type?: StopFinderTypeEnum,
  ) {
    return this.tripPlannerService.findStops({
      name_sf: query,
      type_sf: type ?? 'any',
    });
  }

  @Query(() => [DepartureObject], {
    description: 'Get departure board for a stop.',
  })
  departures(
    @Args('stopId', { nullable: true }) stopId?: string,
    @Args('stopName', { nullable: true }) stopName?: string,
    @Args('itdDate', { nullable: true }) itdDate?: string,
    @Args('itdTime', { nullable: true }) itdTime?: string,
  ) {
    return this.tripPlannerService.getDepartures({
      name_dm: stopId ?? stopName,
      type_dm: 'stop',
      itdDate,
      itdTime,
    });
  }

  @Query(() => [StopObject], {
    description: 'Find stops near a coordinate.',
  })
  nearbyStops(
    @Args('lat') lat: number,
    @Args('lon') lon: number,
    @Args('radius', { nullable: true, type: () => Number }) radius?: number,
  ) {
    return this.tripPlannerService.searchByCoord({
      coord: `${lon}:${lat}:EPSG:4326`,
      radius_1: radius ?? 500,
      type_1: 'BUS_POINT',
    });
  }
}
