import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  gte,
  gt,
  ilike,
  lte,
  sql,
} from 'drizzle-orm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { DRIZZLE } from '../database/database.module';
import type { DrizzleDB } from '../database/database.module';
import { user, apiKey } from '../database/schema/auth.schema';
import { requestLog } from '../database/schema/request-log.schema';
import {
  gtfsStop,
  gtfsRoute,
  gtfsTrip,
  gtfsCalendar,
} from '../database/schema/gtfs.schema';
import { CacheService } from '../cache/cache.service';
import { ApiKeyService } from '../auth/api-key.service';
import { GtfsStaticService } from '../gtfs-static/gtfs-static.service';
import type {
  AdminUsersQueryDto,
  UpdateUserDto,
  AdminApiKeysQueryDto,
  UpdateApiKeyDto,
  AdminLogsQueryDto,
  AdminErrorLogsQueryDto,
  AdminStatsUsageQueryDto,
  AdminStatsTopQueryDto,
} from './dto/admin.dto';
import type {
  AdminUser,
  AdminUserDetail,
  PaginatedUsers,
  AdminApiKey,
  AdminApiKeyDetail,
  PaginatedApiKeys,
  AdminLogEntry,
  AdminLogPage,
  AdminOverviewStats,
  UsageBucket,
  EndpointStat,
  UserStat,
  KeyStat,
  GtfsStatus,
  GtfsIngestResult,
  SystemHealth,
} from './dto/admin.types';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly cache: CacheService,
    private readonly apiKeyService: ApiKeyService,
    private readonly gtfsStaticService: GtfsStaticService,
    private readonly httpService: HttpService,
  ) {}

  // ─── Auth ──────────────────────────────────────────────────────────────────

  /** Return admin user profile for the given userId. */
  async getMe(userId: string): Promise<AdminUser> {
    const rows = await this.db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!rows.length) throw new NotFoundException('User not found');
    return this.mapUser(rows[0]);
  }

  // ─── Users ─────────────────────────────────────────────────────────────────

  async getUsers(query: AdminUsersQueryDto): Promise<PaginatedUsers> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];
    if (query.role) conditions.push(eq(user.role, query.role));
    if (query.search) {
      conditions.push(
        sql`(${ilike(user.name, `%${query.search}%`)} OR ${ilike(user.email, `%${query.search}%`)})` as ReturnType<typeof eq>,
      );
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(user)
        .where(where)
        .orderBy(desc(user.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(user)
        .where(where),
    ]);

    return {
      data: rows.map((r) => this.mapUser(r)),
      total: totalRows[0]?.value ?? 0,
      page,
      limit,
    };
  }

  async getUser(id: string): Promise<AdminUserDetail> {
    const rows = await this.db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    if (!rows.length) throw new NotFoundException(`User ${id} not found`);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [keyCountRows, reqCountRows] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(apiKey)
        .where(eq(apiKey.userId, id)),
      this.db
        .select({ value: count() })
        .from(requestLog)
        .where(
          and(
            eq(requestLog.userId, id),
            gte(requestLog.createdAt, sevenDaysAgo),
          ),
        ),
    ]);

    return {
      ...this.mapUser(rows[0]),
      apiKeyCount: keyCountRows[0]?.value ?? 0,
      requestCount7d: reqCountRows[0]?.value ?? 0,
    };
  }

  async updateUser(id: string, dto: UpdateUserDto): Promise<AdminUser> {
    const rows = await this.db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    if (!rows.length) throw new NotFoundException(`User ${id} not found`);

    const updates: Partial<typeof user.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.role !== undefined) updates.role = dto.role;
    if (dto.banned !== undefined) updates.banned = dto.banned;

    const updated = await this.db
      .update(user)
      .set(updates)
      .where(eq(user.id, id))
      .returning();

    return this.mapUser(updated[0]);
  }

  async deleteUser(id: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    if (!rows.length) throw new NotFoundException(`User ${id} not found`);
    await this.db.delete(user).where(eq(user.id, id));
  }

  // ─── API Keys ──────────────────────────────────────────────────────────────

  async getApiKeys(query: AdminApiKeysQueryDto): Promise<PaginatedApiKeys> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];
    if (query.userId) conditions.push(eq(apiKey.userId, query.userId));
    if (query.enabled !== undefined)
      conditions.push(eq(apiKey.enabled, query.enabled));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(apiKey)
        .where(where)
        .orderBy(desc(apiKey.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ value: count() }).from(apiKey).where(where),
    ]);

    return {
      data: rows.map((r) => this.mapApiKey(r)),
      total: totalRows[0]?.value ?? 0,
      page,
      limit,
    };
  }

  async getApiKey(id: string): Promise<AdminApiKeyDetail> {
    const rows = await this.db
      .select()
      .from(apiKey)
      .where(eq(apiKey.id, id))
      .limit(1);
    if (!rows.length) throw new NotFoundException(`API key ${id} not found`);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Group by date bucket for the last 7 days
    const usageRows = await this.db
      .select({
        date: sql<string>`DATE(${requestLog.createdAt})`.as('date'),
        cnt: count(),
      })
      .from(requestLog)
      .where(
        and(
          eq(requestLog.keyId, id),
          gte(requestLog.createdAt, sevenDaysAgo),
        ),
      )
      .groupBy(sql`DATE(${requestLog.createdAt})`)
      .orderBy(sql`DATE(${requestLog.createdAt})`);

    return {
      ...this.mapApiKey(rows[0]),
      usage7d: usageRows.map((r) => ({
        date: String(r.date),
        count: r.cnt,
      })),
    };
  }

  async updateApiKey(id: string, dto: UpdateApiKeyDto): Promise<AdminApiKey> {
    const rows = await this.db
      .select()
      .from(apiKey)
      .where(eq(apiKey.id, id))
      .limit(1);
    if (!rows.length) throw new NotFoundException(`API key ${id} not found`);

    const updates: Partial<typeof apiKey.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.enabled !== undefined) updates.enabled = dto.enabled;
    if (dto.rateLimitMax !== undefined) updates.rateLimitMax = dto.rateLimitMax;
    if (dto.permissions !== undefined) updates.permissions = dto.permissions;

    const updated = await this.db
      .update(apiKey)
      .set(updates)
      .where(eq(apiKey.id, id))
      .returning();

    return this.mapApiKey(updated[0]);
  }

  async deleteApiKey(id: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(apiKey)
      .where(eq(apiKey.id, id))
      .limit(1);
    if (!rows.length) throw new NotFoundException(`API key ${id} not found`);
    await this.db.delete(apiKey).where(eq(apiKey.id, id));
  }

  async resetApiKeyUsage(id: string): Promise<AdminApiKey> {
    const rows = await this.db
      .select()
      .from(apiKey)
      .where(eq(apiKey.id, id))
      .limit(1);
    if (!rows.length) throw new NotFoundException(`API key ${id} not found`);

    const updated = await this.db
      .update(apiKey)
      .set({ requestCount: 0, remaining: null, updatedAt: new Date() })
      .where(eq(apiKey.id, id))
      .returning();

    return this.mapApiKey(updated[0]);
  }

  // ─── Logs ──────────────────────────────────────────────────────────────────

  async getLogs(query: AdminLogsQueryDto): Promise<AdminLogPage> {
    return this.queryLogs(query, false);
  }

  async getErrorLogs(query: AdminErrorLogsQueryDto): Promise<AdminLogPage> {
    return this.queryLogs(
      { ...query, statusCode: undefined },
      true,
    );
  }

  private async queryLogs(
    query: AdminLogsQueryDto & Partial<AdminErrorLogsQueryDto>,
    errorsOnly: boolean,
  ): Promise<AdminLogPage> {
    const limit = Math.min(query.limit ?? 50, 200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = [];

    if (errorsOnly) {
      conditions.push(gte(requestLog.statusCode, 400));
    }
    if (query.cursor) {
      conditions.push(gt(requestLog.id, query.cursor));
    }
    if (query.userId) conditions.push(eq(requestLog.userId, query.userId));
    if (query.keyId) conditions.push(eq(requestLog.keyId, query.keyId));
    if (query.method)
      conditions.push(eq(requestLog.method, query.method.toUpperCase()));
    if (query.statusCode && !errorsOnly)
      conditions.push(eq(requestLog.statusCode, query.statusCode));
    if (query.path)
      conditions.push(ilike(requestLog.path, `%${query.path}%`));
    if (query.from)
      conditions.push(gte(requestLog.createdAt, new Date(query.from)));
    if (query.to)
      conditions.push(lte(requestLog.createdAt, new Date(query.to)));

    const where = conditions.length ? and(...conditions) : undefined;

    // Fetch limit+1 to detect if there's a next page
    const rows = await this.db
      .select()
      .from(requestLog)
      .where(where)
      .orderBy(requestLog.id)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1].id : undefined;

    // Total count (without cursor pagination for UI display)
    const countConditions = conditions.filter(
      (c) => !String(c).includes(requestLog.id.name),
    );
    // Simpler total: just count filtered (not cursor-filtered)
    const totalConditions: typeof conditions = [];
    if (errorsOnly) totalConditions.push(gte(requestLog.statusCode, 400));
    if (query.userId)
      totalConditions.push(eq(requestLog.userId, query.userId));
    if (query.keyId) totalConditions.push(eq(requestLog.keyId, query.keyId));
    if (query.method)
      totalConditions.push(eq(requestLog.method, query.method.toUpperCase()));
    if (query.statusCode && !errorsOnly)
      totalConditions.push(eq(requestLog.statusCode, query.statusCode));
    if (query.path)
      totalConditions.push(ilike(requestLog.path, `%${query.path}%`));
    if (query.from)
      totalConditions.push(gte(requestLog.createdAt, new Date(query.from)));
    if (query.to)
      totalConditions.push(lte(requestLog.createdAt, new Date(query.to)));

    const totalRows = await this.db
      .select({ value: count() })
      .from(requestLog)
      .where(totalConditions.length ? and(...totalConditions) : undefined);

    return {
      data: data.map((r) => this.mapLogEntry(r)),
      nextCursor,
      total: totalRows[0]?.value ?? 0,
    };
  }

  // ─── Stats ─────────────────────────────────────────────────────────────────

  async getOverviewStats(): Promise<AdminOverviewStats> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [total24h, errors24h, activeUsers7d, topPaths] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(requestLog)
        .where(gte(requestLog.createdAt, yesterday)),
      this.db
        .select({ value: count() })
        .from(requestLog)
        .where(
          and(
            gte(requestLog.createdAt, yesterday),
            gte(requestLog.statusCode, 400),
          ),
        ),
      this.db
        .select({ value: sql<number>`COUNT(DISTINCT ${requestLog.userId})` })
        .from(requestLog)
        .where(gte(requestLog.createdAt, sevenDaysAgo)),
      this.db
        .select({
          path: requestLog.path,
          cnt: count(),
        })
        .from(requestLog)
        .where(gte(requestLog.createdAt, yesterday))
        .groupBy(requestLog.path)
        .orderBy(desc(count()))
        .limit(1),
    ]);

    const totalVal = total24h[0]?.value ?? 0;
    const errorsVal = errors24h[0]?.value ?? 0;
    const errorRate = totalVal > 0 ? (errorsVal / totalVal) * 100 : 0;
    const topPath = topPaths[0]?.path ?? 'N/A';

    return {
      totalRequests24h: totalVal,
      activeUsers7d: Number(activeUsers7d[0]?.value ?? 0),
      errorRate24h: Math.round(errorRate * 100) / 100,
      topPath,
    };
  }

  async getUsageStats(query: AdminStatsUsageQueryDto): Promise<UsageBucket[]> {
    const granularity = query.granularity === 'hour' ? 'hour' : 'day';

    const rows = await this.db
      .select({
        bucket: sql<string>`date_trunc(${granularity}, ${requestLog.createdAt})`.as(
          'bucket',
        ),
        cnt: count(),
        errors: sql<number>`COUNT(*) FILTER (WHERE ${requestLog.statusCode} >= 400)`.as(
          'errors',
        ),
      })
      .from(requestLog)
      .where(
        and(
          gte(requestLog.createdAt, new Date(query.from)),
          lte(requestLog.createdAt, new Date(query.to)),
        ),
      )
      .groupBy(sql`date_trunc(${granularity}, ${requestLog.createdAt})`)
      .orderBy(sql`date_trunc(${granularity}, ${requestLog.createdAt})`);

    return rows.map((r) => ({
      timestamp: new Date(r.bucket).toISOString(),
      count: r.cnt,
      errors: Number(r.errors),
    }));
  }

  async getEndpointStats(query: AdminStatsTopQueryDto): Promise<EndpointStat[]> {
    const limit = query.limit ?? 10;
    const conditions: ReturnType<typeof eq>[] = [];
    if (query.from)
      conditions.push(gte(requestLog.createdAt, new Date(query.from)) as ReturnType<typeof eq>);
    if (query.to)
      conditions.push(lte(requestLog.createdAt, new Date(query.to)) as ReturnType<typeof eq>);

    const rows = await this.db
      .select({ path: requestLog.path, cnt: count() })
      .from(requestLog)
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(requestLog.path)
      .orderBy(desc(count()))
      .limit(limit);

    return rows.map((r) => ({ path: r.path, count: r.cnt }));
  }

  async getUserStats(query: AdminStatsTopQueryDto): Promise<UserStat[]> {
    const limit = query.limit ?? 10;
    const conditions: ReturnType<typeof eq>[] = [];
    if (query.from)
      conditions.push(gte(requestLog.createdAt, new Date(query.from)) as ReturnType<typeof eq>);
    if (query.to)
      conditions.push(lte(requestLog.createdAt, new Date(query.to)) as ReturnType<typeof eq>);

    const rows = await this.db
      .select({
        userId: requestLog.userId,
        userName: user.name,
        cnt: count(),
      })
      .from(requestLog)
      .leftJoin(user, eq(requestLog.userId, user.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(requestLog.userId, user.name)
      .orderBy(desc(count()))
      .limit(limit);

    return rows.map((r) => ({
      userId: r.userId ?? 'anonymous',
      userName: r.userName ?? 'Unknown',
      count: r.cnt,
    }));
  }

  async getKeyStats(query: AdminStatsTopQueryDto): Promise<KeyStat[]> {
    const limit = query.limit ?? 10;
    const conditions: ReturnType<typeof eq>[] = [];
    if (query.from)
      conditions.push(gte(requestLog.createdAt, new Date(query.from)) as ReturnType<typeof eq>);
    if (query.to)
      conditions.push(lte(requestLog.createdAt, new Date(query.to)) as ReturnType<typeof eq>);

    const rows = await this.db
      .select({
        keyId: requestLog.keyId,
        keyName: apiKey.name,
        cnt: count(),
      })
      .from(requestLog)
      .leftJoin(apiKey, eq(requestLog.keyId, apiKey.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(requestLog.keyId, apiKey.name)
      .orderBy(desc(count()))
      .limit(limit);

    return rows.map((r) => ({
      keyId: r.keyId ?? 'unknown',
      keyName: r.keyName ?? undefined,
      count: r.cnt,
    }));
  }

  // ─── GTFS ──────────────────────────────────────────────────────────────────

  async getGtfsStatus(): Promise<GtfsStatus> {
    const [stops, routes, trips, calendars, lastIngestRows] =
      await Promise.all([
        this.db.select({ value: count() }).from(gtfsStop),
        this.db.select({ value: count() }).from(gtfsRoute),
        this.db.select({ value: count() }).from(gtfsTrip),
        this.db.select({ value: count() }).from(gtfsCalendar),
        this.db
          .select({ updatedAt: gtfsStop.updatedAt })
          .from(gtfsStop)
          .orderBy(desc(gtfsStop.updatedAt))
          .limit(1),
      ]);

    const lastIngest = lastIngestRows[0]?.updatedAt
      ? lastIngestRows[0].updatedAt.toISOString()
      : undefined;

    return {
      lastIngest,
      tableCounts: [
        { table: 'gtfs_stops', count: stops[0]?.value ?? 0 },
        { table: 'gtfs_routes', count: routes[0]?.value ?? 0 },
        { table: 'gtfs_trips', count: trips[0]?.value ?? 0 },
        { table: 'gtfs_calendar', count: calendars[0]?.value ?? 0 },
      ],
    };
  }

  async triggerGtfsIngest(): Promise<GtfsIngestResult> {
    try {
      const results = await this.gtfsStaticService.ingestAll();
      const modesIngested = results
        .filter((r) => r.success)
        .map((r) => r.mode);
      return { success: modesIngested.length > 0, modesIngested };
    } catch (err) {
      this.logger.error(`GTFS ingest failed: ${String(err)}`);
      return { success: false, modesIngested: [] };
    }
  }

  // ─── Cache ─────────────────────────────────────────────────────────────────

  async flushCache(): Promise<void> {
    await this.cache.flush();
  }

  // ─── Health ────────────────────────────────────────────────────────────────

  async getHealth(): Promise<SystemHealth> {
    const checks = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.checkTfNsw(),
    ]);

    return {
      healthy: checks.every((c) => c.status === 'ok'),
      checks,
    };
  }

  private async checkDb(): Promise<{
    name: string;
    status: string;
    latencyMs: number;
  }> {
    const start = Date.now();
    try {
      await this.db.execute(sql`SELECT 1`);
      return { name: 'database', status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        name: 'database',
        status: `error: ${String(err)}`,
        latencyMs: Date.now() - start,
      };
    }
  }

  private async checkRedis(): Promise<{
    name: string;
    status: string;
    latencyMs: number;
  }> {
    const start = Date.now();
    try {
      const ok = await this.cache.ping();
      return {
        name: 'redis',
        status: ok ? 'ok' : 'error: no PONG',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        name: 'redis',
        status: `error: ${String(err)}`,
        latencyMs: Date.now() - start,
      };
    }
  }

  private async checkTfNsw(): Promise<{
    name: string;
    status: string;
    latencyMs: number;
  }> {
    const start = Date.now();
    try {
      await firstValueFrom(
        this.httpService
          .head('https://api.transport.nsw.gov.au', { timeout: 1500 })
          .pipe(
            timeout(1500),
            catchError(() => of({ status: 0 })),
          ),
      );
      return {
        name: 'tfnsw_api',
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch {
      return {
        name: 'tfnsw_api',
        status: 'unreachable',
        latencyMs: Date.now() - start,
      };
    }
  }

  // ─── Mappers ───────────────────────────────────────────────────────────────

  private mapUser(row: typeof user.$inferSelect): AdminUser {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      banned: row.banned,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapApiKey(row: typeof apiKey.$inferSelect): AdminApiKey {
    return {
      id: row.id,
      name: row.name ?? undefined,
      start: row.start ?? undefined,
      userId: row.userId,
      enabled: row.enabled,
      rateLimitMax: row.rateLimitMax ?? undefined,
      requestCount: row.requestCount ?? 0,
      remaining: row.remaining ?? undefined,
      expiresAt: row.expiresAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      permissions: row.permissions ?? undefined,
    };
  }

  private mapLogEntry(row: typeof requestLog.$inferSelect): AdminLogEntry {
    return {
      id: row.id,
      method: row.method,
      path: row.path,
      statusCode: row.statusCode,
      userId: row.userId ?? undefined,
      keyId: row.keyId ?? undefined,
      responseTimeMs: row.responseTimeMs,
      ipAddress: row.ipAddress ?? undefined,
      userAgent: row.userAgent ?? undefined,
      error: row.error ?? undefined,
      createdAt: row.createdAt,
    };
  }
}
