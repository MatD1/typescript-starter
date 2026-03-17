import { Inject, Injectable } from '@nestjs/common';
import { ilike, eq, and, sql, inArray } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import type { DrizzleDB } from '../database/database.module';
import { gtfsStop, gtfsRoute, gtfsStopRoute } from '../database/schema/gtfs.schema';
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
    const cacheKey = `stations:search:${query.toLowerCase()}:${limit}:with-routes`;
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.db
          .select()
          .from(gtfsStop)
          .where(ilike(gtfsStop.stopName, `%${query}%`))
          .limit(limit);
        const stations = rows.map((row) => this.mapRow(row));
        return this.enrichWithRoutes(stations);
      },
      CacheTTL.STOP_SEARCH,
    );
  }

  async findById(stopId: string): Promise<StationObject | null> {
    const cacheKey = `stations:id:${stopId}:with-routes`;
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.db
          .select()
          .from(gtfsStop)
          .where(eq(gtfsStop.stopId, stopId))
          .limit(1);
        if (!rows[0]) return null;
        const stations = [this.mapRow(rows[0])];
        const enriched = await this.enrichWithRoutes(stations);
        return enriched[0];
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
    const cacheKey = `stations:nearby:${lat}:${lon}:${radiusMetres}:with-routes`;
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
        const stations = rows.map((row) => this.mapRow(row));
        return this.enrichWithRoutes(stations);
      },
      CacheTTL.STOP_SEARCH,
    );
  }

  private async enrichWithRoutes(
    stations: StationObject[],
  ): Promise<StationObject[]> {
    if (!stations.length) return [];

    const stopIds = stations.map((s) => s.stopId);

    // Fetch all routes for these stops in one query
    const routes = await this.db
      .select({
        stopId: gtfsStopRoute.stopId,
        routeId: gtfsRoute.routeId,
        routeShortName: gtfsRoute.routeShortName,
        routeLongName: gtfsRoute.routeLongName,
        routeType: gtfsRoute.routeType,
        routeColor: gtfsRoute.routeColor,
        mode: gtfsRoute.mode,
      })
      .from(gtfsStopRoute)
      .innerJoin(gtfsRoute, eq(gtfsStopRoute.routeId, gtfsRoute.routeId))
      .where(inArray(gtfsStopRoute.stopId, stopIds));

    // Group routes by stopId
    const routesByStop = new Map<string, any[]>();
    for (const r of routes) {
      const list = routesByStop.get(r.stopId) || [];
      list.push({
        routeId: r.routeId,
        routeShortName: r.routeShortName,
        routeLongName: r.routeLongName,
        routeType: r.routeType,
        routeColor: r.routeColor,
        mode: r.mode,
      });
      routesByStop.set(r.stopId, list);
    }

    // Attach routes to stations
    for (const s of stations) {
      s.routes = routesByStop.get(s.stopId) || [];
    }

    return stations;
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
