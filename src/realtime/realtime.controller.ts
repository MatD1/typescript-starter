import {
  Controller,
  Get,
  NotFoundException,
  Query,
  ParseEnumPipe,
  Sse,
  MessageEvent,
  Res,
  Param,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Observable, fromEvent, map } from 'rxjs';
import { Response } from 'express';
import { RealtimeService } from './realtime.service';
import { VehicleStreamService } from './vehicle-stream.service';
import {
  TRANSPORT_MODES,
  TransportModeEnum,
} from '../transport/transport.types';
import type { TransportMode } from '../transport/transport.types';
import {
  RouteHeadwayObject,
} from './dto/headway.object';

@ApiTags('realtime')
@ApiSecurity('X-API-Key')
@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly vehicleStream: VehicleStreamService,
  ) { }

  @Get('headway')
  @ApiOperation({ summary: 'Pre-computed headway summary per route' })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: TransportModeEnum,
    description: 'Filter by transport mode',
  })
  async getHeadway(
    @Query('mode') mode?: TransportMode,
  ): Promise<RouteHeadwayObject[]> {
    return this.realtimeService.getHeadwayGroups(mode);
  }

  @Sse('vehicles/stream')
  @ApiOperation({ summary: 'SSE stream of all vehicle positions (15s push)' })
  async streamAllVehicles(): Promise<Observable<MessageEvent>> {
    // Send current state immediately before the stream starts
    const snapshot = await this.realtimeService.getVehiclePositions();
    const emitter = this.vehicleStream.getEmitter('all');

    return new Observable((subscriber) => {
      // Emit snapshot right away
      subscriber.next({ data: JSON.stringify(snapshot) } as MessageEvent);

      // Then relay future push events
      const handler = (payload: string) => {
        subscriber.next({ data: payload } as MessageEvent);
      };
      emitter.on('vehicles', handler);
      return () => emitter.off('vehicles', handler);
    });
  }

  @Sse('vehicles/:mode/stream')
  @ApiOperation({ summary: 'SSE stream of vehicle positions for one mode' })
  async streamModeVehicles(
    @Param('mode', new ParseEnumPipe(TransportModeEnum)) mode: TransportMode,
  ): Promise<Observable<MessageEvent>> {
    // Send current state immediately before the stream starts
    const snapshot = await this.realtimeService.getVehiclePositions(mode);
    const emitter = this.vehicleStream.getEmitter(mode);

    return new Observable((subscriber) => {
      // Emit snapshot right away
      subscriber.next({ data: JSON.stringify(snapshot) } as MessageEvent);

      // Then relay future push events
      const handler = (payload: string) => {
        subscriber.next({ data: payload } as MessageEvent);
      };
      emitter.on('vehicles', handler);
      return () => emitter.off('vehicles', handler);
    });
  }

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
