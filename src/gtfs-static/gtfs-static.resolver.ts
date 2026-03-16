import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { GtfsStaticService } from './gtfs-static.service';
import {
  PaginatedRoutesObject,
  PaginatedStopsObject,
  PaginatedStopTimesObject,
  PaginatedTripsObject,
} from './dto/gtfs-static.objects';
import { TransportModeEnum } from '../transport/transport.types';

@Resolver()
export class GtfsStaticResolver {
  constructor(private readonly gtfsStaticService: GtfsStaticService) { }

  @Query(() => PaginatedRoutesObject, { description: 'List GTFS static routes (paginated).' })
  gtfsRoutes(
    @Args('mode', { type: () => TransportModeEnum, nullable: true })
    mode?: TransportModeEnum,
    @Args('limit', { nullable: true, type: () => Int }) limit?: number,
    @Args('offset', { nullable: true, type: () => Int }) offset?: number,
  ) {
    return this.gtfsStaticService.getRoutes(mode, limit, offset);
  }

  @Query(() => Int, { description: 'Total count of GTFS static routes.' })
  gtfsRoutesCount(
    @Args('mode', { type: () => TransportModeEnum, nullable: true })
    mode?: TransportModeEnum,
  ) {
    return this.gtfsStaticService.getRoutesCount(mode);
  }

  @Query(() => PaginatedStopsObject, { description: 'List GTFS static stops (paginated).' })
  gtfsStops(
    @Args('mode', { type: () => TransportModeEnum, nullable: true })
    mode?: TransportModeEnum,
    @Args('limit', { nullable: true, type: () => Int }) limit?: number,
    @Args('offset', { nullable: true, type: () => Int }) offset?: number,
  ) {
    return this.gtfsStaticService.getStops(mode, limit, offset);
  }

  @Query(() => Int, { description: 'Total count of GTFS static stops.' })
  gtfsStopsCount(
    @Args('mode', { type: () => TransportModeEnum, nullable: true })
    mode?: TransportModeEnum,
  ) {
    return this.gtfsStaticService.getStopsCount(mode);
  }

  @Query(() => PaginatedTripsObject, { description: 'List GTFS static trips (paginated).' })
  gtfsTrips(
    @Args('routeId', { nullable: true }) routeId?: string,
    @Args('limit', { nullable: true, type: () => Int }) limit?: number,
    @Args('offset', { nullable: true, type: () => Int }) offset?: number,
  ) {
    return this.gtfsStaticService.getTrips(routeId, limit, offset);
  }

  @Query(() => Int, { description: 'Total count of GTFS static trips.' })
  gtfsTripsCount(
    @Args('routeId', { nullable: true }) routeId?: string,
  ) {
    return this.gtfsStaticService.getTripsCount(routeId);
  }

  @Query(() => PaginatedStopTimesObject, {
    description: 'List GTFS static stop times (paginated).',
  })
  gtfsStopTimes(
    @Args('tripId', { nullable: true }) tripId?: string,
    @Args('stopId', { nullable: true }) stopId?: string,
    @Args('limit', { nullable: true, type: () => Int }) limit?: number,
    @Args('offset', { nullable: true, type: () => Int }) offset?: number,
  ) {
    return this.gtfsStaticService.getStopTimes(tripId, stopId, limit, offset);
  }
}
