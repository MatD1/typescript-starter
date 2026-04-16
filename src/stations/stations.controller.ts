import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  ParseFloatPipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { StationsService } from './stations.service';
import { StationObject } from './dto/station.object';

@ApiTags('stations')
@ApiSecurity('X-API-Key')
@Controller('stations')
export class StationsController {
  constructor(private readonly stationsService: StationsService) { }

  @Get('search')
  @ApiOperation({
    summary: 'Search for stations and stops by name',
    description:
      'Full-text search across all GTFS static stop names. ' +
      'Returns stops matching the query string, ordered by relevance. ' +
      'Useful for building location pickers or auto-complete inputs.',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Search term (e.g. "Central", "Chatswood")',
    example: 'Central',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum results to return (default 20, max 100)',
    example: 20,
  })
  @ApiOkResponse({
    type: [StationObject],
    description: 'Array of matching stops, ordered by relevance',
  })
  search(
    @Query('q') q: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.stationsService.search(q, limit ?? 20);
  }

  @Get('nearby')
  @ApiOperation({
    summary: 'Find stations and stops near a coordinate',
    description:
      'Returns stops within `radius` metres of the specified WGS84 coordinate. ' +
      'Results are ordered by distance ascending. ' +
      'Useful for "stops near me" features.',
  })
  @ApiQuery({
    name: 'lat',
    required: true,
    description: 'WGS84 latitude',
    example: -33.8688,
  })
  @ApiQuery({
    name: 'lon',
    required: true,
    description: 'WGS84 longitude',
    example: 151.2093,
  })
  @ApiQuery({
    name: 'radius',
    required: false,
    description: 'Search radius in metres (default 500, max 2000)',
    example: 500,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum results to return (default 20)',
    example: 10,
  })
  @ApiOkResponse({
    type: [StationObject],
    description: 'Array of nearby stops ordered by distance ascending',
  })
  nearby(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lon', ParseFloatPipe) lon: number,
    @Query('radius', new ParseIntPipe({ optional: true })) radius?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.stationsService.findNearby(
      lat,
      lon,
      radius ?? 500,
      limit ?? 20,
    );
  }

  @Get(':stopId')
  @ApiOperation({
    summary: 'Get a station by stop ID',
    description:
      'Retrieves the full GTFS stop record for the given stop ID. ' +
      'Stop IDs are available via `/stations/search`, `/stations/nearby`, and in trip planner responses.',
  })
  @ApiParam({
    name: 'stopId',
    description: 'GTFS stop ID (e.g. 200060)',
    example: '200060',
  })
  @ApiOkResponse({ type: StationObject, description: 'Stop/station record' })
  @ApiNotFoundResponse({ description: 'No stop found for the given stopId' })
  async getById(@Param('stopId') stopId: string) {
    const station = await this.stationsService.findById(stopId);
    if (!station) throw new NotFoundException(`Station ${stopId} not found`);
    return station;
  }
}
