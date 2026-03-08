import { Injectable, Logger } from '@nestjs/common';
import { decodeFeedMessage } from '../common/gtfs/nsw-proto.loader';
import type {
  NswVehiclePosition,
  NswTripUpdate,
  NswAlert,
  NswCarriageDescriptor,
} from '../common/gtfs/nsw-proto.loader';
import { TransportService } from './transport.service';
import type { GtfsRtFeedType, TransportMode } from './transport.types';

// Re-export NSW-typed interfaces so callers don't need to know about the loader
export type {
  VehiclePosition,
  TripUpdate,
  StopTimeUpdate,
  ServiceAlert,
  CarriageDescriptor,
  TfnswVehicleDescriptor,
} from './nsw-gtfs-rt.types';

@Injectable()
export class GtfsRealtimeService {
  private readonly logger = new Logger(GtfsRealtimeService.name);

  constructor(private readonly transportService: TransportService) {}

  async getVehiclePositions(
    mode: TransportMode,
  ): Promise<import('./nsw-gtfs-rt.types').VehiclePosition[]> {
    const buffer = await this.transportService.getGtfsRealtime(
      'vehiclepos',
      mode,
    );
    const feed = await this.parseFeed(buffer);
    return feed.entity
      .filter((e) => e.vehicle != null)
      .map((e) => {
        const v = e.vehicle as NswVehiclePosition;
        const pos = v.position;
        const vd = v.vehicle;
        return {
          vehicleId: vd?.id ?? e.id,
          tripId: v.trip?.tripId,
          routeId: v.trip?.routeId,
          directionId: v.trip?.directionId,
          startDate: v.trip?.startDate,
          startTime: v.trip?.startTime,
          tripScheduleRelationship: v.trip?.scheduleRelationship,
          latitude: pos?.latitude ?? 0,
          longitude: pos?.longitude ?? 0,
          bearing: pos?.bearing,
          odometer: pos?.odometer,
          speed: pos?.speed,
          currentStopSequence: v.currentStopSequence,
          currentStopId: v.stopId,
          currentStatus: v.currentStatus,
          timestamp: v.timestamp,
          congestionLevel: v.congestionLevel,
          occupancyStatus: v.occupancyStatus,
          trackDirection: pos?.trackDirection,
          vehicleLabel: vd?.label,
          vehicleModel: vd?.tfnswVehicleDescriptor?.vehicleModel,
          airConditioned: vd?.tfnswVehicleDescriptor?.airConditioned,
          wheelchairAccessible:
            vd?.tfnswVehicleDescriptor?.wheelchairAccessible,
          performingPriorTrip:
            vd?.tfnswVehicleDescriptor?.performingPriorTrip,
          specialVehicleAttributes:
            vd?.tfnswVehicleDescriptor?.specialVehicleAttributes,
          consist: (v.consist ?? []).map(this.mapCarriage),
        };
      });
  }

  async getTripUpdates(
    mode: TransportMode,
  ): Promise<import('./nsw-gtfs-rt.types').TripUpdate[]> {
    const buffer = await this.transportService.getGtfsRealtime(
      'tripupdates',
      mode,
    );
    const feed = await this.parseFeed(buffer);
    return feed.entity
      .filter((e) => e.tripUpdate != null)
      .map((e) => {
        const tu = e.tripUpdate as NswTripUpdate;
        return {
          tripId: tu.trip.tripId ?? e.id,
          routeId: tu.trip.routeId,
          vehicleId: tu.vehicle?.id,
          vehicleLabel: tu.vehicle?.label,
          directionId: tu.trip.directionId,
          startDate: tu.trip.startDate,
          startTime: tu.trip.startTime,
          scheduleRelationship: tu.trip.scheduleRelationship,
          delay: tu.delay,
          timestamp: tu.timestamp,
          stopTimeUpdates: (tu.stopTimeUpdate ?? []).map((stu) => ({
            stopSequence: stu.stopSequence,
            stopId: stu.stopId,
            arrivalDelay: stu.arrival?.delay,
            arrivalTime: stu.arrival?.time,
            departureDelay: stu.departure?.delay,
            departureTime: stu.departure?.time,
            scheduleRelationship: stu.scheduleRelationship,
            departureOccupancyStatus: stu.departureOccupancyStatus,
            carriagePredictiveOccupancy: (
              stu.carriageSeqPredictiveOccupancy ?? []
            ).map(this.mapCarriage),
          })),
        };
      });
  }

  async getAlerts(
    mode: TransportMode,
  ): Promise<import('./nsw-gtfs-rt.types').ServiceAlert[]> {
    const buffer = await this.transportService.getGtfsRealtime('alerts', mode);
    const feed = await this.parseFeed(buffer);
    return feed.entity
      .filter((e) => e.alert != null)
      .map((e) => {
        const a = e.alert as NswAlert;
        return {
          id: e.id,
          headerText: this.firstTranslation(a.headerText),
          descriptionText: this.firstTranslation(a.descriptionText),
          ttsHeaderText: this.firstTranslation(a.ttsHeaderText),
          ttsDescriptionText: this.firstTranslation(a.ttsDescriptionText),
          url: this.firstTranslation(a.url),
          cause: a.cause,
          effect: a.effect,
          severityLevel: a.severityLevel,
          activePeriods: (a.activePeriod ?? []).map((p) => ({
            start: p.start,
            end: p.end,
          })),
          informedEntities: (a.informedEntity ?? []).map((ie) => ({
            agencyId: ie.agencyId,
            routeId: ie.routeId,
            routeType: ie.routeType,
            stopId: ie.stopId,
            tripId: ie.trip?.tripId,
            directionId: ie.directionId,
          })),
        };
      });
  }

  async getFeedForTypes(
    feedType: GtfsRtFeedType,
    modes: TransportMode[],
  ): Promise<Buffer[]> {
    return Promise.all(
      modes.map((m) => this.transportService.getGtfsRealtime(feedType, m)),
    );
  }

  private async parseFeed(buffer: Buffer) {
    try {
      return await decodeFeedMessage(buffer);
    } catch (err) {
      this.logger.error(`Failed to decode GTFS-RT protobuf: ${String(err)}`);
      throw err;
    }
  }

  private mapCarriage(
    c: NswCarriageDescriptor,
  ): import('./nsw-gtfs-rt.types').CarriageDescriptor {
    return {
      name: c.name,
      positionInConsist: c.positionInConsist,
      occupancyStatus: c.occupancyStatus,
      quietCarriage: c.quietCarriage,
      toilet: c.toilet,
      luggageRack: c.luggageRack,
      departureOccupancyStatus: c.departureOccupancyStatus,
    };
  }

  /** Extract the first translation text from a TranslatedString-shaped object */
  private firstTranslation(
    field: unknown,
  ): string | undefined {
    if (field == null) return undefined;
    const ts = field as { translation?: Array<{ text?: string }> };
    return ts.translation?.[0]?.text ?? undefined;
  }
}
