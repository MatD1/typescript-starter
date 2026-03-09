import { Injectable } from '@nestjs/common';
import { GtfsRealtimeService } from '../transport/gtfs-realtime.service';
import type {
  VehiclePosition,
  TripUpdate,
} from '../transport/gtfs-realtime.service';
import { CacheService } from '../cache/cache.service';
import { CacheTTL } from '../cache/cache.constants';
import { TRANSPORT_MODES } from '../transport/transport.types';
import type { TransportMode } from '../transport/transport.types';
import type { TrackedTripObject } from './dto/tracked-trip.object';

type WithMode<T> = T & { mode: string };

@Injectable()
export class RealtimeService {
  constructor(
    private readonly gtfsRt: GtfsRealtimeService,
    private readonly cache: CacheService,
  ) {}

  async getVehiclePositions(
    mode?: TransportMode,
  ): Promise<WithMode<VehiclePosition>[]> {
    const modes = mode ? [mode] : ([...TRANSPORT_MODES] as TransportMode[]);
    const results = await Promise.allSettled(
      modes.map(async (m) => {
        const cacheKey = `realtime:vehicles:${m}`;
        const data = await this.cache.getOrSet(
          cacheKey,
          () => this.gtfsRt.getVehiclePositions(m),
          CacheTTL.VEHICLE_POSITIONS,
        );
        return data.map((v): WithMode<VehiclePosition> => ({ ...v, mode: m }));
      }),
    );
    return results
      .filter(
        <T>(r: PromiseSettledResult<T>): r is PromiseFulfilledResult<T> =>
          r.status === 'fulfilled',
      )
      .flatMap((r) => r.value);
  }

  async getTripUpdates(mode?: TransportMode): Promise<WithMode<TripUpdate>[]> {
    const modes = mode ? [mode] : ([...TRANSPORT_MODES] as TransportMode[]);
    const results = await Promise.allSettled(
      modes.map(async (m) => {
        const cacheKey = `realtime:tripupdates:${m}`;
        const data = await this.cache.getOrSet(
          cacheKey,
          () => this.gtfsRt.getTripUpdates(m),
          CacheTTL.TRIP_UPDATES,
        );
        return data.map((t): WithMode<TripUpdate> => ({ ...t, mode: m }));
      }),
    );
    return results
      .filter(
        <T>(r: PromiseSettledResult<T>): r is PromiseFulfilledResult<T> =>
          r.status === 'fulfilled',
      )
      .flatMap((r) => r.value);
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
        this.cache.getOrSet(
          `realtime:vehicles:${m}`,
          () => this.gtfsRt.getVehiclePositions(m),
          CacheTTL.VEHICLE_POSITIONS,
        ),
        this.cache.getOrSet(
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

      const result: TrackedTripObject = {
        tripId,
        routeId: vehicle?.routeId ?? tripUpdate?.routeId,
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
