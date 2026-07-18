import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PaginatedResult } from './dto/gtfs-static.objects';
import * as unzipper from 'unzipper';
import { parse } from 'csv-parse';
import { inArray, eq, isNotNull, or, sql, count } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { DRIZZLE } from '../database/database.module';
import type { DrizzleDB } from '../database/database.module';
import {
  gtfsStop,
  gtfsRoute,
  gtfsTrip,
  gtfsCalendar,
  gtfsCalendarDate,
  gtfsStopTime,
  gtfsStopRoute,
  gtfsIngestFeedRun,
} from '../database/schema/gtfs.schema';
import { CacheService } from '../cache/cache.service';
import { CacheTTL } from '../cache/cache.constants';
import { sydneyLocalDate } from '../history/sydney-date.util';
import { resolveLine } from '../history/line-identity.util';
import { TfnswHttpClient } from '../transport/tfnsw-http.client';
import { S3Service } from '../storage/s3.service';
import {
  GTFS_SCHEDULE_FEEDS,
  getScheduleFeed,
  getScheduleFeedsForLogicalMode,
  isConsolidatedBusesUrl,
  type GtfsScheduleFeed,
} from './gtfs-schedule.feeds';
import {
  csvField,
  dedupeByKey,
  formatIngestError,
  normalizeCsvHeader,
  parseOptionalFloat,
  parseOptionalInt,
  stripUtf8Bom,
} from './gtfs-ingest.util';

/** NSW intercity lines: Blue Mountains, Central Coast, Hunter, South Coast, Southern Highlands */
const INTERCITY_ROUTE_SHORT_NAMES = [
  'BMT',
  'CCN',
  'HUN',
  'SCO',
  'SHL',
] as const;

const BATCH_SIZE = 500;
const REQUIRED_ZIP_FILES = ['routes.txt'] as const;

type CsvRecord = Record<string, string>;

export interface GtfsIngestFeedResult {
  feedKey: string;
  mode: string;
  success: boolean;
  skippedUnchanged?: boolean;
  error?: string;
  routesCount?: number;
  tripsCount?: number;
  stopsCount?: number;
  stopTimesCount?: number;
}

export interface GtfsIngestOptions {
  /**
   * When true, always GET from TfNSW (skip HEAD Last-Modified / S3 / local short-circuit).
   * Still uses the static API key gate, S3 persistence, and per-feed replace.
   */
  force?: boolean;
}

@Injectable()
export class GtfsStaticService {
  private readonly logger = new Logger(GtfsStaticService.name);
  /** In-memory ZIP fallback when S3 is not configured (dev/tests). */
  private readonly localZipCache = new Map<
    string,
    { buffer: Buffer; lastModified?: string }
  >();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly cache: CacheService,
    private readonly tfnsw: TfnswHttpClient,
    private readonly s3: S3Service,
  ) {}

  async ingestAll(
    options: GtfsIngestOptions = {},
  ): Promise<GtfsIngestFeedResult[]> {
    if (options.force) {
      this.logger.log(
        'Force GTFS ingest: re-downloading all catalog feeds via static API key + S3 pipeline',
      );
    }
    const results: GtfsIngestFeedResult[] = [];
    for (const feed of GTFS_SCHEDULE_FEEDS) {
      results.push(await this.ingestFeed(feed, options));
    }
    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      this.logger.warn(
        `GTFS ingestAll finished with ${failed.length}/${results.length} failures: ${failed
          .map((f) => `${f.feedKey} (${f.error ?? 'unknown'})`)
          .join('; ')}`,
      );
    }
    return results;
  }

  /**
   * Ingest by feedKey, or by logical mode (all feeds for that mode).
   * Back-compat: `mode` query param may be a feedKey or logicalMode.
   */
  async ingestMode(
    modeOrFeedKey: string,
    options: GtfsIngestOptions = {},
  ): Promise<GtfsIngestFeedResult | GtfsIngestFeedResult[]> {
    const feed = getScheduleFeed(modeOrFeedKey);
    if (feed) return this.ingestFeed(feed, options);

    const byMode = getScheduleFeedsForLogicalMode(modeOrFeedKey);
    if (byMode.length > 0) {
      const results: GtfsIngestFeedResult[] = [];
      for (const f of byMode) {
        results.push(await this.ingestFeed(f, options));
      }
      return results;
    }

    return {
      feedKey: modeOrFeedKey,
      mode: modeOrFeedKey,
      success: false,
      error: 'Unknown feed or mode',
    };
  }

  async ingestFeed(
    feed: GtfsScheduleFeed,
    options: GtfsIngestOptions = {},
  ): Promise<GtfsIngestFeedResult> {
    const { feedKey, logicalMode, url } = feed;
    this.logger.log(
      `Starting GTFS static ingestion for: ${feedKey}` +
        (options.force ? ' (force)' : ''),
    );

    if (isConsolidatedBusesUrl(url)) {
      return {
        feedKey,
        mode: logicalMode,
        success: false,
        error: 'Refusing consolidated /buses endpoint (invalid per TfNSW)',
      };
    }

    const runId = randomUUID();
    await this.db.insert(gtfsIngestFeedRun).values({
      id: runId,
      feedKey,
      logicalMode,
      startedAt: new Date(),
    });

    try {
      const head = await this.tfnsw.head(url, 'static');
      if (head.status < 200 || head.status >= 300) {
        throw new Error(`HEAD failed with status ${head.status}`);
      }

      const remoteLastModified = head.lastModified;
      const { buffer, fromCache, s3Key } = await this.resolveZipBuffer(
        feed,
        remoteLastModified,
        options,
      );

      const counts = await this.processZip(buffer, logicalMode, feedKey);
      await this.refreshStopRoutesMapping(logicalMode, feedKey);

      await this.db
        .update(gtfsIngestFeedRun)
        .set({
          finishedAt: new Date(),
          success: true,
          skippedUnchanged: fromCache,
          headLastModified: remoteLastModified,
          s3Key,
          bytes: buffer.length,
          httpStatus: fromCache ? 304 : 200,
          routesCount: counts.routesCount,
          tripsCount: counts.tripsCount,
          stopsCount: counts.stopsCount,
          stopTimesCount: counts.stopTimesCount,
        })
        .where(eq(gtfsIngestFeedRun.id, runId));

      this.logger.log(
        `Completed GTFS static ingestion for: ${feedKey}` +
          (fromCache ? ' (from S3/cache, unchanged)' : ''),
      );

      return {
        feedKey,
        mode: logicalMode,
        success: true,
        skippedUnchanged: fromCache,
        ...counts,
      };
    } catch (err) {
      const msg = formatIngestError(err);
      this.logger.error(`GTFS ingestion failed for ${feedKey}: ${msg}`);
      if (err instanceof Error && err.stack) {
        this.logger.debug(err.stack);
      }
      await this.db
        .update(gtfsIngestFeedRun)
        .set({
          finishedAt: new Date(),
          success: false,
          error: msg.slice(0, 2000),
        })
        .where(eq(gtfsIngestFeedRun.id, runId));
      return { feedKey, mode: logicalMode, success: false, error: msg };
    }
  }

  private async resolveZipBuffer(
    feed: GtfsScheduleFeed,
    remoteLastModified?: string,
    options: GtfsIngestOptions = {},
  ): Promise<{ buffer: Buffer; fromCache: boolean; s3Key?: string }> {
    const { feedKey, url } = feed;

    if (!options.force && remoteLastModified && this.s3.isEnabled()) {
      const latest = await this.s3.headLatest(feedKey);
      if (latest.exists && latest.lastModified === remoteLastModified) {
        this.logger.log(
          `Skipping GET for ${feedKey}; Last-Modified unchanged (${remoteLastModified})`,
        );
        const buffer = await this.s3.getLatestBuffer(feedKey);
        return { buffer, fromCache: true, s3Key: latest.key };
      }
    }

    if (!options.force) {
      const local = this.localZipCache.get(feedKey);
      if (
        remoteLastModified &&
        local?.lastModified === remoteLastModified &&
        local.buffer.length > 0
      ) {
        this.logger.log(
          `Skipping GET for ${feedKey}; using local cache (Last-Modified match)`,
        );
        return { buffer: local.buffer, fromCache: true };
      }
    } else {
      this.logger.log(`Force GET for ${feedKey} (bypassing Last-Modified skip)`);
    }

    const downloaded = await this.tfnsw.getScheduleZip(url);
    if (downloaded.status < 200 || downloaded.status >= 300) {
      throw new Error(`GET failed with status ${downloaded.status}`);
    }

    const buffer = downloaded.data;
    const lastModified = downloaded.lastModified ?? remoteLastModified;
    const day = sydneyLocalDate(new Date());

    let s3Key: string | undefined;
    if (this.s3.isEnabled()) {
      const put = await this.s3.putGtfsZip(feedKey, buffer, {
        lastModified,
        day,
      });
      s3Key = put.latestKey;
    }

    this.localZipCache.set(feedKey, { buffer, lastModified });
    return { buffer, fromCache: false, s3Key };
  }

  private async processZip(
    buffer: Buffer,
    mode: string,
    feedKey: string,
  ): Promise<{
    routesCount: number;
    tripsCount: number;
    stopsCount: number;
    stopTimesCount: number;
  }> {
    const directory = await unzipper.Open.buffer(buffer);
    const fileMap = new Map(
      directory.files
        .filter((f) => f.type === 'File')
        .map((f) => [f.path.replace(/^\.\//, '').split('/').pop()!, f]),
    );

    for (const required of REQUIRED_ZIP_FILES) {
      if (!fileMap.has(required)) {
        throw new Error(`Invalid GTFS ZIP: missing ${required}`);
      }
    }

    return this.replaceFeedData(feedKey, async () => {
      const stopsCount = await this.ingestStops(fileMap, mode, feedKey);
      const routesCount = await this.ingestRoutes(fileMap, mode, feedKey);
      if (routesCount < 1) {
        throw new Error(
          `ZIP validation failed for ${feedKey}: routes.txt missing or empty`,
        );
      }
      const tripsCount = await this.ingestTrips(fileMap, mode, feedKey);
      await this.ingestCalendar(fileMap, mode, feedKey);
      await this.ingestCalendarDates(fileMap, mode, feedKey);
      const stopTimesCount = await this.ingestStopTimes(fileMap, mode, feedKey);
      return { stopsCount, routesCount, tripsCount, stopTimesCount };
    });
  }

  /**
   * Delete existing rows for feedKey then run inserts inside a transaction.
   */
  private async replaceFeedData<T>(
    feedKey: string,
    insertFn: () => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.delete(gtfsStopRoute).where(eq(gtfsStopRoute.feedKey, feedKey));
      await tx.delete(gtfsStopTime).where(eq(gtfsStopTime.feedKey, feedKey));
      await tx
        .delete(gtfsCalendarDate)
        .where(eq(gtfsCalendarDate.feedKey, feedKey));
      await tx.delete(gtfsCalendar).where(eq(gtfsCalendar.feedKey, feedKey));
      await tx.delete(gtfsTrip).where(eq(gtfsTrip.feedKey, feedKey));
      await tx.delete(gtfsRoute).where(eq(gtfsRoute.feedKey, feedKey));
      await tx.delete(gtfsStop).where(eq(gtfsStop.feedKey, feedKey));

      // Temporarily route inserts through the transaction connection.
      const previousDb = this.db;
      const mutable = this as unknown as { db: DrizzleDB };
      mutable.db = tx as unknown as DrizzleDB;
      try {
        return await insertFn();
      } finally {
        mutable.db = previousDb;
      }
    });
  }

  private async parseCsvFromZipEntry(
    entry: unzipper.File,
  ): Promise<CsvRecord[]> {
    const content = stripUtf8Bom(await entry.buffer());
    return new Promise((resolve, reject) => {
      parse(
        content,
        {
          columns: (headers: string[]) => headers.map(normalizeCsvHeader),
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true,
        },
        (err, records: CsvRecord[]) => {
          if (err) reject(err);
          else resolve(records);
        },
      );
    });
  }

  /** Stream-parse large CSV entries (stop_times) in batches. */
  private async forEachCsvBatch(
    entry: unzipper.File,
    onBatch: (batch: CsvRecord[]) => Promise<void>,
  ): Promise<number> {
    let total = 0;
    let batch: CsvRecord[] = [];
    // Buffer first so we can strip BOM (entry.stream() may include EF BB BF).
    // Wrap in an array so the Buffer is emitted as one chunk (TypedArray
    // iterables would otherwise yield byte-by-byte).
    const content = stripUtf8Bom(await entry.buffer());
    const stream = Readable.from([content]);

    await new Promise<void>((resolve, reject) => {
      const parser = parse({
        columns: (headers: string[]) => headers.map(normalizeCsvHeader),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });

      parser.on('readable', () => {
        let record: CsvRecord;
        while ((record = parser.read() as CsvRecord) != null) {
          batch.push(record);
          if (batch.length >= BATCH_SIZE) {
            parser.pause();
            const toFlush = batch;
            batch = [];
            total += toFlush.length;
            onBatch(toFlush)
              .then(() => parser.resume())
              .catch(reject);
          }
        }
      });
      parser.on('error', reject);
      parser.on('end', () => {
        const finish = async () => {
          if (batch.length > 0) {
            total += batch.length;
            await onBatch(batch);
            batch = [];
          }
          resolve();
        };
        finish().catch(reject);
      });
      stream.on('error', reject);
      stream.pipe(parser);
    });

    return total;
  }

  private async ingestStops(
    fileMap: Map<string, unzipper.File>,
    mode: string,
    feedKey: string,
  ): Promise<number> {
    const entry = fileMap.get('stops.txt');
    if (!entry) return 0;
    const records = await this.parseCsvFromZipEntry(entry);
    const mapped = dedupeByKey(
      records.map((r) => {
        const stopId = csvField(r, 'stop_id');
        return {
          stopId,
          stopCode: csvField(r, 'stop_code') || null,
          stopName: csvField(r, 'stop_name') || stopId || 'Unknown',
          stopLat: parseOptionalFloat(csvField(r, 'stop_lat')),
          stopLon: parseOptionalFloat(csvField(r, 'stop_lon')),
          locationType: parseOptionalInt(csvField(r, 'location_type')),
          parentStation: csvField(r, 'parent_station') || null,
          wheelchairBoarding: parseOptionalInt(
            csvField(r, 'wheelchair_boarding'),
          ),
          platformCode: csvField(r, 'platform_code') || null,
          mode,
          feedKey,
          updatedAt: new Date(),
        };
      }),
      (r) => r.stopId,
    );
    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const batch = mapped.slice(i, i + BATCH_SIZE);
      if (batch.length === 0) continue;
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
            feedKey: sql`excluded.feed_key`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    if (records.length > 0 && mapped.length === 0) {
      const sampleKeys = Object.keys(records[0] ?? {}).slice(0, 8).join(',');
      throw new Error(
        `No valid stop_id values in stops.txt for ${feedKey} (${records.length} rows). ` +
          `CSV headers seen: [${sampleKeys}]. Likely UTF-8 BOM / header mismatch.`,
      );
    }
    this.logger.debug(
      `Ingested ${mapped.length} stops for ${feedKey} (${records.length} csv rows)`,
    );
    return mapped.length;
  }

  private async ingestRoutes(
    fileMap: Map<string, unzipper.File>,
    mode: string,
    feedKey: string,
  ): Promise<number> {
    const entry = fileMap.get('routes.txt');
    if (!entry) return 0;
    const records = await this.parseCsvFromZipEntry(entry);
    const mapped = dedupeByKey(
      records.map((r) => ({
        routeId: csvField(r, 'route_id'),
        agencyId: csvField(r, 'agency_id') || null,
        routeShortName: csvField(r, 'route_short_name') || null,
        routeLongName: csvField(r, 'route_long_name') || null,
        routeType: parseOptionalInt(csvField(r, 'route_type')),
        routeColor: csvField(r, 'route_color') || null,
        routeTextColor: csvField(r, 'route_text_color') || null,
        mode,
        feedKey,
        updatedAt: new Date(),
      })),
      (r) => r.routeId,
    );
    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const batch = mapped.slice(i, i + BATCH_SIZE);
      if (batch.length === 0) continue;
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
            feedKey: sql`excluded.feed_key`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    this.logger.debug(
      `Ingested ${mapped.length} routes for ${feedKey} (${records.length} csv rows)`,
    );
    return mapped.length;
  }

  private async ingestTrips(
    fileMap: Map<string, unzipper.File>,
    mode: string,
    feedKey: string,
  ): Promise<number> {
    const entry = fileMap.get('trips.txt');
    if (!entry) return 0;
    const records = await this.parseCsvFromZipEntry(entry);
    const mapped = dedupeByKey(
      records.map((r) => ({
        tripId: csvField(r, 'trip_id'),
        routeId: csvField(r, 'route_id') || null,
        serviceId: csvField(r, 'service_id') || null,
        tripHeadsign: csvField(r, 'trip_headsign') || null,
        tripShortName: csvField(r, 'trip_short_name') || null,
        directionId: parseOptionalInt(csvField(r, 'direction_id')),
        shapeId: csvField(r, 'shape_id') || null,
        wheelchairAccessible: parseOptionalInt(
          csvField(r, 'wheelchair_accessible'),
        ),
        mode,
        feedKey,
        updatedAt: new Date(),
      })),
      (r) => r.tripId,
    );
    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const batch = mapped.slice(i, i + BATCH_SIZE);
      if (batch.length === 0) continue;
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
            feedKey: sql`excluded.feed_key`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    this.logger.debug(
      `Ingested ${mapped.length} trips for ${feedKey} (${records.length} csv rows)`,
    );
    return mapped.length;
  }

  private async ingestCalendar(
    fileMap: Map<string, unzipper.File>,
    mode: string,
    feedKey: string,
  ): Promise<void> {
    const entry = fileMap.get('calendar.txt');
    if (!entry) return;
    const records = await this.parseCsvFromZipEntry(entry);
    const mapped = dedupeByKey(
      records.map((r) => ({
        serviceId: csvField(r, 'service_id'),
        monday: parseInt(csvField(r, 'monday') || '0', 10),
        tuesday: parseInt(csvField(r, 'tuesday') || '0', 10),
        wednesday: parseInt(csvField(r, 'wednesday') || '0', 10),
        thursday: parseInt(csvField(r, 'thursday') || '0', 10),
        friday: parseInt(csvField(r, 'friday') || '0', 10),
        saturday: parseInt(csvField(r, 'saturday') || '0', 10),
        sunday: parseInt(csvField(r, 'sunday') || '0', 10),
        startDate: csvField(r, 'start_date'),
        endDate: csvField(r, 'end_date'),
        mode,
        feedKey,
        updatedAt: new Date(),
      })),
      (r) => r.serviceId,
    );
    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const batch = mapped.slice(i, i + BATCH_SIZE);
      if (batch.length === 0) continue;
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
            feedKey: sql`excluded.feed_key`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
  }

  private async ingestCalendarDates(
    fileMap: Map<string, unzipper.File>,
    mode: string,
    feedKey: string,
  ): Promise<void> {
    const entry = fileMap.get('calendar_dates.txt');
    if (!entry) return;
    const records = await this.parseCsvFromZipEntry(entry);
    const mapped = dedupeByKey(
      records.map((r) => {
        const serviceId = csvField(r, 'service_id');
        const date = csvField(r, 'date');
        return {
          id: `${serviceId}_${date}`,
          serviceId,
          date,
          exceptionType: parseInt(csvField(r, 'exception_type') || '0', 10),
          mode,
          feedKey,
        };
      }),
      (r) => r.id,
    );
    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const batch = mapped.slice(i, i + BATCH_SIZE);
      if (batch.length === 0) continue;
      await this.db
        .insert(gtfsCalendarDate)
        .values(batch)
        .onConflictDoUpdate({
          target: gtfsCalendarDate.id,
          set: {
            serviceId: sql`excluded.service_id`,
            date: sql`excluded.date`,
            exceptionType: sql`excluded.exception_type`,
            mode: sql`excluded.mode`,
            feedKey: sql`excluded.feed_key`,
          },
        });
    }
  }

  private async ingestStopTimes(
    fileMap: Map<string, unzipper.File>,
    mode: string,
    feedKey: string,
  ): Promise<number> {
    const entry = fileMap.get('stop_times.txt');
    if (!entry) return 0;

    let inserted = 0;
    await this.forEachCsvBatch(entry, async (records) => {
      const batch = dedupeByKey(
        records.map((r) => {
          const tripId = csvField(r, 'trip_id');
          const stopSequence =
            parseOptionalInt(csvField(r, 'stop_sequence')) ?? 0;
          return {
            id: `${tripId}_${stopSequence}`,
            tripId,
            arrivalTime: csvField(r, 'arrival_time') || null,
            departureTime: csvField(r, 'departure_time') || null,
            stopId: csvField(r, 'stop_id'),
            stopSequence,
            pickupType: parseOptionalInt(csvField(r, 'pickup_type')),
            dropOffType: parseOptionalInt(csvField(r, 'drop_off_type')),
            mode,
            feedKey,
          };
        }),
        (r) => r.id,
      );
      if (batch.length === 0) return;
      await this.db
        .insert(gtfsStopTime)
        .values(batch)
        .onConflictDoUpdate({
          target: gtfsStopTime.id,
          set: {
            tripId: sql`excluded.trip_id`,
            arrivalTime: sql`excluded.arrival_time`,
            departureTime: sql`excluded.departure_time`,
            stopId: sql`excluded.stop_id`,
            stopSequence: sql`excluded.stop_sequence`,
            pickupType: sql`excluded.pickup_type`,
            dropOffType: sql`excluded.drop_off_type`,
            mode: sql`excluded.mode`,
            feedKey: sql`excluded.feed_key`,
          },
        });
      inserted += batch.length;
    });

    this.logger.debug(`Ingested ${inserted} stop_times for ${feedKey}`);
    return inserted;
  }

  /**
   * Returns route_id → metadata (lineCode, routeColour) for all routes with
   * route_short_name or route_color. Used to enrich vehicle positions and
   * trip updates. Cached 1 hour to avoid per-request DB queries.
   */
  async getRouteMetadataMap(): Promise<
    Map<string, { lineCode: string; routeColour?: string; routeName?: string }>
  > {
    const cacheKey = 'gtfs:route_metadata';
    const cached =
      await this.cache.get<
        Record<string, { lineCode: string; routeColour?: string; routeName?: string }>
      >(cacheKey);
    if (cached) return new Map(Object.entries(cached));

    const rows = await this.db
      .select({
        routeId: gtfsRoute.routeId,
        routeShortName: gtfsRoute.routeShortName,
        routeLongName: gtfsRoute.routeLongName,
        routeColor: gtfsRoute.routeColor,
      })
      .from(gtfsRoute)
      .where(
        or(
          isNotNull(gtfsRoute.routeShortName),
          isNotNull(gtfsRoute.routeLongName),
          isNotNull(gtfsRoute.routeColor),
        ),
      );

    const map: Record<string, { lineCode: string; routeColour?: string; routeName?: string }> = {};
    for (const r of rows) {
      if (r.routeId && (r.routeShortName || r.routeLongName || r.routeColor)) {
        map[r.routeId] = {
          lineCode: r.routeShortName ?? '',
          routeColour: r.routeColor ?? undefined,
          routeName: r.routeLongName || r.routeShortName || undefined,
        };
      }
    }
    await this.cache.set(cacheKey, map, CacheTTL.ROUTE_MAP);
    return new Map(Object.entries(map));
  }

  /**
   * Fetches specific route metadata efficiently for GraphQL DataLoaders.
   */
  async getRouteMetadataByTripIds(tripIds: string[]): Promise<
    {
      tripId: string;
      routeId?: string;
      lineCode?: string;
      routeColour?: string;
    }[]
  > {
    if (!tripIds.length) return [];

    const rows = await this.db
      .select({
        tripId: gtfsTrip.tripId,
        routeId: gtfsTrip.routeId,
        lineCode: gtfsRoute.routeShortName,
        routeColour: gtfsRoute.routeColor,
      })
      .from(gtfsTrip)
      .leftJoin(gtfsRoute, eq(gtfsTrip.routeId, gtfsRoute.routeId))
      .where(inArray(gtfsTrip.tripId, tripIds));

    return rows.map((r) => ({
      tripId: r.tripId,
      routeId: r.routeId ?? undefined,
      lineCode: r.lineCode ?? undefined,
      routeColour: r.routeColour ?? undefined,
    }));
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
        inArray(gtfsRoute.routeShortName, [...INTERCITY_ROUTE_SHORT_NAMES]),
      );

    const ids = rows.map((r) => r.routeId).filter(Boolean);
    await this.cache.set(cacheKey, ids, CacheTTL.INTERCITY_ROUTES);
    return new Set(ids);
  }

  /**
   * Resolves stopId → routeIds via gtfs_stop_routes (for alert entity enrichment).
   */
  async getRouteIdsForStopIds(
    stopIds: string[],
  ): Promise<Map<string, string[]>> {
    const unique = [...new Set(stopIds.filter(Boolean))];
    const result = new Map<string, string[]>();
    if (unique.length === 0) return result;

    const rows = await this.db
      .select({
        stopId: gtfsStopRoute.stopId,
        routeId: gtfsStopRoute.routeId,
      })
      .from(gtfsStopRoute)
      .where(inArray(gtfsStopRoute.stopId, unique));

    for (const row of rows) {
      const list = result.get(row.stopId) ?? [];
      list.push(row.routeId);
      result.set(row.stopId, list);
    }
    return result;
  }

  /**
   * Resolves tripId → routeId for trips missing routeId in realtime feeds.
   */
  async getRouteIdsForTripIds(
    tripIds: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(tripIds.filter(Boolean))];
    const result = new Map<string, string>();
    if (unique.length === 0) return result;

    const rows = await this.db
      .select({
        tripId: gtfsTrip.tripId,
        routeId: gtfsTrip.routeId,
      })
      .from(gtfsTrip)
      .where(inArray(gtfsTrip.tripId, unique));

    for (const row of rows) {
      if (row.routeId) result.set(row.tripId, row.routeId);
    }
    return result;
  }

  /**
   * Counts GTFS trips scheduled to run today (Sydney calendar), grouped by
   * mode|line for comparison against realtime tracked trips.
   */
  async getScheduledTripCountsByLine(
    at: Date = new Date(),
  ): Promise<Map<string, number>> {
    const day = sydneyLocalDate(at);
    const cacheKey = `gtfs:scheduled_trips_by_line:${day}`;
    const cached = await this.cache.get<Record<string, number>>(cacheKey);
    if (cached) return new Map(Object.entries(cached));

    const yyyymmdd = day.replace(/-/g, '');
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0=Sun
    const dowColumn = [
      gtfsCalendar.sunday,
      gtfsCalendar.monday,
      gtfsCalendar.tuesday,
      gtfsCalendar.wednesday,
      gtfsCalendar.thursday,
      gtfsCalendar.friday,
      gtfsCalendar.saturday,
    ][dow];

    const routeMeta = await this.getRouteMetadataMap();

    // Regular calendar services active today
    const regular = await this.db
      .select({
        tripId: gtfsTrip.tripId,
        routeId: gtfsTrip.routeId,
        mode: gtfsTrip.mode,
        serviceId: gtfsTrip.serviceId,
      })
      .from(gtfsTrip)
      .innerJoin(
        gtfsCalendar,
        eq(gtfsTrip.serviceId, gtfsCalendar.serviceId),
      )
      .where(
        sql`${gtfsCalendar.startDate} <= ${yyyymmdd}
            AND ${gtfsCalendar.endDate} >= ${yyyymmdd}
            AND ${dowColumn} = 1`,
      );

    // Exception removals (type 2) and additions (type 1) for today
    const exceptions = await this.db
      .select({
        serviceId: gtfsCalendarDate.serviceId,
        exceptionType: gtfsCalendarDate.exceptionType,
      })
      .from(gtfsCalendarDate)
      .where(eq(gtfsCalendarDate.date, yyyymmdd));

    const removed = new Set(
      exceptions.filter((e) => e.exceptionType === 2).map((e) => e.serviceId),
    );
    const addedServiceIds = exceptions
      .filter((e) => e.exceptionType === 1)
      .map((e) => e.serviceId);

    const addedTrips =
      addedServiceIds.length > 0
        ? await this.db
            .select({
              tripId: gtfsTrip.tripId,
              routeId: gtfsTrip.routeId,
              mode: gtfsTrip.mode,
              serviceId: gtfsTrip.serviceId,
            })
            .from(gtfsTrip)
            .where(inArray(gtfsTrip.serviceId, addedServiceIds))
        : [];

    const counts = new Map<string, number>();
    const bump = (mode: string | null, routeId: string | null) => {
      if (!routeId || !mode) return;
      const line = resolveLine(routeId, null, routeMeta);
      const key = `${mode}|${line}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    };

    for (const trip of regular) {
      if (trip.serviceId && removed.has(trip.serviceId)) continue;
      bump(trip.mode, trip.routeId);
    }
    for (const trip of addedTrips) {
      bump(trip.mode, trip.routeId);
    }

    await this.cache.set(
      cacheKey,
      Object.fromEntries(counts),
      CacheTTL.SCHEDULED_TRIPS,
    );
    return counts;
  }

  async getRoutes(
    mode?: string,
    limit = 100,
    offset = 0,
  ): Promise<PaginatedResult<typeof gtfsRoute.$inferSelect>> {
    const baseQuery = this.db.select().from(gtfsRoute);
    const countQuery = this.db.select({ total: count() }).from(gtfsRoute);

    const [data, countResult] = await Promise.all([
      mode
        ? baseQuery.where(eq(gtfsRoute.mode, mode)).limit(limit).offset(offset)
        : baseQuery.limit(limit).offset(offset),
      mode ? countQuery.where(eq(gtfsRoute.mode, mode)) : countQuery,
    ]);

    const total = countResult[0]?.total ?? 0;
    return { data, total, limit, offset, hasNextPage: offset + limit < total };
  }

  async getStops(
    mode?: string,
    limit = 100,
    offset = 0,
  ): Promise<PaginatedResult<typeof gtfsStop.$inferSelect>> {
    const baseQuery = this.db.select().from(gtfsStop);
    const countQuery = this.db.select({ total: count() }).from(gtfsStop);

    const [data, countResult] = await Promise.all([
      mode
        ? baseQuery.where(eq(gtfsStop.mode, mode)).limit(limit).offset(offset)
        : baseQuery.limit(limit).offset(offset),
      mode ? countQuery.where(eq(gtfsStop.mode, mode)) : countQuery,
    ]);

    const total = countResult[0]?.total ?? 0;
    return { data, total, limit, offset, hasNextPage: offset + limit < total };
  }

  async getTrips(
    routeId?: string,
    limit = 100,
    offset = 0,
  ): Promise<PaginatedResult<typeof gtfsTrip.$inferSelect>> {
    const baseQuery = this.db.select().from(gtfsTrip);
    const countQuery = this.db.select({ total: count() }).from(gtfsTrip);

    const [data, countResult] = await Promise.all([
      routeId
        ? baseQuery
            .where(eq(gtfsTrip.routeId, routeId))
            .limit(limit)
            .offset(offset)
        : baseQuery.limit(limit).offset(offset),
      routeId ? countQuery.where(eq(gtfsTrip.routeId, routeId)) : countQuery,
    ]);

    const total = countResult[0]?.total ?? 0;
    return { data, total, limit, offset, hasNextPage: offset + limit < total };
  }

  async getStopTimes(
    tripId?: string,
    stopId?: string,
    limit = 100,
    offset = 0,
  ): Promise<PaginatedResult<typeof gtfsStopTime.$inferSelect>> {
    const baseQuery = this.db.select().from(gtfsStopTime);
    const countQuery = this.db.select({ total: count() }).from(gtfsStopTime);

    const filterClause = tripId
      ? eq(gtfsStopTime.tripId, tripId)
      : stopId
        ? eq(gtfsStopTime.stopId, stopId)
        : undefined;

    const [data, countResult] = await Promise.all([
      filterClause
        ? baseQuery.where(filterClause).limit(limit).offset(offset)
        : baseQuery.limit(limit).offset(offset),
      filterClause ? countQuery.where(filterClause) : countQuery,
    ]);

    const total = countResult[0]?.total ?? 0;
    return { data, total, limit, offset, hasNextPage: offset + limit < total };
  }

  async getStopsCount(mode?: string): Promise<number> {
    const query = this.db.select({ total: count() }).from(gtfsStop);
    if (mode) {
      const result = await query.where(eq(gtfsStop.mode, mode));
      return result[0]?.total ?? 0;
    }
    const result = await query;
    return result[0]?.total ?? 0;
  }

  async getRoutesCount(mode?: string): Promise<number> {
    const query = this.db.select({ total: count() }).from(gtfsRoute);
    if (mode) {
      const result = await query.where(eq(gtfsRoute.mode, mode));
      return result[0]?.total ?? 0;
    }
    const result = await query;
    return result[0]?.total ?? 0;
  }

  async getTripsCount(routeId?: string): Promise<number> {
    const query = this.db.select({ total: count() }).from(gtfsTrip);
    if (routeId) {
      const result = await query.where(eq(gtfsTrip.routeId, routeId));
      return result[0]?.total ?? 0;
    }
    const result = await query;
    return result[0]?.total ?? 0;
  }

  async getIngestStatus(): Promise<{
    feeds: typeof GTFS_SCHEDULE_FEEDS;
    lastRuns: {
      feedKey: string;
      success: boolean | null;
      finishedAt: Date | null;
      routesCount: number | null;
      error: string | null;
      skippedUnchanged: boolean | null;
    }[];
  }> {
    const runs = await this.db
      .select()
      .from(gtfsIngestFeedRun)
      .orderBy(sql`${gtfsIngestFeedRun.startedAt} desc`)
      .limit(200);

    const latestByFeed = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      if (!latestByFeed.has(run.feedKey)) {
        latestByFeed.set(run.feedKey, run);
      }
    }

    return {
      feeds: GTFS_SCHEDULE_FEEDS,
      lastRuns: [...latestByFeed.values()].map((r) => ({
        feedKey: r.feedKey,
        success: r.success,
        finishedAt: r.finishedAt,
        routesCount: r.routesCount,
        error: r.error,
        skippedUnchanged: r.skippedUnchanged,
      })),
    };
  }

  /**
   * Refreshes the mapping between stops and routes.
   * This is a heavy operation that performs a DISTINCT join across stop_times and trips.
   * It should be called after GTFS static data has been updated.
   */
  async refreshStopRoutesMapping(
    mode?: string,
    feedKey?: string,
  ): Promise<void> {
    this.logger.log(
      `Refreshing stop-routes mapping${mode ? ` for mode: ${mode}` : ''}${feedKey ? ` feed: ${feedKey}` : ''}...`,
    );

    if (feedKey) {
      await this.db
        .delete(gtfsStopRoute)
        .where(eq(gtfsStopRoute.feedKey, feedKey));
    }

    const whereParts = [];
    if (mode) whereParts.push(sql`st.mode = ${mode}`);
    if (feedKey) whereParts.push(sql`st.feed_key = ${feedKey}`);
    const modeClause =
      whereParts.length > 0
        ? sql`WHERE ${sql.join(whereParts, sql` AND `)}`
        : sql``;

    await this.db.execute(sql`
      INSERT INTO ${gtfsStopRoute} (stop_id, route_id, mode, feed_key)
      SELECT DISTINCT st.stop_id, t.route_id, st.mode, st.feed_key
      FROM ${gtfsStopTime} st
      JOIN ${gtfsTrip} t ON st.trip_id = t.trip_id
      ${modeClause}
      ON CONFLICT (stop_id, route_id) DO UPDATE SET
        mode = excluded.mode,
        feed_key = excluded.feed_key
    `);

    this.logger.log(`Completed stop-routes mapping refresh.`);
  }
}
