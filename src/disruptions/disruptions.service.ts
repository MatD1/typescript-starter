import { Injectable } from '@nestjs/common';
import { GtfsRealtimeService } from '../transport/gtfs-realtime.service';
import type { ServiceAlert } from '../transport/gtfs-realtime.service';
import { GtfsStaticService } from '../gtfs-static/gtfs-static.service';
import { CacheService } from '../cache/cache.service';
import { CacheTTL } from '../cache/cache.constants';
import { TRANSPORT_MODES } from '../transport/transport.types';
import type { TransportMode } from '../transport/transport.types';

type WithMode<T> = T & { mode: string };

@Injectable()
export class DisruptionsService {
  constructor(
    private readonly gtfsRt: GtfsRealtimeService,
    private readonly cache: CacheService,
    private readonly gtfsStaticService: GtfsStaticService,
  ) {}

  async getDisruptions(
    mode?: TransportMode,
    effect?: string,
  ): Promise<WithMode<ServiceAlert>[]> {
    const modes = mode ? [mode] : ([...TRANSPORT_MODES] as TransportMode[]);
    const results = await Promise.allSettled(
      modes.map(async (m) => {
        if (m === 'intercity') {
          return this.getIntercityAlerts();
        }
        const cacheKey = `disruptions:${m}`;
        const alerts = await this.cache.getOrSet(
          cacheKey,
          () => this.gtfsRt.getAlerts(m),
          CacheTTL.ALERTS,
        );
        return alerts.map((a): WithMode<ServiceAlert> => ({ ...a, mode: m }));
      }),
    );

    let disruptions = results
      .filter(
        <T>(r: PromiseSettledResult<T>): r is PromiseFulfilledResult<T> =>
          r.status === 'fulfilled',
      )
      .flatMap((r) => r.value);

    if (effect) {
      disruptions = disruptions.filter(
        (d) => d.effect?.toLowerCase() === effect.toLowerCase(),
      );
    }

    return disruptions;
  }

  private async getIntercityAlerts(): Promise<WithMode<ServiceAlert>[]> {
    const cacheKey = 'disruptions:intercity';
    const cached = await this.cache.get<WithMode<ServiceAlert>[]>(cacheKey);
    if (cached) return cached;

    const [sydneytrainsAlerts, intercityRouteIds] = await Promise.all([
      this.cache.getOrSet(
        'disruptions:sydneytrains',
        () => this.gtfsRt.getAlerts('sydneytrains'),
        CacheTTL.ALERTS,
      ),
      this.gtfsStaticService.getIntercityRouteIds(),
    ]);

    const filtered = sydneytrainsAlerts
      .filter((a) => {
        const entities = a.informedEntities ?? [];
        return entities.some(
          (ie) => ie.routeId && intercityRouteIds.has(ie.routeId),
        );
      })
      .map((a): WithMode<ServiceAlert> => ({ ...a, mode: 'intercity' }));

    await this.cache.set(cacheKey, filtered, CacheTTL.ALERTS);
    return filtered;
  }
}
