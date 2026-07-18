import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  ParseIntPipe,
  ParseEnumPipe,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { GtfsStaticService } from './gtfs-static.service';
import { TRANSPORT_MODES, TransportModeEnum } from '../transport/transport.types';
import { AdminGuard } from '../auth/guards/admin.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import {
  PaginatedRoutesObject,
  PaginatedStopsObject,
  PaginatedTripsObject,
  PaginatedStopTimesObject,
} from './dto/gtfs-static.objects';

@ApiTags('gtfs-static')
@ApiSecurity('X-API-Key')
@Controller('gtfs-static')
export class GtfsStaticController {
  constructor(private readonly gtfsStaticService: GtfsStaticService) { }

  @Post('ingest')
  @UseGuards(AdminGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Trigger GTFS static data ingestion (admin only)',
    description:
      'Manual ingest via the bulletproof pipeline: static API key gate, HEAD/GET, Railway S3, ' +
      'per-feed transactional replace. Pass `mode`/`feed` to target one feed or logical mode; ' +
      'omit for the full catalog. Defaults to force=true (always re-download); pass force=false to allow Last-Modified skips.',
  })
  @ApiQuery({
    name: 'mode',
    required: false,
    description:
      'Logical mode (e.g. buses, lightrail) or feedKey (e.g. metro, buses/GSBC001). Alias of `feed`.',
  })
  @ApiQuery({
    name: 'feed',
    required: false,
    description:
      'Same as mode: feedKey or logical mode. Prefer this name for single-feed force ingest.',
  })
  @ApiQuery({
    name: 'force',
    required: false,
    type: Boolean,
    description:
      'When true (default), bypass Last-Modified/S3 skip and re-GET from TfNSW. Pass false to allow unchanged skips.',
  })
  ingest(
    @Query('mode') mode?: string,
    @Query('feed') feed?: string,
    @Query('force') force?: string,
  ) {
    const target = (feed ?? mode)?.trim() || undefined;
    // Default force=true for both full-catalog and single-feed (matches admin ingest).
    const forceFlag =
      force === undefined ? true : force === 'true' || force === '1';
    const options = { force: forceFlag };
    if (target) return this.gtfsStaticService.ingestMode(target, options);
    return this.gtfsStaticService.ingestAll(options);
  }

  @Get('ingest/status')
  @UseGuards(AdminGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'GTFS ingest catalog and last per-feed run status (admin only)',
  })
  ingestStatus() {
    return this.gtfsStaticService.getIngestStatus();
  }

  @Get('routes')
  @ApiOperation({
    summary: 'List GTFS static routes (paginated)',
    description:
      'Returns a paginated envelope: `{ data, total, limit, offset, hasNextPage }`. ' +
      'Default limit is 100. Increment `offset` by `limit` to page through all records.',
  })
  @ApiQuery({ name: 'mode', required: false, enum: TRANSPORT_MODES })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max records to return (default 100)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Number of records to skip (default 0)',
  })
  @ApiOkResponse({
    description: 'Paginated list of routes',
    type: PaginatedRoutesObject,
  })
  getRoutes(
    @Query('mode', new ParseEnumPipe(TransportModeEnum, { optional: true }))
    mode?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ) {
    return this.gtfsStaticService.getRoutes(mode, limit ?? 100, offset ?? 0);
  }

  @Get('routes/count')
  @ApiOperation({ summary: 'Get total count of GTFS static routes' })
  @ApiQuery({ name: 'mode', required: false, enum: TRANSPORT_MODES })
  getRoutesCount(
    @Query('mode', new ParseEnumPipe(TransportModeEnum, { optional: true }))
    mode?: string,
  ) {
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
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max records to return (default 100)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Number of records to skip (default 0)',
  })
  @ApiOkResponse({
    description: 'Paginated list of stops',
    type: PaginatedStopsObject,
  })
  getStops(
    @Query('mode', new ParseEnumPipe(TransportModeEnum, { optional: true }))
    mode?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ) {
    return this.gtfsStaticService.getStops(mode, limit ?? 100, offset ?? 0);
  }

  @Get('stops/count')
  @ApiOperation({ summary: 'Get total count of GTFS static stops' })
  @ApiQuery({ name: 'mode', required: false, enum: TRANSPORT_MODES })
  getStopsCount(
    @Query('mode', new ParseEnumPipe(TransportModeEnum, { optional: true }))
    mode?: string,
  ) {
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
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max records to return (default 100)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Number of records to skip (default 0)',
  })
  @ApiOkResponse({
    description: 'Paginated list of trips',
    type: PaginatedTripsObject,
  })
  getTrips(
    @Query('routeId') routeId?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ) {
    return this.gtfsStaticService.getTrips(routeId, limit ?? 100, offset ?? 0);
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
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max records to return (default 100)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Number of records to skip (default 0)',
  })
  @ApiOkResponse({
    description: 'Paginated list of stop times',
    type: PaginatedStopTimesObject,
  })
  getStopTimes(
    @Query('tripId') tripId?: string,
    @Query('stopId') stopId?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ) {
    return this.gtfsStaticService.getStopTimes(
      tripId,
      stopId,
      limit ?? 100,
      offset ?? 0,
    );
  }
}
