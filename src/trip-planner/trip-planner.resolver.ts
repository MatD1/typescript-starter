import { Args, Int, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { TripPlannerService } from './trip-planner.service';
import {
  TripResultObject,
  TripPlannerResponseObject,
  StopObject,
  DepartureObject,
  LegObject,
} from './dto/trip-planner.objects';
import { RouteMetadataDataLoader } from '../gtfs-static/gtfs-route.dataloader';
import { StopFinderTypeEnum } from '../transport/transport.types';

@Resolver()
export class TripPlannerResolver {
  constructor(private readonly tripPlannerService: TripPlannerService) { }

  @Query(() => TripPlannerResponseObject, {
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
    @Args('context', { nullable: true }) context?: string,
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
      context,
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

@Resolver(() => LegObject)
export class LegResolver {
  constructor(private readonly dataLoader: RouteMetadataDataLoader) { }

  @ResolveField(() => String, { nullable: true })
  async lineCode(@Parent() leg: LegObject) {
    if (!leg.tripId) return null;
    const meta = await this.dataLoader.loader.load(leg.tripId);
    return meta?.lineCode ?? null;
  }

  @ResolveField(() => String, { nullable: true })
  async routeColour(@Parent() leg: LegObject) {
    if (!leg.tripId) return null;
    const meta = await this.dataLoader.loader.load(leg.tripId);
    return meta?.routeColour ?? null;
  }
}

@Resolver(() => DepartureObject)
export class DepartureResolver {
  constructor(private readonly dataLoader: RouteMetadataDataLoader) { }

  @ResolveField(() => String, { nullable: true })
  async lineCode(@Parent() departure: DepartureObject) {
    if (!departure.tripId) return null;
    const meta = await this.dataLoader.loader.load(departure.tripId);
    return meta?.lineCode ?? null;
  }

  @ResolveField(() => String, { nullable: true })
  async routeColour(@Parent() departure: DepartureObject) {
    if (!departure.tripId) return null;
    const meta = await this.dataLoader.loader.load(departure.tripId);
    return meta?.routeColour ?? null;
  }
}
