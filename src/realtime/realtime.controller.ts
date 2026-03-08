import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RealtimeService } from './realtime.service';
import { TRANSPORT_MODES } from '../transport/transport.types';
import type { TransportMode } from '../transport/transport.types';

@ApiTags('realtime')
@ApiSecurity('X-API-Key')
@Controller('realtime')
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Get('vehicles')
  @ApiOperation({ summary: 'Get live vehicle positions' })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: TRANSPORT_MODES,
    description: 'Transport mode (omit for all modes)',
  })
  getVehiclePositions(@Query('mode') mode?: TransportMode) {
    return this.realtimeService.getVehiclePositions(mode);
  }

  @Get('trip-updates')
  @ApiOperation({ summary: 'Get live trip updates' })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: TRANSPORT_MODES,
    description: 'Transport mode (omit for all modes)',
  })
  getTripUpdates(@Query('mode') mode?: TransportMode) {
    return this.realtimeService.getTripUpdates(mode);
  }
}
