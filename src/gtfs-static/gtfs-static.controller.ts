import { Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { GtfsStaticService } from './gtfs-static.service';
import { TRANSPORT_MODES } from '../transport/transport.types';

@ApiTags('gtfs-static')
@ApiSecurity('X-API-Key')
@Controller('gtfs-static')
export class GtfsStaticController {
  constructor(private readonly gtfsStaticService: GtfsStaticService) { }

  @Post('ingest')
  @ApiOperation({
    summary: 'Trigger GTFS static data ingestion (admin)',
    description:
      'Downloads and ingests GTFS static data from NSW Open Data. This runs automatically nightly; use this to trigger manually.',
  })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: TRANSPORT_MODES,
    description: 'Ingest single mode (omit for all)',
  })
  ingest(@Query('mode') mode?: string) {
    if (mode) return this.gtfsStaticService.ingestMode(mode);
    return this.gtfsStaticService.ingestAll();
  }

  @Get('routes')
  @ApiOperation({
    summary: 'List GTFS static routes (paginated)',
    description:
      'Returns a paginated envelope: `{ data, total, limit, offset, hasNextPage }`. ' +
      'Default limit is 100. Increment `offset` by `limit` to page through all records.',
  })
  @ApiQuery({ name: 'mode', required: false, enum: TRANSPORT_MODES })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max records to return (default 100)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of records to skip (default 0)' })
  @ApiOkResponse({
    description: 'Paginated list of routes',
    schema: {
      properties: {
        data: { type: 'array', items: { type: 'object' } },
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
        hasNextPage: { type: 'boolean' },
      },
    },
  })
  getRoutes(
    @Query('mode') mode?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.gtfsStaticService.getRoutes(
      mode,
      limit ? Number(limit) : 100,
      offset ? Number(offset) : 0,
    );
  }

  @Get('routes/count')
  @ApiOperation({ summary: 'Get total count of GTFS static routes' })
  @ApiQuery({ name: 'mode', required: false, enum: TRANSPORT_MODES })
  getRoutesCount(@Query('mode') mode?: string) {
    return this.gtfsStaticService.getRoutesCount(mode);
  }

  @Get('stops')
  @ApiOperation({
    summary: 'List GTFS static stops (paginated)',
    description:
      'Returns a paginated envelope: `{ data, total, limit, offset, hasNextPage }`. ' +
      'There are 2,000+ stops across all modes. Default limit is 100. ' +
      'Increment `offset` by `limit` to page through all records.',
  })
  @ApiQuery({ name: 'mode', required: false, enum: TRANSPORT_MODES })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max records to return (default 100)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of records to skip (default 0)' })
  @ApiOkResponse({
    description: 'Paginated list of stops',
    schema: {
      properties: {
        data: { type: 'array', items: { type: 'object' } },
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
        hasNextPage: { type: 'boolean' },
      },
    },
  })
  getStops(
    @Query('mode') mode?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.gtfsStaticService.getStops(
      mode,
      limit ? Number(limit) : 100,
      offset ? Number(offset) : 0,
    );
  }

  @Get('stops/count')
  @ApiOperation({ summary: 'Get total count of GTFS static stops' })
  @ApiQuery({ name: 'mode', required: false, enum: TRANSPORT_MODES })
  getStopsCount(@Query('mode') mode?: string) {
    return this.gtfsStaticService.getStopsCount(mode);
  }

  @Get('trips')
  @ApiOperation({
    summary: 'List GTFS static trips (paginated)',
    description:
      'Returns a paginated envelope: `{ data, total, limit, offset, hasNextPage }`. ' +
      'Default limit is 100. Increment `offset` by `limit` to page through all records.',
  })
  @ApiQuery({ name: 'routeId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max records to return (default 100)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of records to skip (default 0)' })
  @ApiOkResponse({
    description: 'Paginated list of trips',
    schema: {
      properties: {
        data: { type: 'array', items: { type: 'object' } },
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
        hasNextPage: { type: 'boolean' },
      },
    },
  })
  getTrips(
    @Query('routeId') routeId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.gtfsStaticService.getTrips(
      routeId,
      limit ? Number(limit) : 100,
      offset ? Number(offset) : 0,
    );
  }

  @Get('trips/count')
  @ApiOperation({ summary: 'Get total count of GTFS static trips' })
  @ApiQuery({ name: 'routeId', required: false })
  getTripsCount(@Query('routeId') routeId?: string) {
    return this.gtfsStaticService.getTripsCount(routeId);
  }

  @Get('stop-times')
  @ApiOperation({
    summary: 'List GTFS static stop times (paginated)',
    description:
      'Returns a paginated envelope: `{ data, total, limit, offset, hasNextPage }`. ' +
      'Default limit is 100. Increment `offset` by `limit` to page through all records.',
  })
  @ApiQuery({ name: 'tripId', required: false })
  @ApiQuery({ name: 'stopId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max records to return (default 100)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of records to skip (default 0)' })
  @ApiOkResponse({
    description: 'Paginated list of stop times',
    schema: {
      properties: {
        data: { type: 'array', items: { type: 'object' } },
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
        hasNextPage: { type: 'boolean' },
      },
    },
  })
  getStopTimes(
    @Query('tripId') tripId?: string,
    @Query('stopId') stopId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.gtfsStaticService.getStopTimes(
      tripId,
      stopId,
      limit ? Number(limit) : 100,
      offset ? Number(offset) : 0,
    );
  }
}
