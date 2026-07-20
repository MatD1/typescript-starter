import { Injectable } from '@nestjs/common';
import { GtfsRealtimeService } from '../transport/gtfs-realtime.service';
import type {
  VehiclePosition,
  TripUpdate,
} from '../transport/gtfs-realtime.service';
import { GtfsStaticService } from '../gtfs-static/gtfs-static.service';
import { CacheService } from '../cache/cache.service';
import { CacheTTL } from '../cache/cache.constants';
import { lineFor } from '../history/line-identity.util';
import { TRANSPORT_MODES } from '../transport/transport.types';
import type { TransportMode } from '../transport/transport.types';
import type { TrackedTripObject } from './dto/tracked-trip.object';
import {
  RouteHeadwayObject,
  HeadwayStatus,
  VehicleHeadwayObject,
} from './dto/headway.object';

type WithMode<T> = T & { mode: string };
type WithRouteMetadata<T> = T & { lineCode?: string; routeColour?: string };

/** Modes with their own NSW API endpoint. Intercity is filtered from sydneytrains. */
const API_MODES: TransportMode[] = [
  'sydneytrains',
  'buses',
  'nswtrains',
  'ferries',
  'metro',
  'lightrail',
];

@Injectable()
export class RealtimeService {
  constructor(
    private readonly gtfsRt: GtfsRealtimeService,
    private readonly cache: CacheService,
    private readonly gtfsStaticService: GtfsStaticService,
  ) {}

  async getHeadwayGroups(mode?: TransportMode): Promise<RouteHeadwayObject[]> {
    const vehicles = await this.getVehiclePositions(mode);

    // 1. Group by routeId + directionId
    const groups = new Map<string, typeof vehicles>();
    for (const v of vehicles) {
      if (!v.routeId) continue;
      const key = `${v.routeId}:${v.directionId ?? 0}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(v);
    }

    const result: RouteHeadwayObject[] = [];

    // 2. Process each group
    for (const [key, groupVehicles] of groups.entries()) {
      const [routeId, directionIdStr] = key.split(':');
      const directionId = parseInt(directionIdStr, 10);

      // Sort by timestamp ascending (oldest first = furthest ahead on route)
      groupVehicles.sort((a, b) => {
        if (a.timestamp !== undefined && b.timestamp !== undefined) {
          return a.timestamp - b.timestamp;
        }
        return 0;
      });

      const vehicleHeadways: VehicleHeadwayObject[] = [];

      // First vehicle in group has no predecessor
      vehicleHeadways.push({
        vehicleId: groupVehicles[0].vehicleId,
        status: HeadwayStatus.UNKNOWN,
      });

      // Compute gaps for subsequent vehicles
      for (let i = 1; i < groupVehicles.length; i++) {
        const leading = groupVehicles[i - 1];
        const trailing = groupVehicles[i];
        const gap = this.computeHeadwaySeconds(leading, trailing);
        const status = this.classifyHeadway(gap);

        vehicleHeadways.push({
          vehicleId: trailing.vehicleId,
          gapSeconds: gap,
          status,
        });
      }

      result.push({
        routeId,
        directionId,
        vehicles: vehicleHeadways,
      });
    }

    return result;
  }

  private computeHeadwaySeconds(
    leading: VehiclePosition,
    trailing: VehiclePosition,
  ): number | undefined {
    // Prefer timestamp difference
    if (leading.timestamp !== undefined && trailing.timestamp !== undefined) {
      return Math.abs(trailing.timestamp - leading.timestamp);
    }

    // Fallback: geographic distance @ 40 km/h
    const distKm = this.haversineKm(
      leading.latitude,
      leading.longitude,
      trailing.latitude,
      trailing.longitude,
    );
    return Math.round((distKm / 40.0) * 3600);
  }

  private haversineKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const r = 6371.0;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private classifyHeadway(seconds?: number): HeadwayStatus {
    if (seconds === undefined) return HeadwayStatus.UNKNOWN;
    if (seconds < 180) return HeadwayStatus.BUNCHED;
    if (seconds < 420) return HeadwayStatus.COMPRESSING;
    if (seconds < 900) return HeadwayStatus.HEALTHY;
    return HeadwayStatus.GAPPED;
  }

  async getVehiclePositions(
    mode?: TransportMode,
  ): Promise<WithRouteMetadata<WithMode<VehiclePosition>>[]> {
    const modes = mode ? [mode] : ([...TRANSPORT_MODES] as TransportMode[]);
    const results = await Promise.allSettled(
      modes.map(async (m) => {
        if (m === 'intercity') {
          return this.getIntercityVehiclePositions();
        }
        const cacheKey = `realtime:vehicles:${m}`;
        const data = await this.cache.getOrSet(
          cacheKey,
          () => this.gtfsRt.getVehiclePositions(m),
          CacheTTL.VEHICLE_POSITIONS,
        );
        return data.map((v): WithMode<VehiclePosition> => ({ ...v, mode: m }));
      }),
    );
    const vehicles = results
      .filter(
        <T>(r: PromiseSettledResult<T>): r is PromiseFulfilledResult<T> =>
          r.status === 'fulfilled',
      )
      .flatMap((r) => r.value);
    return this.enrichWithRouteMetadata(vehicles);
  }

  private async getIntercityVehiclePositions(): Promise<
    WithRouteMetadata<WithMode<VehiclePosition>>[]
  > {
    const cacheKey = 'realtime:vehicles:intercity';
    const cached = await this.cache.get<WithMode<VehiclePosition>[]>(cacheKey);
    const filtered = cached ?? (await this.fetchIntercityVehiclePositions());
    if (!cached) {
      await this.cache.set(cacheKey, filtered, CacheTTL.VEHICLE_POSITIONS);
    }
    return this.enrichWithRouteMetadata(filtered);
  }

  private async fetchIntercityVehiclePositions(): Promise<
    WithMode<VehiclePosition>[]
  > {
    const [sydneytrainsData, intercityRouteIds] = await Promise.all([
      this.cache.getOrSet(
        'realtime:vehicles:sydneytrains',
        () => this.gtfsRt.getVehiclePositions('sydneytrains'),
        CacheTTL.VEHICLE_POSITIONS,
      ),
      this.gtfsStaticService.getIntercityRouteIds(),
    ]);

    return sydneytrainsData
      .filter((v) => v.routeId && intercityRouteIds.has(v.routeId))
      .map((v): WithMode<VehiclePosition> => ({ ...v, mode: 'intercity' }));
  }

  async getTripUpdates(
    mode?: TransportMode,
  ): Promise<WithRouteMetadata<WithMode<TripUpdate>>[]> {
    const modes = mode ? [mode] : ([...TRANSPORT_MODES] as TransportMode[]);
    const results = await Promise.allSettled(
      modes.map(async (m) => {
        if (m === 'intercity') {
          return this.getIntercityTripUpdates();
        }
        const cacheKey = `realtime:tripupdates:${m}`;
        const data = await this.cache.getOrSet(
          cacheKey,
          () => this.gtfsRt.getTripUpdates(m),
          CacheTTL.TRIP_UPDATES,
        );
        return data.map((t): WithMode<TripUpdate> => ({ ...t, mode: m }));
      }),
    );
    const updates = results
      .filter(
        <T>(r: PromiseSettledResult<T>): r is PromiseFulfilledResult<T> =>
          r.status === 'fulfilled',
      )
      .flatMap((r) => r.value);
    return this.enrichWithRouteMetadata(updates);
  }

  private async getIntercityTripUpdates(): Promise<
    WithRouteMetadata<WithMode<TripUpdate>>[]
  > {
    const cacheKey = 'realtime:tripupdates:intercity';
    const cached = await this.cache.get<WithMode<TripUpdate>[]>(cacheKey);
    const filtered = cached ?? (await this.fetchIntercityTripUpdates());
    if (!cached) {
      await this.cache.set(cacheKey, filtered, CacheTTL.TRIP_UPDATES);
    }
    return this.enrichWithRouteMetadata(filtered);
  }

  private async fetchIntercityTripUpdates(): Promise<WithMode<TripUpdate>[]> {
    const [sydneytrainsData, intercityRouteIds] = await Promise.all([
      this.cache.getOrSet(
        'realtime:tripupdates:sydneytrains',
        () => this.gtfsRt.getTripUpdates('sydneytrains'),
        CacheTTL.TRIP_UPDATES,
      ),
      this.gtfsStaticService.getIntercityRouteIds(),
    ]);

    return sydneytrainsData
      .filter((t) => t.routeId && intercityRouteIds.has(t.routeId))
      .map((t): WithMode<TripUpdate> => ({ ...t, mode: 'intercity' }));
  }

  private async enrichWithRouteMetadata<T extends { routeId?: string }>(
    items: T[],
  ): Promise<(T & { lineCode?: string; routeColour?: string })[]> {
    const routeMap = await this.gtfsStaticService.getRouteMetadataMap();
    return items.map((item) => {
      const meta = item.routeId ? routeMap.get(item.routeId) : undefined;
      return {
        ...item,
        lineCode: meta?.lineCode,
        routeColour: meta?.routeColour,
      };
    });
  }

  /**
   * Finds the live vehicle and trip-update data for a specific GTFS trip ID.
   *
   * Both vehiclepos and tripupdates feeds are already Redis-cached per mode,
   * so this join incurs zero extra NSW API calls in the common case.
   *
   * @param tripId  - GTFS trip ID (from a planned journey leg)
   * @param mode    - Optional mode hint. Providing the correct mode makes the
   *                  lookup ~7x faster by skipping all other modes.
   * @returns Joined TrackedTripObject, or null if the trip is not yet active.
   */
  async trackTrip(
    tripId: string,
    mode?: TransportMode,
    reference: {
      scheduledTripId?: string;
      routeId?: string;
      startDate?: string;
      startTime?: string;
      directionId?: number;
    } = {},
  ): Promise<TrackedTripObject | null> {
    const cacheKey = `realtime:track:${mode ?? 'all'}:${tripId}:${reference.scheduledTripId ?? ''}:${reference.routeId ?? ''}:${reference.startDate ?? ''}:${reference.startTime ?? ''}:${reference.directionId ?? ''}`;
    const cached = await this.cache.get<TrackedTripObject | null>(cacheKey);
    if (cached !== undefined && cached !== null) return cached;

    const modes = mode ? [mode] : ([...TRANSPORT_MODES] as TransportMode[]);

    // Fetch both feeds concurrently for each mode, then search for the tripId.
    for (const m of modes) {
      const [vehicles, updates] = await Promise.allSettled([
        m === 'intercity'
          ? this.getIntercityVehiclePositions()
          : this.cache.getOrSet(
              `realtime:vehicles:${m}`,
              () => this.gtfsRt.getVehiclePositions(m),
              CacheTTL.VEHICLE_POSITIONS,
            ),
        m === 'intercity'
          ? this.getIntercityTripUpdates()
          : this.cache.getOrSet(
              `realtime:tripupdates:${m}`,
              () => this.gtfsRt.getTripUpdates(m),
              CacheTTL.TRIP_UPDATES,
            ),
      ]);

      const vehicleList = vehicles.status === 'fulfilled' ? vehicles.value : [];
      const updateList = updates.status === 'fulfilled' ? updates.value : [];

      const tripUpdate = this.findRealtimeMatch(updateList, tripId, reference);
      // Prefer the vehicle carrying the matched update's tripId; otherwise
      // run the same layered matcher over the position feed.
      const vehicle =
        (tripUpdate?.tripId != null
          ? vehicleList.find((v) => v.tripId === tripUpdate.tripId)
          : undefined) ??
        this.findRealtimeMatch(vehicleList, tripId, reference);

      if (!vehicle && !tripUpdate) continue;

      const routeId = vehicle?.routeId ?? tripUpdate?.routeId;
      const routeMap = await this.gtfsStaticService.getRouteMetadataMap();
      const meta = routeId ? routeMap.get(routeId) : undefined;

      const result: TrackedTripObject = {
        tripId: vehicle?.tripId ?? tripUpdate?.tripId ?? tripId,
        routeId,
        lineCode: meta?.lineCode,
        routeColour: meta?.routeColour,
        vehicleId: vehicle?.vehicleId ?? tripUpdate?.vehicleId,
        vehicleLabel: vehicle?.vehicleLabel ?? tripUpdate?.vehicleLabel,
        mode: m,
        scheduleRelationship:
          tripUpdate?.scheduleRelationship ?? vehicle?.tripScheduleRelationship,
        delay: tripUpdate?.delay,

        // Live position — present only when vehiclepos feed has this trip
        position: vehicle
          ? {
              latitude: vehicle.latitude,
              longitude: vehicle.longitude,
              bearing: vehicle.bearing,
              speed: vehicle.speed,
              currentStatus: vehicle.currentStatus,
              currentStopId: vehicle.currentStopId,
              currentStopSequence: vehicle.currentStopSequence,
              occupancyStatus: vehicle.occupancyStatus,
              trackDirection: vehicle.trackDirection,
              timestamp: vehicle.timestamp,
              consist: vehicle.consist,
            }
          : undefined,

        stopTimeUpdates: tripUpdate?.stopTimeUpdates?.map((s) => ({
          stopSequence: s.stopSequence,
          stopId: s.stopId,
          arrivalDelay: s.arrivalDelay,
          departureDelay: s.departureDelay,
          arrivalTime: s.arrivalTime,
          departureTime: s.departureTime,
          scheduleRelationship: s.scheduleRelationship,
          departureOccupancyStatus: s.departureOccupancyStatus,
        })),

        // Vehicle amenity info
        vehicleModel: vehicle?.vehicleModel,
        airConditioned: vehicle?.airConditioned,
        wheelchairAccessible: vehicle?.wheelchairAccessible,
        performingPriorTrip: vehicle?.performingPriorTrip,
      };

      await this.cache.set(cacheKey, result, CacheTTL.VEHICLE_POSITIONS);
      return result;
    }

    // Trip not found in any mode — cache the null briefly to avoid hammering
    // Redis / the NSW API for trips that haven't started yet.
    await this.cache.set(cacheKey, null, 10);
    return null;
  }
  /**
   * Layered realtime matcher (EFA references ↔ GTFS-RT entities). Tiers:
   *  1. exact trip id (realtime or scheduled reference id)
   *  2. normalised id equality / prefix (formats differ between EFA and RT)
   *  3. route family + start date + start time within ±3 min (+ direction)
   *  4. schedule fingerprint: family/direction + first-stop *scheduled*
   *     departure (RT time minus its delay) within ±2 min of the reference
   * Tier 4 is what rescues departures that never got a RealtimeTripId.
   */
  private findRealtimeMatch<
    T extends {
      tripId?: string;
      routeId?: string;
      directionId?: number;
      startDate?: string;
      startTime?: string;
      stopTimeUpdates?: Array<{
        departureTime?: number;
        departureDelay?: number;
        arrivalTime?: number;
        arrivalDelay?: number;
      }>;
    },
  >(
    items: T[],
    tripId: string,
    reference: {
      scheduledTripId?: string;
      routeId?: string;
      startDate?: string;
      startTime?: string;
      directionId?: number;
    },
  ): T | undefined {
    const exactIds = new Set(
      [tripId, reference.scheduledTripId].filter((id): id is string =>
        Boolean(id),
      ),
    );
    const normalisedIds = [...exactIds]
      .map((id) => RealtimeService.normaliseId(id))
      .filter((id): id is string => Boolean(id));
    const refFamily = reference.routeId
      ? lineFor(reference.routeId, null)
      : null;
    const refStartEpochs = RealtimeService.sydneyEpochCandidates(
      reference.startDate,
      reference.startTime,
    );

    let best: T | undefined;
    let bestTier = Number.MAX_SAFE_INTEGER;
    for (const item of items) {
      let tier: number | null = null;

      if (item.tripId != null && exactIds.has(item.tripId)) {
        tier = 1;
      } else {
        const itemNorm = RealtimeService.normaliseId(item.tripId);
        if (
          itemNorm != null &&
          itemNorm.length >= 6 &&
          normalisedIds.some(
            (ref) =>
              ref === itemNorm ||
              ref.startsWith(itemNorm) ||
              itemNorm.startsWith(ref),
          )
        ) {
          tier = 2;
        }
      }

      if (tier == null && refFamily != null) {
        const familyMatches =
          item.routeId != null && lineFor(item.routeId, null) === refFamily;
        const directionOk =
          reference.directionId == null ||
          item.directionId == null ||
          item.directionId === reference.directionId;

        if (familyMatches && directionOk) {
          if (
            reference.startDate != null &&
            item.startDate === reference.startDate &&
            RealtimeService.timesWithin(
              item.startTime,
              reference.startTime,
              180,
            )
          ) {
            tier = 3;
          } else if (refStartEpochs.length > 0) {
            const first = item.stopTimeUpdates?.[0];
            const scheduled =
              first?.departureTime != null
                ? first.departureTime - (first.departureDelay ?? 0)
                : first?.arrivalTime != null
                  ? first.arrivalTime - (first.arrivalDelay ?? 0)
                  : null;
            if (
              scheduled != null &&
              refStartEpochs.some((epoch) => Math.abs(scheduled - epoch) <= 120)
            ) {
              tier = 4;
            }
          }
        }
      }

      if (tier != null && tier < bestTier) {
        best = item;
        bestTier = tier;
        if (tier === 1) break;
      }
    }
    return best;
  }

  private static normaliseId(id?: string): string | undefined {
    if (!id) return undefined;
    const normalised = id.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return normalised.length > 0 ? normalised : undefined;
  }

  /** Both "HH:MM[:SS]" strings within `toleranceSeconds` of each other. */
  private static timesWithin(
    a: string | undefined,
    b: string | undefined,
    toleranceSeconds: number,
  ): boolean {
    if (a == null || b == null) return a === b;
    const parse = (value: string): number | null => {
      const parts = value.split(':').map(Number);
      if (parts.some(Number.isNaN) || parts.length < 2) return null;
      return parts[0] * 3600 + parts[1] * 60 + (parts[2] ?? 0);
    };
    const secondsA = parse(a);
    const secondsB = parse(b);
    if (secondsA == null || secondsB == null) return false;
    return Math.abs(secondsA - secondsB) <= toleranceSeconds;
  }

  /**
   * Epoch-second candidates for a Sydney local start (yyyymmdd, HH:MM:SS).
   * Sydney is +10 or +11 depending on DST; emitting both and matching either
   * within tolerance avoids a timezone library dependency.
   */
  private static sydneyEpochCandidates(
    startDate?: string,
    startTime?: string,
  ): number[] {
    if (!startDate || !startTime || !/^\d{8}$/.test(startDate)) return [];
    const iso = `${startDate.slice(0, 4)}-${startDate.slice(4, 6)}-${startDate.slice(6, 8)}T${startTime.length === 5 ? `${startTime}:00` : startTime}`;
    return ['+10:00', '+11:00']
      .map((offset) => Date.parse(`${iso}${offset}`))
      .filter((ms) => !Number.isNaN(ms))
      .map((ms) => Math.floor(ms / 1000));
  }
}
