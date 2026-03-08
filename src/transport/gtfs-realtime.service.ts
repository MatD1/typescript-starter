import { Injectable, Logger } from '@nestjs/common';
import { transit_realtime } from 'gtfs-realtime-bindings';
import { TransportService } from './transport.service';
import { GtfsRtFeedType, TransportMode } from './transport.types';

export interface VehiclePosition {
  vehicleId: string;
  tripId?: string;
  routeId?: string;
  latitude: number;
  longitude: number;
  bearing?: number;
  speed?: number;
  currentStopId?: string;
  currentStatus?: string;
  timestamp?: number;
  congestionLevel?: string;
  occupancyStatus?: string;
}

export interface StopTimeUpdate {
  stopSequence?: number;
  stopId?: string;
  arrivalDelay?: number;
  arrivalTime?: number;
  departureDelay?: number;
  departureTime?: number;
  scheduleRelationship?: string;
}

export interface TripUpdate {
  tripId: string;
  routeId?: string;
  vehicleId?: string;
  directionId?: number;
  startDate?: string;
  startTime?: string;
  scheduleRelationship?: string;
  stopTimeUpdates: StopTimeUpdate[];
  timestamp?: number;
}

export interface ServiceAlert {
  id: string;
  headerText?: string;
  descriptionText?: string;
  url?: string;
  cause?: string;
  effect?: string;
  severity?: string;
  activePeriods: Array<{ start?: number; end?: number }>;
  informedEntities: Array<{
    agencyId?: string;
    routeId?: string;
    stopId?: string;
    tripId?: string;
  }>;
}

@Injectable()
export class GtfsRealtimeService {
  private readonly logger = new Logger(GtfsRealtimeService.name);

  constructor(private readonly transportService: TransportService) {}

  async getVehiclePositions(mode: TransportMode): Promise<VehiclePosition[]> {
    const buffer = await this.transportService.getGtfsRealtime(
      'vehiclepos',
      mode,
    );
    const feed = this.parseFeed(buffer);
    return feed.entity
      .filter((e) => e.vehicle != null)
      .map((e) => {
        const v = e.vehicle;
        const pos = v.position;
        return {
          vehicleId: v.vehicle?.id ?? e.id,
          tripId: v.trip?.tripId ?? undefined,
          routeId: v.trip?.routeId ?? undefined,
          latitude: pos?.latitude ?? 0,
          longitude: pos?.longitude ?? 0,
          bearing: pos?.bearing ?? undefined,
          speed: pos?.speed ?? undefined,
          currentStopId: v.stopId ?? undefined,
          currentStatus:
            v.currentStatus != null
              ? transit_realtime.VehiclePosition.VehicleStopStatus[
                  v.currentStatus
                ]
              : undefined,
          timestamp: v.timestamp != null ? Number(v.timestamp) : undefined,
          congestionLevel:
            v.congestionLevel != null
              ? transit_realtime.VehiclePosition.CongestionLevel[
                  v.congestionLevel
                ]
              : undefined,
          occupancyStatus:
            v.occupancyStatus != null
              ? transit_realtime.VehiclePosition.OccupancyStatus[
                  v.occupancyStatus
                ]
              : undefined,
        } satisfies VehiclePosition;
      });
  }

  async getTripUpdates(mode: TransportMode): Promise<TripUpdate[]> {
    const buffer = await this.transportService.getGtfsRealtime(
      'tripupdates',
      mode,
    );
    const feed = this.parseFeed(buffer);
    return feed.entity
      .filter((e) => e.tripUpdate != null)
      .map((e) => {
        const tu = e.tripUpdate;
        return {
          tripId: tu.trip.tripId ?? e.id,
          routeId: tu.trip.routeId ?? undefined,
          vehicleId: tu.vehicle?.id ?? undefined,
          directionId: tu.trip.directionId ?? undefined,
          startDate: tu.trip.startDate ?? undefined,
          startTime: tu.trip.startTime ?? undefined,
          scheduleRelationship:
            tu.trip.scheduleRelationship != null
              ? transit_realtime.TripDescriptor.ScheduleRelationship[
                  tu.trip.scheduleRelationship
                ]
              : undefined,
          stopTimeUpdates: (tu.stopTimeUpdate ?? []).map((stu) => ({
            stopSequence: stu.stopSequence ?? undefined,
            stopId: stu.stopId ?? undefined,
            arrivalDelay: stu.arrival?.delay ?? undefined,
            arrivalTime:
              stu.arrival?.time != null ? Number(stu.arrival.time) : undefined,
            departureDelay: stu.departure?.delay ?? undefined,
            departureTime:
              stu.departure?.time != null
                ? Number(stu.departure.time)
                : undefined,
            scheduleRelationship:
              stu.scheduleRelationship != null
                ? transit_realtime.TripUpdate.StopTimeUpdate
                    .ScheduleRelationship[stu.scheduleRelationship]
                : undefined,
          })),
          timestamp: tu.timestamp != null ? Number(tu.timestamp) : undefined,
        } satisfies TripUpdate;
      });
  }

  async getAlerts(mode: TransportMode): Promise<ServiceAlert[]> {
    const buffer = await this.transportService.getGtfsRealtime('alerts', mode);
    const feed = this.parseFeed(buffer);
    return feed.entity
      .filter((e) => e.alert != null)
      .map((e) => {
        const a = e.alert;
        const header = a.headerText?.translation?.[0]?.text;
        const description = a.descriptionText?.translation?.[0]?.text;
        const url = a.url?.translation?.[0]?.text;
        return {
          id: e.id,
          headerText: header ?? undefined,
          descriptionText: description ?? undefined,
          url: url ?? undefined,
          cause:
            a.cause != null ? transit_realtime.Alert.Cause[a.cause] : undefined,
          effect:
            a.effect != null
              ? transit_realtime.Alert.Effect[a.effect]
              : undefined,
          severity:
            (a as unknown as { severityLevel?: number }).severityLevel != null
              ? String(
                  (a as unknown as { severityLevel: number }).severityLevel,
                )
              : undefined,
          activePeriods: (a.activePeriod ?? []).map((p) => ({
            start: p.start != null ? Number(p.start) : undefined,
            end: p.end != null ? Number(p.end) : undefined,
          })),
          informedEntities: (a.informedEntity ?? []).map((ie) => ({
            agencyId: ie.agencyId ?? undefined,
            routeId: ie.routeId ?? undefined,
            stopId: ie.stopId ?? undefined,
            tripId: ie.trip?.tripId ?? undefined,
          })),
        } satisfies ServiceAlert;
      });
  }

  private parseFeed(buffer: Buffer): transit_realtime.FeedMessage {
    try {
      return transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    } catch (err) {
      this.logger.error(`Failed to decode GTFS-RT protobuf: ${String(err)}`);
      throw err;
    }
  }

  async getFeedForTypes(
    feedType: GtfsRtFeedType,
    modes: TransportMode[],
  ): Promise<Buffer[]> {
    return Promise.all(
      modes.map((m) => this.transportService.getGtfsRealtime(feedType, m)),
    );
  }
}
