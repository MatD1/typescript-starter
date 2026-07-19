import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig } from 'axios';
import {
  CoordParams,
  DepartureMonitorParams,
  GtfsRtFeedType,
  StopFinderParams,
  TransportMode,
  TripPlannerParams,
} from './transport.types';
import { TfnswHttpClient } from './tfnsw-http.client';

/**
 * Modes supported by the v2 GTFS-RT trip-updates endpoint.
 * All other modes fall back to the v1 endpoint.
 *
 * v2:  sydneytrains, metro, lightrail (inner west)
 * v1:  buses, ferries, nswtrains, intercity (regional)
 */
const TRIP_UPDATES_V2_MODES = new Set<TransportMode>([
  'sydneytrains',
  'metro',
  'lightrail',
]);

/**
 * Modes supported by the v2 vehiclepos endpoint.
 * Same as trip-updates. v1 has buses, ferries, nswtrains, intercity.
 */
const VEHICLE_POS_V2_MODES = new Set<TransportMode>([
  'sydneytrains',
  'metro',
  'lightrail',
]);

/**
 * Mode-to-path overrides for vehiclepos. v1/v2 use different path structures
 * for some modes (e.g. lightrail/innerwest in v2, ferries/sydneyferries in v1).
 */
const MODE_TO_VEHICLEPOS_PATH: Partial<Record<TransportMode, string>> = {
  lightrail: 'lightrail/innerwest',
  ferries: 'ferries/sydneyferries',
};

@Injectable()
export class TransportService {
  private readonly logger = new Logger(TransportService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly tfnsw: TfnswHttpClient,
  ) {
    this.baseUrl = this.configService.get<string>('transport.baseUrl')!;
    if (!this.tfnsw.getApiKey('realtime')) {
      this.logger.error(
        'NSW_TRANSPORT_API_KEY is missing or empty. TfNSW requests are disabled until it is configured.',
      );
    } else {
      this.logger.log('TfNSW API credential configured (realtime key gate)');
    }
  }

  async getGtfsRealtime(
    feedType: GtfsRtFeedType,
    mode: TransportMode,
  ): Promise<Buffer> {
    const url = this.buildGtfsRtUrl(feedType, mode);
    const config: AxiosRequestConfig = {
      headers: { Accept: 'application/x-google-protobuf' },
      responseType: 'arraybuffer',
    };
    return this.request<Buffer>(url, config);
  }

  /**
   * Builds the correct NSW Open Data URL for a GTFS-RT feed.
   *
   * Trip-updates use a version-split endpoint (mode is the final segment):
   *   v2/gtfs/realtime/{mode}  — sydneytrains, metro, lightrail
   *   v1/gtfs/realtime/{mode}  — buses, ferries, nswtrains, intercity
   *
   * Vehicle positions use a version split; alerts are v2-only (v1 retired):
   *   v2/gtfs/{feedType}/{path}  — sydneytrains, metro, lightrail
   *   v1/gtfs/{feedType}/{path}  — buses, ferries, nswtrains, intercity
   * Some modes need path overrides (e.g. lightrail/innerwest, ferries/sydneyferries).
   *
   * Intercity is now combined in sydneytrains feed; use sydneytrains endpoint.
   */
  buildGtfsRtUrl(feedType: GtfsRtFeedType, mode: TransportMode): string {
    const effectiveMode = mode === 'intercity' ? 'sydneytrains' : mode;
    if (feedType === 'tripupdates') {
      const version = TRIP_UPDATES_V2_MODES.has(effectiveMode) ? 'v2' : 'v1';
      return `${this.baseUrl}/${version}/gtfs/realtime/${effectiveMode}`;
    }
    if (feedType === 'alerts') {
      // TfNSW retired the v1 alerts products (v1 now 401s as
      // "unauthenticated"); all modes are served from v2.
      return `${this.baseUrl}/v2/gtfs/alerts/${effectiveMode}`;
    }
    if (feedType === 'vehiclepos') {
      const version = VEHICLE_POS_V2_MODES.has(effectiveMode) ? 'v2' : 'v1';
      const path = MODE_TO_VEHICLEPOS_PATH[effectiveMode] ?? effectiveMode;
      return `${this.baseUrl}/${version}/gtfs/${feedType}/${path}`;
    }
    return `${this.baseUrl}/v2/gtfs/${feedType}/${effectiveMode}`;
  }

  async getTripPlan(params: TripPlannerParams): Promise<unknown> {
    const url = `${this.baseUrl}/v1/tp/trip`;
    const v1Params = this.mapTripParamsToV1(params);
    const config: AxiosRequestConfig = {
      headers: { Accept: 'application/json' },
      params: {
        outputFormat: 'rapidJSON',
        coordOutputFormat: 'EPSG:4326',
        ...v1Params,
      },
    };
    return this.request<unknown>(url, config);
  }

  async getStopFinder(params: StopFinderParams): Promise<unknown> {
    const url = `${this.baseUrl}/v1/tp/stop_finder`;
    const config: AxiosRequestConfig = {
      headers: { Accept: 'application/json' },
      params: {
        outputFormat: 'rapidJSON',
        coordOutputFormat: 'EPSG:4326',
        type_sf: 'any',
        ...params,
      },
    };
    return this.request<unknown>(url, config);
  }

  async getDepartureMonitor(params: DepartureMonitorParams): Promise<unknown> {
    const url = `${this.baseUrl}/v1/tp/departure_mon`;
    const config: AxiosRequestConfig = {
      headers: { Accept: 'application/json' },
      params: {
        outputFormat: 'rapidJSON',
        coordOutputFormat: 'EPSG:4326',
        departureMonitorMacro: true,
        mode: 'direct',
        ...params,
      },
    };
    return this.request<unknown>(url, config);
  }

  async getCoord(params: CoordParams): Promise<unknown> {
    const url = `${this.baseUrl}/v1/tp/coord`;
    const config: AxiosRequestConfig = {
      headers: { Accept: 'application/json' },
      params: {
        outputFormat: 'rapidJSON',
        coordOutputFormat: 'EPSG:4326',
        inclFilter: 1,
        ...params,
      },
    };
    return this.request<unknown>(url, config);
  }

  /**
   * Maps our TripPlannerParams to v1 API format (name_origin, type_origin, etc.).
   */
  private mapTripParamsToV1(
    params: TripPlannerParams,
  ): Record<string, unknown> {
    const nameOrigin =
      params.originId ?? params.originCoord ?? params.originName ?? '10101331';
    const typeOrigin = params.originCoord ? 'coord' : 'any';
    const nameDest =
      params.destId ?? params.destCoord ?? params.destName ?? '10102027';
    const typeDest = params.destCoord ? 'coord' : 'any';

    return {
      depArrMacro: params.arriveBy ? 'arr' : 'dep',
      name_origin: nameOrigin,
      type_origin: typeOrigin,
      name_destination: nameDest,
      type_destination: typeDest,
      itdDate: params.itdDate,
      itdTime: params.itdTime,
      calcNumberOfTrips: params.calcNumberOfTrips,
      wheelchair: params.wheelchair ? 'on' : undefined,
    };
  }

  private async request<T>(
    url: string,
    config: AxiosRequestConfig,
  ): Promise<T> {
    try {
      return await this.tfnsw.getRealtime<T>(url, config);
    } catch (err: unknown) {
      if (
        err instanceof ServiceUnavailableException ||
        err instanceof InternalServerErrorException
      ) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`NSW Transport API error: ${msg} ${url}`);
      throw new InternalServerErrorException(msg);
    }
  }
}
