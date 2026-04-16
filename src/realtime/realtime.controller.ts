import {
  Controller,
  Get,
  NotFoundException,
  Query,
  ParseEnumPipe,
  Sse,
  MessageEvent,
  Param,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { RealtimeService } from './realtime.service';
import { VehicleStreamService } from './vehicle-stream.service';
import {
  TRANSPORT_MODES,
  TransportModeEnum,
} from '../transport/transport.types';
import type { TransportMode } from '../transport/transport.types';
import { RouteHeadwayObject } from './dto/headway.object';
import {
  VehiclePositionSwagger,
  TripUpdateSwagger,
  TrackedTripSwagger,
  RouteHeadwaySwagger,
} from './dto/realtime.swagger-schemas';

@ApiTags('realtime')
@ApiSecurity('X-API-Key')
@ApiExtraModels(
  VehiclePositionSwagger,
  TripUpdateSwagger,
  TrackedTripSwagger,
  RouteHeadwaySwagger,
)
@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly vehicleStream: VehicleStreamService,
  ) { }

  // ─── Headway ─────────────────────────────────────────────────────────────

  @Get('headway')
  @ApiOperation({
    summary: 'Pre-computed headway summary per route',
    description:
      'Returns a list of routes with per-vehicle spacing (headway) data. ' +
      'Vehicles are grouped by `routeId` + `directionId` and sorted oldest-first. ' +
      'The `gapSeconds` field is the time since the leading vehicle reported; ' +
      '`status` classifies the health of the spacing: **bunched** (<3m), **compressing** (3–7m), **healthy** (7–15m), **gapped** (>15m).',
  })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: TransportModeEnum,
    description: 'Filter by transport mode. Omit for all modes.',
  })
  @ApiOkResponse({
    type: [RouteHeadwaySwagger],
    description: 'Array of route headway groups',
  })
  async getHeadway(
    @Query('mode') mode?: TransportMode,
  ): Promise<RouteHeadwayObject[]> {
    return this.realtimeService.getHeadwayGroups(mode);
  }

  // ─── SSE Streams ──────────────────────────────────────────────────────────

  @Sse('vehicles/stream')
  @ApiOperation({
    summary: 'SSE stream — all vehicle positions (15-second push)',
    description:
      'Server-Sent Events stream that pushes the complete set of live vehicle positions every 15 seconds. ' +
      'An initial snapshot is delivered immediately on connection. ' +
      'Connect with `EventSource` or `curl -N`. Each event `data` field is a JSON array of `VehiclePosition` objects.',
  })
  @ApiOkResponse({ description: 'text/event-stream of VehiclePosition JSON arrays' })
  async streamAllVehicles(): Promise<Observable<MessageEvent>> {
    const snapshot = await this.realtimeService.getVehiclePositions();
    const emitter = this.vehicleStream.getEmitter('all');

    return new Observable((subscriber) => {
      subscriber.next({ data: JSON.stringify(snapshot) } as MessageEvent);
      const handler = (payload: string) => {
        subscriber.next({ data: payload } as MessageEvent);
      };
      emitter.on('vehicles', handler);
      return () => emitter.off('vehicles', handler);
    });
  }

  @Sse('vehicles/:mode/stream')
  @ApiOperation({
    summary: 'SSE stream — vehicle positions for one transport mode',
    description:
      'Server-Sent Events stream filtered to a single transport mode. ' +
      'Follows the same push cadence and initial-snapshot behaviour as the unfiltered stream.',
  })
  @ApiParam({
    name: 'mode',
    enum: TransportModeEnum,
    description: 'Transport mode to stream (e.g. sydneytrains, buses)',
  })
  @ApiOkResponse({ description: 'text/event-stream of VehiclePosition JSON arrays for the specified mode' })
  async streamModeVehicles(
    @Param('mode', new ParseEnumPipe(TransportModeEnum)) mode: TransportMode,
  ): Promise<Observable<MessageEvent>> {
    const snapshot = await this.realtimeService.getVehiclePositions(mode);
    const emitter = this.vehicleStream.getEmitter(mode);

    return new Observable((subscriber) => {
      subscriber.next({ data: JSON.stringify(snapshot) } as MessageEvent);
      const handler = (payload: string) => {
        subscriber.next({ data: payload } as MessageEvent);
      };
      emitter.on('vehicles', handler);
      return () => emitter.off('vehicles', handler);
    });
  }

  // ─── REST Snapshots ───────────────────────────────────────────────────────

  @Get('vehicles')
  @ApiOperation({
    summary: 'Live vehicle positions (point-in-time snapshot)',
    description:
      'Returns the most recently reported position for every active vehicle. ' +
      'Data is cached and refreshed from TfNSW in the background. ' +
      'For a live push-based feed use the `/vehicles/stream` SSE endpoint instead.',
  })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: TRANSPORT_MODES,
    description: 'Transport mode filter. Omit to receive all modes.',
  })
  @ApiOkResponse({
    type: [VehiclePositionSwagger],
    description: 'Array of live vehicle positions',
  })
  getVehiclePositions(
    @Query('mode', new ParseEnumPipe(TransportModeEnum, { optional: true }))
    mode?: TransportMode,
  ) {
    return this.realtimeService.getVehiclePositions(mode);
  }

  @Get('trip-updates')
  @ApiOperation({
    summary: 'Live trip updates (delays, cancellations)',
    description:
      'Returns real-time delay and cancellation information for all active trips. ' +
      'Each entry includes per-stop arrival and departure predictions via `stopTimeUpdates`.',
  })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: TRANSPORT_MODES,
    description: 'Transport mode filter. Omit to receive all modes.',
  })
  @ApiOkResponse({
    type: [TripUpdateSwagger],
    description: 'Array of live trip updates with stop-level predictions',
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
      'for a specific GTFS trip ID. Use the `tripId` field from a planned journey leg. ' +
      'A `mode` hint is optional but reduces response latency by skipping irrelevant feeds. ' +
      'Returns **404** if the vehicle is not yet broadcasting (e.g. pre-departure).',
  })
  @ApiQuery({
    name: 'tripId',
    required: true,
    description: 'GTFS trip ID, obtained from the `tripId` field of a `/trip-planner/trip` journey leg',
  })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: TRANSPORT_MODES,
    description: 'Transport mode hint — improves response time but is optional',
  })
  @ApiOkResponse({ type: TrackedTripSwagger, description: 'Live trip tracking result' })
  @ApiNotFoundResponse({ description: 'Trip not found — vehicle may not have started yet' })
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
