import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  ParseFloatPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { StationsService } from './stations.service';
import { StationObject } from './dto/station.object';

@ApiTags('stations')
@ApiSecurity('X-API-Key')
@Controller('stations')
export class StationsController {
  constructor(private readonly stationsService: StationsService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search for stations/stops by name' })
  @ApiOkResponse({ type: [StationObject] })
  @ApiQuery({ name: 'q', required: true, description: 'Search term' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  search(
    @Query('q') q: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.stationsService.search(q, limit ?? 20);
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Find stations near a coordinate' })
  @ApiOkResponse({ type: [StationObject] })
  @ApiQuery({ name: 'lat', required: true })
  @ApiQuery({ name: 'lon', required: true })
  @ApiQuery({
    name: 'radius',
    required: false,
    description: 'Radius in metres (default 500)',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
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
  @ApiOperation({ summary: 'Get a station by stop ID' })
  @ApiOkResponse({ type: StationObject })
  async getById(@Param('stopId') stopId: string) {
    const station = await this.stationsService.findById(stopId);
    if (!station) throw new NotFoundException(`Station ${stopId} not found`);
    return station;
  }
}
