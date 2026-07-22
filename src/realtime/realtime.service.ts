import { Injectable, Logger } from '@nestjs/common';
import { GtfsRealtimeService } from '../transport/gtfs-realtime.service';
import type {
  VehiclePosition,
  TripUpdate,
} from '../transport/gtfs-realtime.service';
import { GtfsStaticService } from '../gtfs-static/gtfs-static.service';
import { CacheService } from '../cache/cache.service';
import { CacheTTL } from '../cache/cache.constants';
import { lineFor } from '../history/line-identity.util';
import { sydneyLocalDate } from '../history/sydney-date.util';
import { gtfsScheduledEpochSeconds } from './gtfs-time.util';
import { TRANSPORT_MODES } from '../transport/transport.types';
import type { TransportMode } from '../transport/transport.types';
import type { TrackedTripObject } from './dto/tracked-trip.object';
import {
  RouteHeadwayObject,
  HeadwayStatus,
  VehicleHeadwayObject,
} from './dto/headway.object';

type LiveStopTimeUpdate = {
  stopSequence?: number;
  stopId?: string;
  arrivalDelay?: number;
  departureDelay?: number;
  arrivalTime?: number;
  departureTime?: number;
  scheduleRelationship?: string;
  departureOccupancyStatus?: string;
  pickupType?: number;
  dropOffType?: number;
};

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

/**
 * How long a "last known good" GTFS-RT snapshot stays eligible to cover a
 * feed that suddenly comes back empty. Confirmed live against TfNSW: Sydney
 * Metro's vehiclepos feed occasionally returns zero vehicles for a single
 * poll even mid-service (a real upstream blip, not a bug in our matching) —
 * long enough to ride that out, short enough that a genuine end-of-service
 * gap still correctly reports no vehicles.
 */
const STICKY_FALLBACK_SECONDS = 60;

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

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

  /**
   * Cached GTFS-RT fetch with a short "sticky last-good" fallback: if the
   * feed comes back empty while we very recently had real data for it, keep
   * serving that data for {@link STICKY_FALLBACK_SECONDS} instead of
   * momentarily reporting every tracked service on that feed as vanished.
   * A feed that's genuinely gone quiet (end of service, real outage) still
   * correctly reports empty once the grace window elapses.
   */
  private async fetchWithStickyFallback<T>(
    cacheKey: string,
    ttlSeconds: number,
    factory: () => Promise<T[]>,
  ): Promise<T[]> {
    const fresh = await this.cache.getOrSet(cacheKey, factory, ttlSeconds);
    const lastGoodKey = `${cacheKey}:lastgood`;
    if (fresh.length > 0) {
      await this.cache.set(lastGoodKey, fresh, STICKY_FALLBACK_SECONDS);
      return fresh;
    }
    const lastGood = await this.cache.get<T[]>(lastGoodKey);
    if (lastGood && lastGood.length > 0) {
      this.logger.warn(
        `${cacheKey} came back empty — using the last known-good snapshot to ride out a transient feed gap`,
      );
      return lastGood;
    }
    return fresh;
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
        const data = await this.fetchWithStickyFallback(
          cacheKey,
          CacheTTL.VEHICLE_POSITIONS,
          () => this.gtfsRt.getVehiclePositions(m),
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
      this.fetchWithStickyFallback(
        'realtime:vehicles:sydneytrains',
        CacheTTL.VEHICLE_POSITIONS,
        () => this.gtfsRt.getVehiclePositions('sydneytrains'),
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
        const data = await this.fetchWithStickyFallback(
          cacheKey,
          CacheTTL.TRIP_UPDATES,
          () => this.gtfsRt.getTripUpdates(m),
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
      this.fetchWithStickyFallback(
        'realtime:tripupdates:sydneytrains',
        CacheTTL.TRIP_UPDATES,
        () => this.gtfsRt.getTripUpdates('sydneytrains'),
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
          : this.fetchWithStickyFallback(
              `realtime:vehicles:${m}`,
              CacheTTL.VEHICLE_POSITIONS,
              () => this.gtfsRt.getVehiclePositions(m),
            ),
        m === 'intercity'
          ? this.getIntercityTripUpdates()
          : this.fetchWithStickyFallback(
              `realtime:tripupdates:${m}`,
              CacheTTL.TRIP_UPDATES,
              () => this.gtfsRt.getTripUpdates(m),
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
      const resolvedTripId = vehicle?.tripId ?? tripUpdate?.tripId ?? tripId;

      const liveStopTimeUpdates: LiveStopTimeUpdate[] | undefined =
        tripUpdate?.stopTimeUpdates?.map((s) => ({
          stopSequence: s.stopSequence,
          stopId: s.stopId,
          arrivalDelay: s.arrivalDelay,
          departureDelay: s.departureDelay,
          arrivalTime: s.arrivalTime,
          departureTime: s.departureTime,
          scheduleRelationship: s.scheduleRelationship,
          departureOccupancyStatus: s.departureOccupancyStatus,
        }));

      const result: TrackedTripObject = {
        tripId: resolvedTripId,
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

        stopTimeUpdates: liveStopTimeUpdates?.length
          ? await this.enrichStopTimeUpdates(
              resolvedTripId,
              reference.startDate,
              liveStopTimeUpdates,
            )
          : liveStopTimeUpdates,

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
   * Merges the static schedule into a trip's live stop-time updates, two
   * ways at once:
   *
   *  1. GTFS-RT producers (TfNSW included) drop `stop_time_update` entries
   *     once the vehicle has departed them — the feed only reports the
   *     stops still ahead. Backfill those from the static schedule (matched
   *     by `stop_sequence`, which GTFS-RT guarantees lines up with the
   *     static trip) so the full stop-by-stop history stays visible.
   *  2. Neither GTFS-RT's per-stop `schedule_relationship` nor a plain live
   *     feed distinguishes "the train calls here" from "the train passes
   *     this timing point without stopping" (an express run) — that's a
   *     static-schedule fact (`pickup_type`/`drop_off_type`). Attach it to
   *     *every* stop, live or backfilled, so the client can grey out
   *     non-stopping stations instead of implying the train stops there.
   */
  private async enrichStopTimeUpdates(
    tripId: string,
    startDate: string | undefined,
    liveUpdates: LiveStopTimeUpdate[],
  ): Promise<LiveStopTimeUpdate[]> {
    try {
      const { data: staticStopTimes } = await this.gtfsStaticService.getStopTimes(
        tripId,
        undefined,
        1000,
        0,
      );
      if (!staticStopTimes.length) return liveUpdates;

      const anchorDate = startDate ?? sydneyLocalDate().replace(/-/g, '');
      const staticBySequence = new Map(
        staticStopTimes.map((s) => [s.stopSequence, s]),
      );
      const liveBySequence = new Map(
        liveUpdates
          .filter((u) => u.stopSequence != null)
          .map((u) => [u.stopSequence, u]),
      );

      return [...staticStopTimes]
        .sort((a, b) => a.stopSequence - b.stopSequence)
        .map((s): LiveStopTimeUpdate => {
          const live = liveBySequence.get(s.stopSequence);
          if (live) {
            return {
              ...live,
              pickupType: s.pickupType ?? undefined,
              dropOffType: s.dropOffType ?? undefined,
            };
          }
          return {
            stopSequence: s.stopSequence,
            stopId: s.stopId,
            arrivalTime: s.arrivalTime
              ? gtfsScheduledEpochSeconds(anchorDate, s.arrivalTime)
              : undefined,
            departureTime: s.departureTime
              ? gtfsScheduledEpochSeconds(anchorDate, s.departureTime)
              : undefined,
            scheduleRelationship: 'SCHEDULED',
            pickupType: s.pickupType ?? undefined,
            dropOffType: s.dropOffType ?? undefined,
          } satisfies LiveStopTimeUpdate;
        })
        .concat(
          // Live entries whose stopSequence isn't in the static schedule at
          // all (added/rerouted trips) — keep them rather than dropping data.
          liveUpdates.filter(
            (u) => u.stopSequence == null || !staticBySequence.has(u.stopSequence),
          ),
        );
    } catch (e) {
      this.logger.warn(
        `Failed to enrich stop time updates for trip ${tripId}: ${e}`,
      );
      return liveUpdates;
    }
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
