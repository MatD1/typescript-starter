import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { TransportService } from '../transport/transport.service';
import { GtfsStaticService } from '../gtfs-static/gtfs-static.service';
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
  TripPlannerResponseObject,
} from './dto/trip-planner.objects';

type NswApiRecord = Record<string, unknown>;

@Injectable()
export class TripPlannerService {
  private readonly logger = new Logger(TripPlannerService.name);

  constructor(
    private readonly transportService: TransportService,
    private readonly gtfsStaticService: GtfsStaticService,
    private readonly cache: CacheService,
  ) { }

  async planTrip(params: TripPlannerParams): Promise<TripPlannerResponseObject> {
    if (params.context) {
      try {
        const decoded = Buffer.from(params.context, 'base64').toString('utf8');
        const { itdDate, itdTime } = JSON.parse(decoded);
        if (itdDate && itdTime) {
          params.itdDate = itdDate;
          params.itdTime = itdTime;
        }
      } catch (e: any) {
        this.logger.warn(`Failed to parse context string: ${e.message}`);
      }
    }

    const cacheKey = `tripplanner:trip:${JSON.stringify(params)}`;
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const raw = (await this.transportService.getTripPlan(
          params,
        )) as NswApiRecord;
        const trips = this.mapTrips(raw);

        let context: string | undefined = undefined;
        if (trips.length > 0) {
          const lastTrip = trips[trips.length - 1];
          const firstLeg = lastTrip.legs[0];
          if (firstLeg?.departureTimePlanned) {
            const d = new Date(firstLeg.departureTimePlanned);
            d.setMinutes(d.getMinutes() + 1);
            const formatter = new Intl.DateTimeFormat('en-AU', {
              timeZone: 'Australia/Sydney',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
            const parts = formatter.formatToParts(d);
            const getPart = (type: string) => parts.find((p) => p.type === type)?.value;
            const itdDate = `${getPart('year')}${getPart('month')}${getPart('day')}`;
            const itdTime = `${getPart('hour')}${getPart('minute')}`;
            context = Buffer.from(JSON.stringify({ itdDate, itdTime })).toString('base64');
          }
        }

        return { trips, context };
      },
      CacheTTL.TRIP_PLANS,
    );
  }

  async findStops(params: StopFinderParams): Promise<StopObject[]> {
    this.validateStopFinderParams(params);
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

  /**
   * Validates stop finder params per NSW v1 API semantics.
   * type_sf constrains the expected name_sf format:
   * - stop: query must be a stop ID (numeric), not a place name
   * - coord: query must be lon:lat:EPSG:4326
   * See docs/tripplanner_v1_swag_efa11_20251002.yml
   */
  private validateStopFinderParams(params: StopFinderParams): void {
    const { name_sf, type_sf } = params;
    if (!name_sf?.trim()) return;

    const query = name_sf.trim();
    const type = type_sf ?? 'any';

    if (type === 'stop') {
      if (!/^\d+$/.test(query)) {
        this.logger.warn(
          `findStops: type=stop requires a stop ID (e.g. 200060), got "${query.slice(0, 50)}${query.length > 50 ? '...' : ''}"`,
        );
        throw new BadRequestException(
          'When type is "stop", query must be a stop ID (e.g. 200060). Use type "any" for name search.',
        );
      }
    } else if (type === 'coord') {
      if (!/^-?\d+\.?\d*:-?\d+\.?\d*:EPSG:4326$/i.test(query)) {
        this.logger.warn(
          `findStops: type=coord requires lon:lat:EPSG:4326, got "${query.slice(0, 50)}${query.length > 50 ? '...' : ''}"`,
        );
        throw new BadRequestException(
          'When type is "coord", query must be in format lon:lat:EPSG:4326 (e.g. 151.206:-33.884:EPSG:4326). Use type "any" for name search.',
        );
      }
    } else if (type === 'poi') {
      this.logger.debug(
        'findStops: type=poi has restrictive semantics; use type "any" for general text search',
      );
    }
  }

  private mapTrips(
    raw: NswApiRecord,
  ): TripResultObject[] {
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

  private mapLeg(
    l: NswApiRecord,
  ): LegObject {
    const transport = l?.transportation as NswApiRecord | undefined;
    const origin = l?.origin as NswApiRecord | undefined;
    const dest = l?.destination as NswApiRecord | undefined;
    const properties = transport?.properties as NswApiRecord | undefined;
    const tripId =
      (properties?.RealtimeTripId as string | undefined) ??
      (transport?.id as string | undefined);

    return {
      tripId,
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

  private mapDepartures(
    raw: NswApiRecord,
  ): DepartureObject[] {
    const events = (raw?.stopEvents as NswApiRecord[] | undefined) ?? [];
    return events.map((e) => {
      const transport = e?.transportation as NswApiRecord | undefined;
      const location = e?.location as NswApiRecord | undefined;
      const properties = transport?.properties as NswApiRecord | undefined;
      const tripId =
        (properties?.RealtimeTripId as string | undefined) ??
        (transport?.id as string | undefined);

      return {
        tripId,
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
