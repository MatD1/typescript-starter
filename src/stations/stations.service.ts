import { Inject, Injectable } from '@nestjs/common';
import { ilike, eq, and, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import type { DrizzleDB } from '../database/database.module';
import { gtfsStop } from '../database/schema/gtfs.schema';
import { CacheService } from '../cache/cache.service';
import { CacheTTL } from '../cache/cache.constants';
import { StationObject } from './dto/station.object';

@Injectable()
export class StationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly cache: CacheService,
  ) {}

  async search(query: string, limit = 20): Promise<StationObject[]> {
    const cacheKey = `stations:search:${query.toLowerCase()}:${limit}`;
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.db
          .select()
          .from(gtfsStop)
          .where(ilike(gtfsStop.stopName, `%${query}%`))
          .limit(limit);
        return rows.map((row) => this.mapRow(row));
      },
      CacheTTL.STOP_SEARCH,
    );
  }

  async findById(stopId: string): Promise<StationObject | null> {
    const cacheKey = `stations:id:${stopId}`;
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.db
          .select()
          .from(gtfsStop)
          .where(eq(gtfsStop.stopId, stopId))
          .limit(1);
        return rows[0] ? this.mapRow(rows[0]) : null;
      },
      CacheTTL.STOP_SEARCH,
    );
  }

  async findNearby(
    lat: number,
    lon: number,
    radiusMetres = 500,
    limit = 20,
  ): Promise<StationObject[]> {
    const cacheKey = `stations:nearby:${lat}:${lon}:${radiusMetres}`;
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const radiusDeg = radiusMetres / 111320;
        const latMin = lat - radiusDeg;
        const latMax = lat + radiusDeg;
        const lonMin = lon - radiusDeg;
        const lonMax = lon + radiusDeg;
        const rows = await this.db
          .select()
          .from(gtfsStop)
          .where(
            and(
              sql<boolean>`${gtfsStop.stopLat} BETWEEN ${latMin} AND ${latMax}`,
              sql<boolean>`${gtfsStop.stopLon} BETWEEN ${lonMin} AND ${lonMax}`,
            ),
          )
          .limit(limit);
        return rows.map((row) => this.mapRow(row));
      },
      CacheTTL.STOP_SEARCH,
    );
  }

  private mapRow(row: typeof gtfsStop.$inferSelect): StationObject {
    return {
      stopId: row.stopId,
      stopName: row.stopName,
      stopCode: row.stopCode ?? undefined,
      lat: row.stopLat ?? undefined,
      lon: row.stopLon ?? undefined,
      locationType: row.locationType ?? undefined,
      parentStation: row.parentStation ?? undefined,
      wheelchairBoarding: row.wheelchairBoarding ?? undefined,
      platformCode: row.platformCode ?? undefined,
      mode: row.mode ?? undefined,
    };
  }
}
