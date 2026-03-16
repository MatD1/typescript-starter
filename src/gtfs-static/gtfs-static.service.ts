import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as unzipper from 'unzipper';
import { parse } from 'csv-parse';
import { inArray, eq, isNotNull, or, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import type { DrizzleDB } from '../database/database.module';
import {
  gtfsStop,
  gtfsRoute,
  gtfsTrip,
  gtfsCalendar,
  gtfsCalendarDate,
} from '../database/schema/gtfs.schema';
import { CacheService } from '../cache/cache.service';
import { CacheTTL } from '../cache/cache.constants';

/** NSW intercity lines: Blue Mountains, Central Coast, Hunter, South Coast, Southern Highlands */
const INTERCITY_ROUTE_SHORT_NAMES = [
  'BMT',
  'CCN',
  'HUN',
  'SCO',
  'SHL',
] as const;

const GTFS_STATIC_URLS: Record<string, string> = {
  sydneytrains:
    'https://api.transport.nsw.gov.au/v1/gtfs/schedule/sydneytrains',
  intercity: 'https://api.transport.nsw.gov.au/v1/gtfs/schedule/intercity',
  buses: 'https://api.transport.nsw.gov.au/v1/gtfs/schedule/buses/1',
  metro: 'https://api.transport.nsw.gov.au/v1/gtfs/schedule/metro',
  ferries: 'https://api.transport.nsw.gov.au/v1/gtfs/schedule/ferries',
  lightrail: 'https://api.transport.nsw.gov.au/v1/gtfs/schedule/lightrail',
  nswtrains: 'https://api.transport.nsw.gov.au/v1/gtfs/schedule/nswtrains',
};

const BATCH_SIZE = 500;

type CsvRecord = Record<string, string>;

@Injectable()
export class GtfsStaticService {
  private readonly logger = new Logger(GtfsStaticService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly cache: CacheService,
  ) {}

  async ingestAll(): Promise<
    { mode: string; success: boolean; error?: string }[]
  > {
    const modes = Object.keys(GTFS_STATIC_URLS);
    return Promise.all(modes.map((mode) => this.ingestMode(mode)));
  }

  async ingestMode(
    mode: string,
  ): Promise<{ mode: string; success: boolean; error?: string }> {
    this.logger.log(`Starting GTFS static ingestion for: ${mode}`);
    const url = GTFS_STATIC_URLS[mode];
    if (!url) return { mode, success: false, error: 'Unknown mode' };

    try {
      const apiKey = this.configService.get<string>('transport.apiKey');
      const response = await firstValueFrom(
        this.httpService.get<ArrayBuffer>(url, {
          responseType: 'arraybuffer',
          headers: { Authorization: `apikey ${apiKey}` },
          timeout: 120000,
        }),
      );

      const buffer = Buffer.from(response.data);
      await this.processZip(buffer, mode);
      this.logger.log(`Completed GTFS static ingestion for: ${mode}`);
      return { mode, success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`GTFS ingestion failed for ${mode}: ${msg}`);
      return { mode, success: false, error: msg };
    }
  }

  private async processZip(buffer: Buffer, mode: string): Promise<void> {
    const directory = await unzipper.Open.buffer(buffer);
    const fileMap = new Map(directory.files.map((f) => [f.path, f]));

    await this.ingestStops(fileMap, mode);
    await this.ingestRoutes(fileMap, mode);
    await this.ingestTrips(fileMap, mode);
    await this.ingestCalendar(fileMap, mode);
    await this.ingestCalendarDates(fileMap, mode);
  }

  private async parseCsvFromZipEntry(
    entry: unzipper.File,
  ): Promise<CsvRecord[]> {
    const content = await entry.buffer();
    return new Promise((resolve, reject) => {
      parse(
        content,
        { columns: true, skip_empty_lines: true, trim: true },
        (err, records: CsvRecord[]) => {
          if (err) reject(err);
          else resolve(records);
        },
      );
    });
  }

  private async ingestStops(
    fileMap: Map<string, unzipper.File>,
    mode: string,
  ): Promise<void> {
    const entry = fileMap.get('stops.txt');
    if (!entry) return;
    const records = await this.parseCsvFromZipEntry(entry);
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE).map((r) => ({
        stopId: r['stop_id'] ?? '',
        stopCode: r['stop_code'] ?? null,
        stopName: r['stop_name'] ?? '',
        stopLat: r['stop_lat'] ? parseFloat(r['stop_lat']) : null,
        stopLon: r['stop_lon'] ? parseFloat(r['stop_lon']) : null,
        locationType: r['location_type'] ? parseInt(r['location_type']) : null,
        parentStation: r['parent_station'] ?? null,
        wheelchairBoarding: r['wheelchair_boarding']
          ? parseInt(r['wheelchair_boarding'])
          : null,
        platformCode: r['platform_code'] ?? null,
        mode,
        updatedAt: new Date(),
      }));
      await this.db
        .insert(gtfsStop)
        .values(batch)
        .onConflictDoUpdate({
          target: gtfsStop.stopId,
          set: {
            stopCode: sql`excluded.stop_code`,
            stopName: sql`excluded.stop_name`,
            stopLat: sql`excluded.stop_lat`,
            stopLon: sql`excluded.stop_lon`,
            locationType: sql`excluded.location_type`,
            parentStation: sql`excluded.parent_station`,
            wheelchairBoarding: sql`excluded.wheelchair_boarding`,
            platformCode: sql`excluded.platform_code`,
            mode: sql`excluded.mode`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    this.logger.debug(`Ingested ${records.length} stops for ${mode}`);
  }

  private async ingestRoutes(
    fileMap: Map<string, unzipper.File>,
    mode: string,
  ): Promise<void> {
    const entry = fileMap.get('routes.txt');
    if (!entry) return;
    const records = await this.parseCsvFromZipEntry(entry);
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE).map((r) => ({
        routeId: r['route_id'] ?? '',
        agencyId: r['agency_id'] ?? null,
        routeShortName: r['route_short_name'] ?? null,
        routeLongName: r['route_long_name'] ?? null,
        routeType: r['route_type'] ? parseInt(r['route_type']) : null,
        routeColor: r['route_color'] ?? null,
        routeTextColor: r['route_text_color'] ?? null,
        mode,
        updatedAt: new Date(),
      }));
      await this.db
        .insert(gtfsRoute)
        .values(batch)
        .onConflictDoUpdate({
          target: gtfsRoute.routeId,
          set: {
            agencyId: sql`excluded.agency_id`,
            routeShortName: sql`excluded.route_short_name`,
            routeLongName: sql`excluded.route_long_name`,
            routeType: sql`excluded.route_type`,
            routeColor: sql`excluded.route_color`,
            routeTextColor: sql`excluded.route_text_color`,
            mode: sql`excluded.mode`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    this.logger.debug(`Ingested ${records.length} routes for ${mode}`);
  }

  private async ingestTrips(
    fileMap: Map<string, unzipper.File>,
    mode: string,
  ): Promise<void> {
    const entry = fileMap.get('trips.txt');
    if (!entry) return;
    const records = await this.parseCsvFromZipEntry(entry);
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE).map((r) => ({
        tripId: r['trip_id'] ?? '',
        routeId: r['route_id'] ?? null,
        serviceId: r['service_id'] ?? null,
        tripHeadsign: r['trip_headsign'] ?? null,
        tripShortName: r['trip_short_name'] ?? null,
        directionId: r['direction_id'] ? parseInt(r['direction_id']) : null,
        shapeId: r['shape_id'] ?? null,
        wheelchairAccessible: r['wheelchair_accessible']
          ? parseInt(r['wheelchair_accessible'])
          : null,
        mode,
        updatedAt: new Date(),
      }));
      await this.db
        .insert(gtfsTrip)
        .values(batch)
        .onConflictDoUpdate({
          target: gtfsTrip.tripId,
          set: {
            routeId: sql`excluded.route_id`,
            serviceId: sql`excluded.service_id`,
            tripHeadsign: sql`excluded.trip_headsign`,
            tripShortName: sql`excluded.trip_short_name`,
            directionId: sql`excluded.direction_id`,
            shapeId: sql`excluded.shape_id`,
            wheelchairAccessible: sql`excluded.wheelchair_accessible`,
            mode: sql`excluded.mode`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    this.logger.debug(`Ingested ${records.length} trips for ${mode}`);
  }

  private async ingestCalendar(
    fileMap: Map<string, unzipper.File>,
    mode: string,
  ): Promise<void> {
    const entry = fileMap.get('calendar.txt');
    if (!entry) return;
    const records = await this.parseCsvFromZipEntry(entry);
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE).map((r) => ({
        serviceId: r['service_id'] ?? '',
        monday: parseInt(r['monday'] ?? '0'),
        tuesday: parseInt(r['tuesday'] ?? '0'),
        wednesday: parseInt(r['wednesday'] ?? '0'),
        thursday: parseInt(r['thursday'] ?? '0'),
        friday: parseInt(r['friday'] ?? '0'),
        saturday: parseInt(r['saturday'] ?? '0'),
        sunday: parseInt(r['sunday'] ?? '0'),
        startDate: r['start_date'] ?? '',
        endDate: r['end_date'] ?? '',
        mode,
        updatedAt: new Date(),
      }));
      await this.db
        .insert(gtfsCalendar)
        .values(batch)
        .onConflictDoUpdate({
          target: gtfsCalendar.serviceId,
          set: {
            monday: sql`excluded.monday`,
            tuesday: sql`excluded.tuesday`,
            wednesday: sql`excluded.wednesday`,
            thursday: sql`excluded.thursday`,
            friday: sql`excluded.friday`,
            saturday: sql`excluded.saturday`,
            sunday: sql`excluded.sunday`,
            startDate: sql`excluded.start_date`,
            endDate: sql`excluded.end_date`,
            mode: sql`excluded.mode`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
  }

  private async ingestCalendarDates(
    fileMap: Map<string, unzipper.File>,
    mode: string,
  ): Promise<void> {
    const entry = fileMap.get('calendar_dates.txt');
    if (!entry) return;
    const records = await this.parseCsvFromZipEntry(entry);
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE).map((r) => ({
        id: `${r['service_id']}_${r['date']}`,
        serviceId: r['service_id'] ?? '',
        date: r['date'] ?? '',
        exceptionType: parseInt(r['exception_type'] ?? '0'),
        mode,
      }));
      await this.db
        .insert(gtfsCalendarDate)
        .values(batch)
        .onConflictDoNothing();
    }
  }

  /**
   * Returns route_id → metadata (lineCode, routeColour) for all routes with
   * route_short_name or route_color. Used to enrich vehicle positions and
   * trip updates. Cached 1 hour to avoid per-request DB queries.
   */
  async getRouteMetadataMap(): Promise<
    Map<string, { lineCode: string; routeColour?: string }>
  > {
    const cacheKey = 'gtfs:route_metadata';
    const cached =
      await this.cache.get<Record<string, { lineCode: string; routeColour?: string }>>(
        cacheKey,
      );
    if (cached) return new Map(Object.entries(cached));

    const rows = await this.db
      .select({
        routeId: gtfsRoute.routeId,
        routeShortName: gtfsRoute.routeShortName,
        routeColor: gtfsRoute.routeColor,
      })
      .from(gtfsRoute)
      .where(
        or(
          isNotNull(gtfsRoute.routeShortName),
          isNotNull(gtfsRoute.routeColor),
        ),
      );

    const map: Record<string, { lineCode: string; routeColour?: string }> = {};
    for (const r of rows) {
      if (r.routeId && (r.routeShortName || r.routeColor)) {
        map[r.routeId] = {
          lineCode: r.routeShortName ?? '',
          routeColour: r.routeColor ?? undefined,
        };
      }
    }
    await this.cache.set(cacheKey, map, CacheTTL.ROUTE_MAP);
    return new Map(Object.entries(map));
  }

  /**
   * Returns route IDs for NSW intercity lines (BMT, CCN, HUN, SCO, SHL).
   * Used to filter sydneytrains realtime data when mode=intercity is requested.
   */
  async getIntercityRouteIds(): Promise<Set<string>> {
    const cacheKey = 'gtfs:intercity_route_ids';
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return new Set(cached);

    const rows = await this.db
      .select({ routeId: gtfsRoute.routeId })
      .from(gtfsRoute)
      .where(
        inArray(
          gtfsRoute.routeShortName,
          [...INTERCITY_ROUTE_SHORT_NAMES],
        ),
      );

    const ids = rows.map((r) => r.routeId).filter(Boolean);
    await this.cache.set(cacheKey, ids, CacheTTL.INTERCITY_ROUTES);
    return new Set(ids);
  }

  async getRoutes(
    mode?: string,
    limit = 100,
  ): Promise<(typeof gtfsRoute.$inferSelect)[]> {
    if (mode) {
      return this.db
        .select()
        .from(gtfsRoute)
        .where(eq(gtfsRoute.mode, mode))
        .limit(limit);
    }
    return this.db.select().from(gtfsRoute).limit(limit);
  }

  async getStops(
    mode?: string,
    limit = 100,
  ): Promise<(typeof gtfsStop.$inferSelect)[]> {
    if (mode) {
      return this.db
        .select()
        .from(gtfsStop)
        .where(eq(gtfsStop.mode, mode))
        .limit(limit);
    }
    return this.db.select().from(gtfsStop).limit(limit);
  }

  async getTrips(
    routeId?: string,
    limit = 100,
  ): Promise<(typeof gtfsTrip.$inferSelect)[]> {
    return this.db.select().from(gtfsTrip).limit(limit);
  }
}
