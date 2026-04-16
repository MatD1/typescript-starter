import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  ParseFloatPipe,
  ParseBoolPipe,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { TripPlannerService } from './trip-planner.service';
import {
  TripResultObject,
  TripPlannerResponseObject,
  StopObject,
  DepartureObject,
} from './dto/trip-planner.objects';

@ApiTags('trip-planner')
@ApiSecurity('X-API-Key')
@Controller('trip-planner')
export class TripPlannerController {
  constructor(private readonly tripPlannerService: TripPlannerService) { }

  @Get('trip')
  @ApiOperation({
    summary: 'Plan a journey between two locations',
    description:
      'Uses the TfNSW Trip Planner API to calculate optimal journeys between an origin and destination. ' +
      'At least one origin and one destination parameter must be provided. ' +
      'Use `originId` / `destId` for stop-ID based queries (fastest), ' +
      '`originCoord` / `destCoord` for coordinate-based queries (`lon:lat:EPSG:4326`), ' +
      'or `originName` / `destName` for text-based lookups.\n\n' +
      '**Pagination**: Use the `context` token from a previous response to load more trip options. ' +
      'Omit for the initial request.',
  })
  @ApiQuery({ name: 'originName', required: false, description: 'Origin stop name (text match)' })
  @ApiQuery({
    name: 'originId',
    required: false,
    description: 'Origin stop/location ID (preferred — faster than name lookup)',
    example: '10101100',
  })
  @ApiQuery({
    name: 'originCoord',
    required: false,
    description: 'Origin as WGS84 coordinate in `lon:lat:EPSG:4326` format (longitude first)',
    example: '151.2093:-33.8688:EPSG:4326',
  })
  @ApiQuery({ name: 'destName', required: false, description: 'Destination stop name (text match)' })
  @ApiQuery({ name: 'destId', required: false, description: 'Destination stop/location ID' })
  @ApiQuery({
    name: 'destCoord',
    required: false,
    description: 'Destination as WGS84 coordinate in `lon:lat:EPSG:4326` format',
    example: '151.1234:-33.7890:EPSG:4326',
  })
  @ApiQuery({
    name: 'itdDate',
    required: false,
    description: 'Departure date in YYYYMMDD format. Omit for today.',
    example: '20250415',
  })
  @ApiQuery({
    name: 'itdTime',
    required: false,
    description: 'Departure time in HHmm format (24 hour). Omit for now.',
    example: '0830',
  })
  @ApiQuery({
    name: 'calcNumberOfTrips',
    required: false,
    type: Number,
    description: 'Number of trip options to return (default 5)',
    example: 5,
  })
  @ApiQuery({
    name: 'wheelchair',
    required: false,
    type: Boolean,
    description: 'If true, only return wheelchair-accessible trip options',
  })
  @ApiQuery({
    name: 'context',
    required: false,
    description:
      'Pagination context token from a previous response. Provide this to load the next page of trips.',
  })
  @ApiOkResponse({
    type: TripPlannerResponseObject,
    description:
      'Journey plan with an array of trip options. Each trip has legs, duration, and interchange count. ' +
      'Pass the `context` token back to fetch the next batch of trip options.',
  })
  planTrip(
    @Query('originName') originName?: string,
    @Query('originId') originId?: string,
    @Query('originCoord') originCoord?: string,
    @Query('destName') destName?: string,
    @Query('destId') destId?: string,
    @Query('destCoord') destCoord?: string,
    @Query('itdDate') itdDate?: string,
    @Query('itdTime') itdTime?: string,
    @Query('calcNumberOfTrips', new ParseIntPipe({ optional: true }))
    calcNumberOfTrips?: number,
    @Query('wheelchair', new ParseBoolPipe({ optional: true }))
    wheelchair?: boolean,
    @Query('context') context?: string,
  ) {
    return this.tripPlannerService.planTrip({
      originName,
      originId,
      originCoord,
      destName,
      destId,
      destCoord,
      itdDate,
      itdTime,
      calcNumberOfTrips,
      wheelchair: wheelchair ?? false,
      context,
    });
  }

  @Get('stop-finder')
  @ApiOperation({
    summary: 'Search for stops and stations by name',
    description:
      'Queries the TfNSW Stop Finder to locate stops by name, ID, or coordinate. ' +
      'Useful for building search-as-you-type location pickers. ' +
      'The returned `id` fields can be passed directly as `originId` / `destId` to the trip planner.',
  })
  @ApiQuery({
    name: 'query',
    required: true,
    description: 'Search term (stop name, stop ID, or `lon:lat:EPSG:4326` for coordinate)',
    example: 'Central Station',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description:
      'Search type: `any` (name search, default), `stop` (query = stop ID), ' +
      '`coord` (query = lon:lat:EPSG:4326), `poi` (points of interest)',
    enum: ['any', 'stop', 'coord', 'poi'],
    example: 'any',
  })
  @ApiOkResponse({
    type: [StopObject],
    description: 'Array of matching stops/locations. Use `id` for subsequent trip planning calls.',
  })
  findStops(@Query('query') query: string, @Query('type') type?: string) {
    return this.tripPlannerService.findStops({
      name_sf: query,
      type_sf: type ?? 'any',
    });
  }

  @Get('departures')
  @ApiOperation({
    summary: 'Get real-time departure board for a stop',
    description:
      'Returns the next scheduled and real-time departure times from a stop or platform. ' +
      'Provide either `stopId` or `stopName` to identify the stop. ' +
      'Departures include planned and estimated (live) times where available.',
  })
  @ApiQuery({
    name: 'stopId',
    required: false,
    description: 'GTFS / TfNSW stop ID (preferred)',
    example: '200060',
  })
  @ApiQuery({
    name: 'stopName',
    required: false,
    description: 'Stop name (used if stopId is not provided)',
    example: 'Central Station',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Location type: `stop` (default) or `platform`',
    enum: ['stop', 'platform'],
  })
  @ApiQuery({
    name: 'itdDate',
    required: false,
    description: 'Date in YYYYMMDD format (omit for today)',
    example: '20250415',
  })
  @ApiQuery({
    name: 'itdTime',
    required: false,
    description: 'Time in HHmm format (omit for current time)',
    example: '0830',
  })
  @ApiOkResponse({
    type: [DepartureObject],
    description: 'Array of upcoming departures with real-time estimates where available',
  })
  getDepartures(
    @Query('stopId') stopId?: string,
    @Query('stopName') stopName?: string,
    @Query('type') type?: string,
    @Query('itdDate') itdDate?: string,
    @Query('itdTime') itdTime?: string,
  ) {
    return this.tripPlannerService.getDepartures({
      name_dm: stopId ?? stopName,
      type_dm: type ?? 'stop',
      itdDate,
      itdTime,
    });
  }

  @Get('nearby')
  @ApiOperation({
    summary: 'Find stops near coordinates',
    description:
      'Returns public transport stops within `radius` metres of a WGS84 coordinate. ' +
      'Useful for "stops near me" functionality. Results are ordered by distance ascending.',
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
    description: 'Search radius in metres (default 500)',
    example: 500,
  })
  @ApiOkResponse({
    type: [StopObject],
    description: 'Array of stops within the search radius, ordered by distance ascending',
  })
  searchNearby(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lon', ParseFloatPipe) lon: number,
    @Query('radius', new ParseIntPipe({ optional: true })) radius?: number,
  ) {
    return this.tripPlannerService.searchByCoord({
      coord: `${lon}:${lat}:EPSG:4326`,
      radius_1: radius ?? 500,
      type_1: 'BUS_POINT',
    });
  }
}
