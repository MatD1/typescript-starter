import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  ParseFloatPipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TripPlannerService } from './trip-planner.service';

@ApiTags('trip-planner')
@ApiSecurity('X-API-Key')
@Controller('trip-planner')
export class TripPlannerController {
  constructor(private readonly tripPlannerService: TripPlannerService) {}

  @Get('trip')
  @ApiOperation({ summary: 'Plan a journey between two locations' })
  @ApiQuery({ name: 'originName', required: false })
  @ApiQuery({
    name: 'originId',
    required: false,
    description: 'Stop/location ID',
  })
  @ApiQuery({
    name: 'originCoord',
    required: false,
    description: 'lon:lat:EPSG:4326 (longitude first)',
  })
  @ApiQuery({ name: 'destName', required: false })
  @ApiQuery({ name: 'destId', required: false })
  @ApiQuery({
    name: 'destCoord',
    required: false,
    description: 'lon:lat:EPSG:4326 (longitude first)',
  })
  @ApiQuery({ name: 'itdDate', required: false, description: 'YYYYMMDD' })
  @ApiQuery({ name: 'itdTime', required: false, description: 'HHmm' })
  @ApiQuery({ name: 'calcNumberOfTrips', required: false, type: Number })
  @ApiQuery({
    name: 'wheelchair',
    required: false,
    type: Boolean,
    description: 'If true, only wheelchair-accessible options',
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
    });
  }

  @Get('stop-finder')
  @ApiOperation({ summary: 'Search for stops and stations by name' })
  @ApiQuery({ name: 'query', required: true, description: 'Search term' })
  @ApiQuery({
    name: 'type',
    required: false,
    description:
      'any (name search) | stop (query=stop ID) | coord (query=lon:lat:EPSG:4326) | poi',
  })
  findStops(@Query('query') query: string, @Query('type') type?: string) {
    return this.tripPlannerService.findStops({
      name_sf: query,
      type_sf: type ?? 'any',
    });
  }

  @Get('departures')
  @ApiOperation({ summary: 'Get departure board for a stop' })
  @ApiQuery({ name: 'stopId', required: false })
  @ApiQuery({ name: 'stopName', required: false })
  @ApiQuery({ name: 'type', required: false, description: 'stop, platform' })
  @ApiQuery({ name: 'itdDate', required: false, description: 'YYYYMMDD' })
  @ApiQuery({ name: 'itdTime', required: false, description: 'HHmm' })
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
  @ApiOperation({ summary: 'Find stops near coordinates' })
  @ApiQuery({ name: 'lat', required: true })
  @ApiQuery({ name: 'lon', required: true })
  @ApiQuery({
    name: 'radius',
    required: false,
    description: 'Radius in metres (default 500)',
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
