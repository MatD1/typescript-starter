import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { StationsService } from './stations.service';

@ApiTags('stations')
@ApiSecurity('X-API-Key')
@Controller('stations')
export class StationsController {
  constructor(private readonly stationsService: StationsService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search for stations/stops by name' })
  @ApiQuery({ name: 'q', required: true, description: 'Search term' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  search(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.stationsService.search(q, limit ? Number(limit) : 20);
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Find stations near a coordinate' })
  @ApiQuery({ name: 'lat', required: true })
  @ApiQuery({ name: 'lon', required: true })
  @ApiQuery({
    name: 'radius',
    required: false,
    description: 'Radius in metres (default 500)',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  nearby(
    @Query('lat') lat: string,
    @Query('lon') lon: string,
    @Query('radius') radius?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stationsService.findNearby(
      Number(lat),
      Number(lon),
      radius ? Number(radius) : 500,
      limit ? Number(limit) : 20,
    );
  }

  @Get(':stopId')
  @ApiOperation({ summary: 'Get a station by stop ID' })
  async getById(@Param('stopId') stopId: string) {
    const station = await this.stationsService.findById(stopId);
    if (!station) throw new NotFoundException(`Station ${stopId} not found`);
    return station;
  }
}
