import { Injectable } from '@nestjs/common';
import { GtfsRealtimeService } from '../transport/gtfs-realtime.service';
import type {
  VehiclePosition,
  TripUpdate,
} from '../transport/gtfs-realtime.service';
import { GtfsStaticService } from '../gtfs-static/gtfs-static.service';
import { CacheService } from '../cache/cache.service';
import { CacheTTL } from '../cache/cache.constants';
import { TRANSPORT_MODES } from '../transport/transport.types';
import type { TransportMode } from '../transport/transport.types';
import type { TrackedTripObject } from './dto/tracked-trip.object';

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
    const filtered = cached ?? await this.fetchIntercityVehiclePositions();
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
    const filtered = cached ?? await this.fetchIntercityTripUpdates();
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
    const routeMap =
      await this.gtfsStaticService.getRouteMetadataMap();
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
  ): Promise<TrackedTripObject | null> {
    const cacheKey = `realtime:track:${tripId}`;
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

      const vehicleList =
        vehicles.status === 'fulfilled' ? vehicles.value : [];
      const updateList = updates.status === 'fulfilled' ? updates.value : [];

      const vehicle = vehicleList.find((v) => v.tripId === tripId);
      const tripUpdate = updateList.find((t) => t.tripId === tripId);

      if (!vehicle && !tripUpdate) continue;

      const routeId = vehicle?.routeId ?? tripUpdate?.routeId;
      const routeMap =
        await this.gtfsStaticService.getRouteMetadataMap();
      const meta = routeId ? routeMap.get(routeId) : undefined;

      const result: TrackedTripObject = {
        tripId,
        routeId,
        lineCode: meta?.lineCode,
        routeColour: meta?.routeColour,
        vehicleId: vehicle?.vehicleId ?? tripUpdate?.vehicleId,
        vehicleLabel: vehicle?.vehicleLabel ?? tripUpdate?.vehicleLabel,
        mode: m,
        scheduleRelationship:
          tripUpdate?.scheduleRelationship ??
          vehicle?.tripScheduleRelationship,
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
}
