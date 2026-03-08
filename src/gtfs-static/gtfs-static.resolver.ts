import { Args, Query, Resolver } from '@nestjs/graphql';
import { GtfsStaticService } from './gtfs-static.service';
import {
  GtfsRouteObject,
  GtfsStopObject,
  GtfsTripObject,
} from './dto/gtfs-static.objects';

@Resolver()
export class GtfsStaticResolver {
  constructor(private readonly gtfsStaticService: GtfsStaticService) {}

  @Query(() => [GtfsRouteObject], { description: 'List GTFS static routes.' })
  gtfsRoutes(
    @Args('mode', { nullable: true }) mode?: string,
    @Args('limit', { nullable: true, type: () => Number }) limit?: number,
  ) {
    return this.gtfsStaticService.getRoutes(mode, limit);
  }

  @Query(() => [GtfsStopObject], { description: 'List GTFS static stops.' })
  gtfsStops(
    @Args('mode', { nullable: true }) mode?: string,
    @Args('limit', { nullable: true, type: () => Number }) limit?: number,
  ) {
    return this.gtfsStaticService.getStops(mode, limit);
  }

  @Query(() => [GtfsTripObject], { description: 'List GTFS static trips.' })
  gtfsTrips(
    @Args('routeId', { nullable: true }) routeId?: string,
    @Args('limit', { nullable: true, type: () => Number }) limit?: number,
  ) {
    return this.gtfsStaticService.getTrips(routeId, limit);
  }
}
