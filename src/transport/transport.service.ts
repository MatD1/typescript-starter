import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  CoordParams,
  DepartureMonitorParams,
  GtfsRtFeedType,
  StopFinderParams,
  TransportMode,
  TripPlannerParams,
} from './transport.types';

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

@Injectable()
export class TransportService {
  private readonly logger = new Logger(TransportService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('transport.baseUrl')!;
    this.apiKey = this.configService.get<string>('transport.apiKey')!;
    if (!this.apiKey) {
      this.logger.warn(
        'NSW_TRANSPORT_API_KEY is missing or empty. Transport API requests will return 401.',
      );
    }
  }

  private get authHeaders() {
    return { Authorization: `apikey ${this.apiKey}` };
  }

  async getGtfsRealtime(
    feedType: GtfsRtFeedType,
    mode: TransportMode,
  ): Promise<Buffer> {
    const url = this.buildGtfsRtUrl(feedType, mode);
    const config: AxiosRequestConfig = {
      headers: { ...this.authHeaders, Accept: 'application/x-google-protobuf' },
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
   * Vehicle positions and alerts use the v2 non-realtime path (no version split):
   *   v2/gtfs/{feedType}/{mode}
   */
  buildGtfsRtUrl(feedType: GtfsRtFeedType, mode: TransportMode): string {
    if (feedType === 'tripupdates') {
      const version = TRIP_UPDATES_V2_MODES.has(mode) ? 'v2' : 'v1';
      return `${this.baseUrl}/${version}/gtfs/realtime/${mode}`;
    }
    return `${this.baseUrl}/v2/gtfs/${feedType}/${mode}`;
  }

  async getTripPlan(params: TripPlannerParams): Promise<unknown> {
    const url = `${this.baseUrl}/v1/tp/trip`;
    const v1Params = this.mapTripParamsToV1(params);
    const config: AxiosRequestConfig = {
      headers: { ...this.authHeaders, Accept: 'application/json' },
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
      headers: { ...this.authHeaders, Accept: 'application/json' },
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
      headers: { ...this.authHeaders, Accept: 'application/json' },
      params: {
        outputFormat: 'rapidJSON',
        coordOutputFormat: 'EPSG:4326',
        departureMonitorMacro: true,
        ...params,
      },
    };
    return this.request<unknown>(url, config);
  }

  async getCoord(params: CoordParams): Promise<unknown> {
    const url = `${this.baseUrl}/v1/tp/coord`;
    const config: AxiosRequestConfig = {
      headers: { ...this.authHeaders, Accept: 'application/json' },
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
  private mapTripParamsToV1(params: TripPlannerParams): Record<string, unknown> {
    const nameOrigin =
      params.originId ?? params.originCoord ?? params.originName ?? '10101331';
    const typeOrigin = params.originCoord ? 'coord' : 'any';
    const nameDest =
      params.destId ?? params.destCoord ?? params.destName ?? '10102027';
    const typeDest = params.destCoord ? 'coord' : 'any';

    return {
      depArrMacro: 'dep',
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
      const response = await firstValueFrom(
        this.httpService.get<T>(url, config),
      );
      return response.data;
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; statusText?: string };
        message?: string;
      };
      const status = axiosErr?.response?.status;
      const msg = `NSW Transport API error: ${axiosErr?.response?.statusText ?? axiosErr?.message ?? 'Unknown'}`;
      this.logger.error(`${msg} [${status ?? 'N/A'}] ${url}`);
      if (status === 503 || status === 504) {
        throw new ServiceUnavailableException('NSW Transport API unavailable');
      }
      throw new InternalServerErrorException(msg);
    }
  }
}
