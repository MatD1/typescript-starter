import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { GtfsStaticService } from './gtfs-static.service';
import { TRANSPORT_MODES } from '../transport/transport.types';

@ApiTags('gtfs-static')
@ApiSecurity('X-API-Key')
@Controller('gtfs-static')
export class GtfsStaticController {
  constructor(private readonly gtfsStaticService: GtfsStaticService) {}

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
  @ApiOperation({ summary: 'List GTFS static routes' })
  @ApiQuery({ name: 'mode', required: false, enum: TRANSPORT_MODES })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getRoutes(@Query('mode') mode?: string, @Query('limit') limit?: string) {
    return this.gtfsStaticService.getRoutes(mode, limit ? Number(limit) : 100);
  }

  @Get('stops')
  @ApiOperation({ summary: 'List GTFS static stops' })
  @ApiQuery({ name: 'mode', required: false, enum: TRANSPORT_MODES })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getStops(@Query('mode') mode?: string, @Query('limit') limit?: string) {
    return this.gtfsStaticService.getStops(mode, limit ? Number(limit) : 100);
  }

  @Get('trips')
  @ApiOperation({ summary: 'List GTFS static trips' })
  @ApiQuery({ name: 'routeId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getTrips(@Query('routeId') routeId?: string, @Query('limit') limit?: string) {
    return this.gtfsStaticService.getTrips(
      routeId,
      limit ? Number(limit) : 100,
    );
  }
}
