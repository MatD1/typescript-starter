import { Injectable, Logger } from '@nestjs/common';
import { TransportService } from '../transport/transport.service';
import { CacheService } from '../cache/cache.service';
import { CacheTTL } from '../cache/cache.constants';
import {
  TripPlannerParams,
  StopFinderParams,
  DepartureMonitorParams,
  CoordParams,
} from '../transport/transport.types';
import {
  TripResultObject,
  StopObject,
  DepartureObject,
  LegObject,
  LocationObject,
} from './dto/trip-planner.objects';

type NswApiRecord = Record<string, unknown>;

@Injectable()
export class TripPlannerService {
  private readonly logger = new Logger(TripPlannerService.name);

  constructor(
    private readonly transportService: TransportService,
    private readonly cache: CacheService,
  ) {}

  async planTrip(params: TripPlannerParams): Promise<TripResultObject[]> {
    const cacheKey = `tripplanner:trip:${JSON.stringify(params)}`;
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const raw = (await this.transportService.getTripPlan(
          params,
        )) as NswApiRecord;
        return this.mapTrips(raw);
      },
      CacheTTL.TRIP_PLANS,
    );
  }

  async findStops(params: StopFinderParams): Promise<StopObject[]> {
    const cacheKey = `tripplanner:stops:${JSON.stringify(params)}`;
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const raw = (await this.transportService.getStopFinder(
          params,
        )) as NswApiRecord;
        return this.mapStops(raw);
      },
      CacheTTL.STOP_SEARCH,
    );
  }

  async getDepartures(
    params: DepartureMonitorParams,
  ): Promise<DepartureObject[]> {
    const cacheKey = `tripplanner:departures:${JSON.stringify(params)}`;
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const raw = (await this.transportService.getDepartureMonitor(
          params,
        )) as NswApiRecord;
        return this.mapDepartures(raw);
      },
      CacheTTL.DEPARTURES,
    );
  }

  async searchByCoord(params: CoordParams): Promise<StopObject[]> {
    const cacheKey = `tripplanner:coord:${JSON.stringify(params)}`;
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const raw = (await this.transportService.getCoord(
          params,
        )) as NswApiRecord;
        return this.mapCoordResults(raw);
      },
      CacheTTL.STOP_SEARCH,
    );
  }

  private mapTrips(raw: NswApiRecord): TripResultObject[] {
    const journeys = (raw?.journeys as NswApiRecord[] | undefined) ?? [];
    return journeys.map((j) => {
      const legs = (j?.legs as NswApiRecord[] | undefined) ?? [];
      return {
        legs: legs.map((l) => this.mapLeg(l)),
        duration: j?.duration as number | undefined,
        interchanges: j?.interchanges as number | undefined,
      } satisfies TripResultObject;
    });
  }

  private mapLeg(l: NswApiRecord): LegObject {
    const transport = l?.transportation as NswApiRecord | undefined;
    const origin = l?.origin as NswApiRecord | undefined;
    const dest = l?.destination as NswApiRecord | undefined;
    return {
      tripId: transport?.id as string | undefined,
      transportation: (transport?.product as NswApiRecord | undefined)?.name as
        | string
        | undefined,
      lineName: transport?.number as string | undefined,
      destination: (transport?.destination as NswApiRecord | undefined)
        ?.name as string | undefined,
      origin: this.mapLocation(origin),
      dest: this.mapLocation(dest),
      departureTimePlanned: origin?.departureTimePlanned as string | undefined,
      departureTimeEstimated: origin?.departureTimeEstimated as
        | string
        | undefined,
      arrivalTimePlanned: dest?.arrivalTimePlanned as string | undefined,
      arrivalTimeEstimated: dest?.arrivalTimeEstimated as string | undefined,
      duration: l?.duration as number | undefined,
    } satisfies LegObject;
  }

  private mapLocation(
    loc: NswApiRecord | undefined,
  ): LocationObject | undefined {
    if (!loc) return undefined;
    const coord = loc?.coord as number[] | undefined;
    return {
      id: loc?.id as string | undefined,
      name: loc?.name as string | undefined,
      lat: coord?.[1],
      lon: coord?.[0],
      type: loc?.type as string | undefined,
    } satisfies LocationObject;
  }

  private mapStops(raw: NswApiRecord): StopObject[] {
    const locations = (raw?.locations as NswApiRecord[] | undefined) ?? [];
    return locations.map((l) => {
      const coord = l?.coord as number[] | undefined;
      const modes = l?.modes as number[] | undefined;
      return {
        id: l?.id as string | undefined,
        name: l?.name as string | undefined,
        disassembledName: l?.disassembledName as string | undefined,
        lat: coord?.[1],
        lon: coord?.[0],
        type: l?.type as string | undefined,
        transportMode: modes?.join(','),
      } satisfies StopObject;
    });
  }

  private mapDepartures(raw: NswApiRecord): DepartureObject[] {
    const events = (raw?.stopEvents as NswApiRecord[] | undefined) ?? [];
    return events.map((e) => {
      const transport = e?.transportation as NswApiRecord | undefined;
      const location = e?.location as NswApiRecord | undefined;
      return {
        stopName: location?.name as string | undefined,
        stopId: location?.id as string | undefined,
        lineName: transport?.number as string | undefined,
        destination: (transport?.destination as NswApiRecord | undefined)
          ?.name as string | undefined,
        departureTimePlanned: e?.departureTimePlanned as string | undefined,
        departureTimeEstimated: e?.departureTimeEstimated as string | undefined,
        transportMode: (transport?.product as NswApiRecord | undefined)
          ?.name as string | undefined,
        platform: (e?.platform as NswApiRecord | undefined)?.name as
          | string
          | undefined,
      } satisfies DepartureObject;
    });
  }

  private mapCoordResults(raw: NswApiRecord): StopObject[] {
    const locations = (raw?.locations as NswApiRecord[] | undefined) ?? [];
    return locations.map((l) => {
      const coord = l?.coord as number[] | undefined;
      return {
        id: l?.id as string | undefined,
        name: l?.name as string | undefined,
        disassembledName: l?.disassembledName as string | undefined,
        lat: coord?.[1],
        lon: coord?.[0],
        type: l?.type as string | undefined,
      } satisfies StopObject;
    });
  }
}
