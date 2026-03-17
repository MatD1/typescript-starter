import {
  Controller,
  Get,
  NotFoundException,
  Query,
  ParseEnumPipe,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RealtimeService } from './realtime.service';
import { TRANSPORT_MODES, TransportModeEnum } from '../transport/transport.types';
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
  getVehiclePositions(
    @Query('mode', new ParseEnumPipe(TransportModeEnum, { optional: true }))
    mode?: TransportMode,
  ) {
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
  getTripUpdates(
    @Query('mode', new ParseEnumPipe(TransportModeEnum, { optional: true }))
    mode?: TransportMode,
  ) {
    return this.realtimeService.getTripUpdates(mode);
  }

  @Get('track-trip')
  @ApiOperation({
    summary: 'Track a specific trip live',
    description:
      'Returns the live vehicle position, delay information, and vehicle amenities ' +
      'for a specific GTFS trip ID. Use the `tripId` field from a planned journey leg ' +
      'to call this endpoint. Returns 404 if the vehicle is not yet active.',
  })
  @ApiQuery({
    name: 'tripId',
    required: true,
    description: 'GTFS trip ID (from a planned journey leg)',
  })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: TRANSPORT_MODES,
    description: 'Transport mode hint — improves response time but is optional',
  })
  async trackTrip(
    @Query('tripId') tripId: string,
    @Query('mode', new ParseEnumPipe(TransportModeEnum, { optional: true }))
    mode?: TransportMode,
  ) {
    const result = await this.realtimeService.trackTrip(tripId, mode);
    if (!result) {
      throw new NotFoundException(
        `Trip ${tripId} is not currently active. The vehicle may not have departed yet.`,
      );
    }
    return result;
  }
}
