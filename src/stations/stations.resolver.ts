import { Args, Query, Resolver } from '@nestjs/graphql';
import { StationsService } from './stations.service';
import { StationObject } from './dto/station.object';

@Resolver()
export class StationsResolver {
  constructor(private readonly stationsService: StationsService) {}

  @Query(() => [StationObject], {
    description: 'Search for stations/stops by name.',
  })
  searchStations(
    @Args('query') query: string,
    @Args('limit', { nullable: true, type: () => Number }) limit?: number,
  ) {
    return this.stationsService.search(query, limit);
  }

  @Query(() => StationObject, {
    nullable: true,
    description: 'Get a station by stop ID.',
  })
  stationById(@Args('stopId') stopId: string) {
    return this.stationsService.findById(stopId);
  }

  @Query(() => [StationObject], {
    description: 'Find stations near a coordinate.',
  })
  nearbyStations(
    @Args('lat') lat: number,
    @Args('lon') lon: number,
    @Args('radius', { nullable: true, type: () => Number }) radius?: number,
    @Args('limit', { nullable: true, type: () => Number }) limit?: number,
  ) {
    return this.stationsService.findNearby(lat, lon, radius, limit);
  }
}
