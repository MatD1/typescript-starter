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
    const feed = await this.parseFeed(buffer, `vehiclepos:${mode}`);
    return feed.entity
      // `position` is optional per the GTFS-RT spec — a vehicle entity
      // without one used to fall back to (0,0), a real coordinate off the
      // coast of west Africa, rather than being recognised as positionless.
      // Dropping it entirely is safer than emitting fake "null island" data.
      .filter((e) => e.vehicle != null && e.vehicle.position != null)
      .map((e) => {
        const v = e.vehicle as NswVehiclePosition;
        const pos = v.position!;
        const vd = v.vehicle;
        return {
          vehicleId: vd?.id ?? e.id,
          tripId: v.trip?.tripId,
          routeId: v.trip?.routeId,
          directionId: v.trip?.directionId,
          startDate: v.trip?.startDate,
          startTime: v.trip?.startTime,
          tripScheduleRelationship: v.trip?.scheduleRelationship,
          latitude: pos.latitude,
          longitude: pos.longitude,
          bearing: pos.bearing,
          odometer: pos.odometer,
          speed: pos.speed,
          currentStopSequence: v.currentStopSequence,
          currentStopId: v.stopId,
          currentStatus: v.currentStatus,
          timestamp: v.timestamp,
          congestionLevel: v.congestionLevel,
          occupancyStatus: v.occupancyStatus,
          trackDirection: pos.trackDirection,
          vehicleLabel: vd?.label,
          licensePlate: vd?.licensePlate,
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
    const feed = await this.parseFeed(buffer, `tripupdates:${mode}`);
    return feed.entity
      .filter((e) => e.tripUpdate != null)
      .map((e) => {
        const tu = e.tripUpdate as NswTripUpdate;
        return {
          tripId: tu.trip.tripId ?? e.id,
          routeId: tu.trip.routeId,
          vehicleId: tu.vehicle?.id,
          vehicleLabel: tu.vehicle?.label,
          licensePlate: tu.vehicle?.licensePlate,
          vehicleModel: tu.vehicle?.tfnswVehicleDescriptor?.vehicleModel,
          airConditioned: tu.vehicle?.tfnswVehicleDescriptor?.airConditioned,
          wheelchairAccessible:
            tu.vehicle?.tfnswVehicleDescriptor?.wheelchairAccessible,
          performingPriorTrip:
            tu.vehicle?.tfnswVehicleDescriptor?.performingPriorTrip,
          specialVehicleAttributes:
            tu.vehicle?.tfnswVehicleDescriptor?.specialVehicleAttributes,
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
            arrivalUncertainty: stu.arrival?.uncertainty,
            departureDelay: stu.departure?.delay,
            departureTime: stu.departure?.time,
            departureUncertainty: stu.departure?.uncertainty,
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
    const feed = await this.parseFeed(buffer, `alerts:${mode}`);
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
            // Only set when the alert scopes to a specific trip occurrence
            // (e.g. "this alert applies to the CANCELED instance of trip X")
            // rather than the route/stop generally.
            tripStartDate: ie.trip?.startDate,
            tripStartTime: ie.trip?.startTime,
            tripScheduleRelationship: ie.trip?.scheduleRelationship,
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

  private async parseFeed(buffer: Buffer, context?: string) {
    try {
      const feed = await decodeFeedMessage(buffer);
      this.logUpdateBundles(feed, context);
      return feed;
    } catch (err) {
      this.logger.error(`Failed to decode GTFS-RT protobuf: ${String(err)}`);
      throw err;
    }
  }

  /**
   * TfNSW's `UpdateBundle` extension (field 1007 on FeedEntity) announces a
   * static-schedule bundle change alongside a list of trip IDs it cancels —
   * a real-time cancellation signal distinct from a trip_update's own
   * schedule_relationship. It was previously undecodable due to a proto
   * key-normalization bug; now that it decodes correctly we don't yet know
   * how often (if ever) TfNSW actually populates it for our modes, so this
   * logs every occurrence at warn level rather than silently wiring it into
   * cancellation counting — once we've observed real payloads in production,
   * the cancelled trip IDs can be fed into the same dedup-based counting
   * `history-aggregate.util.ts` already uses for trip_update-sourced
   * cancellations.
   */
  private logUpdateBundles(
    feed: Awaited<ReturnType<typeof decodeFeedMessage>>,
    context?: string,
  ): void {
    for (const entity of feed.entity) {
      if (!entity.update) continue;
      this.logger.warn(
        `GTFS-RT UpdateBundle received${context ? ` (${context})` : ''}: ` +
          `bundle=${entity.update.gtfsStaticBundle} sequence=${entity.update.updateSequence} ` +
          `cancelledTrips=[${entity.update.cancelledTrip.join(',')}]`,
      );
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

  /**
   * Extract text from a TranslatedString-shaped object, preferring an
   * English (or language-unset, which TfNSW uses to mean English) entry
   * over just blindly taking whichever translation TfNSW put first — only
   * matters if TfNSW ever sends multiple languages, but costs nothing to
   * get right now.
   */
  private firstTranslation(field: unknown): string | undefined {
    if (field == null) return undefined;
    const ts = field as {
      translation?: Array<{ text?: string; language?: string }>;
    };
    const translations = ts.translation ?? [];
    const english = translations.find(
      (t) => t.language == null || t.language.toLowerCase().startsWith('en'),
    );
    return (english ?? translations[0])?.text ?? undefined;
  }
}
