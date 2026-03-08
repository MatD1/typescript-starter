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
}
