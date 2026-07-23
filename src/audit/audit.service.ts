import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { auditArchive, auditEvent } from '../database/schema/audit.schema';
import { CacheService } from '../cache/cache.service';
import { AuditContextService } from './audit.context';
import {
  AuditEventInput,
  AuditEventQuery,
  AuditPage,
  AUDIT_ACTOR_TYPES,
  AUDIT_OUTCOMES,
  AUDIT_SEVERITIES,
  AUDIT_SOURCES,
  HIGH_RISK_REASON_ACTIONS,
} from './audit.types';
import {
  changedFields,
  redactAuditRecord,
  sanitizeAuditText,
  validateAuditReason,
} from './audit.redaction';

type AuditRow = typeof auditEvent.$inferSelect;
type InsertExecutor = Pick<DrizzleDB, 'insert'>;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly context: AuditContextService,
    private readonly cache: CacheService,
  ) {}

  async record(input: AuditEventInput): Promise<AuditRow> {
    return this.insert(this.db, input);
  }

  async recordInTransaction(
    tx: InsertExecutor,
    input: AuditEventInput,
  ): Promise<AuditRow> {
    return this.insert(tx, input);
  }

  async recordAttempt(
    input: Omit<AuditEventInput, 'outcome'>,
  ): Promise<AuditRow> {
    return this.record({ ...input, outcome: 'attempted' });
  }

  async recordBestEffort(input: AuditEventInput): Promise<void> {
    const event = { ...input, id: input.id ?? randomUUID() };
    try {
      await this.record(event);
    } catch (error) {
      try {
        await this.cache.enqueueAuditEvent(event);
      } catch (queueError) {
        this.logger.error(
          JSON.stringify({
            message: 'CRITICAL audit gap: database and Redis unavailable',
            action: input.action,
            eventId: event.id,
            databaseError:
              error instanceof Error ? error.message : 'unknown',
            queueError:
              queueError instanceof Error ? queueError.message : 'unknown',
          }),
        );
      }
    }
  }

  async retryQueued(limit = 100): Promise<number> {
    const queued = await this.cache.readAuditEvents(limit);
    let completed = 0;
    for (const entry of queued) {
      try {
        const occurredAt = entry.event.occurredAt
          ? new Date(entry.event.occurredAt)
          : undefined;
        await this.record({
          ...entry.event,
          occurredAt:
            occurredAt && !Number.isNaN(occurredAt.getTime())
              ? occurredAt
              : undefined,
        });
        await this.cache.ackAuditEvent(entry.streamId);
        completed++;
      } catch (error) {
        this.logger.warn(
          `Audit retry paused at ${entry.streamId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        break;
      }
    }
    return completed;
  }

  async query(query: AuditEventQuery): Promise<AuditPage<AuditRow>> {
    this.validateQuery(query);
    const limit = query.limit ?? 50;
    const conditions = this.queryConditions(query, true);

    const rows = await this.db
      .select()
      .from(auditEvent)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditEvent.occurredAt), desc(auditEvent.sequence))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return {
      data,
      nextCursor:
        hasMore && data.length
          ? this.encodeCursor(data[data.length - 1])
          : undefined,
    };
  }

  async getById(id: string): Promise<AuditRow> {
    const [row] = await this.db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.id, id))
      .limit(1);
    if (!row) throw new NotFoundException(`Audit event ${id} not found`);
    return row;
  }

  async summary(query: AuditEventQuery) {
    this.validateQuery(query);
    const conditions = this.queryConditions(
      { ...query, cursor: undefined },
      false,
    );
    return this.db
      .select({
        category: auditEvent.category,
        action: auditEvent.action,
        outcome: auditEvent.outcome,
        severity: auditEvent.severity,
        count: count(),
      })
      .from(auditEvent)
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(
        auditEvent.category,
        auditEvent.action,
        auditEvent.outcome,
        auditEvent.severity,
      )
      .orderBy(desc(count()));
  }

  async listArchives(limit = 100) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException('limit must be an integer from 1 to 200');
    }
    return this.db
      .select({
        id: auditArchive.id,
        windowStart: auditArchive.windowStart,
        windowEnd: auditArchive.windowEnd,
        rowCount: auditArchive.rowCount,
        checksumSha256: auditArchive.checksumSha256,
        status: auditArchive.status,
        retentionUntil: auditArchive.retentionUntil,
        verifiedAt: auditArchive.verifiedAt,
        createdAt: auditArchive.createdAt,
      })
      .from(auditArchive)
      .orderBy(desc(auditArchive.windowStart))
      .limit(limit);
  }

  private async insert(
    executor: InsertExecutor,
    input: AuditEventInput,
  ): Promise<AuditRow> {
    const current = this.context.current();
    const reason = HIGH_RISK_REASON_ACTIONS.has(input.action)
      ? validateAuditReason(input.reason)
      : sanitizeAuditText(input.reason, 1000);
    const before = redactAuditRecord(input.before);
    const after = redactAuditRecord(input.after);
    const metadata = redactAuditRecord(input.metadata);
    const actor = input.actor ?? current?.actor ?? { type: 'system' as const };

    const rows = await executor
      .insert(auditEvent)
      .values({
        id: input.id ?? randomUUID(),
        version: 1,
        occurredAt: input.occurredAt ?? new Date(),
        category: sanitizeAuditText(input.category, 100) ?? 'unknown',
        action: input.action,
        severity: input.severity ?? 'info',
        outcome: input.outcome,
        actorType: actor.type,
        actorId: sanitizeAuditText(actor.id, 200),
        actorRole: sanitizeAuditText(actor.role, 100),
        impersonatorUserId: sanitizeAuditText(
          actor.impersonatorUserId,
          200,
        ),
        targetType: sanitizeAuditText(input.targetType, 100),
        targetId: sanitizeAuditText(input.targetId, 300),
        reason,
        before,
        after,
        changedFields:
          input.changedFields ?? changedFields(before, after),
        metadata,
        error: input.error
          ? {
              code: sanitizeAuditText(input.error.code, 100),
              message: sanitizeAuditText(input.error.message, 1000),
            }
          : null,
        requestId: current?.requestId,
        correlationId:
          sanitizeAuditText(input.correlationId, 200) ??
          current?.correlationId,
        source: input.source ?? current?.source ?? 'job',
        method: current?.method,
        route: current?.route,
        graphqlOperation: current?.graphqlOperation,
        ipNetwork: current?.ipNetwork,
        ipFingerprint: current?.ipFingerprint,
        userAgent: current?.userAgent,
      })
      .onConflictDoNothing({ target: auditEvent.id })
      .returning();

    if (rows[0]) return rows[0];
    const [existing] = await this.db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.id, input.id ?? ''))
      .limit(1);
    if (!existing) throw new Error('Audit event insert did not return a row');
    return existing;
  }

  private queryConditions(query: AuditEventQuery, includeCursor: boolean) {
    const conditions: any[] = [];
    if (query.from)
      conditions.push(gte(auditEvent.occurredAt, new Date(query.from)));
    if (query.to)
      conditions.push(lte(auditEvent.occurredAt, new Date(query.to)));
    if (query.eventId) conditions.push(eq(auditEvent.id, query.eventId));
    if (query.category)
      conditions.push(eq(auditEvent.category, query.category));
    if (query.action) conditions.push(eq(auditEvent.action, query.action));
    if (query.actorType)
      conditions.push(eq(auditEvent.actorType, query.actorType));
    if (query.actorId)
      conditions.push(eq(auditEvent.actorId, query.actorId));
    if (query.targetType)
      conditions.push(eq(auditEvent.targetType, query.targetType));
    if (query.targetId)
      conditions.push(eq(auditEvent.targetId, query.targetId));
    if (query.outcome)
      conditions.push(eq(auditEvent.outcome, query.outcome));
    if (query.severity)
      conditions.push(eq(auditEvent.severity, query.severity));
    if (query.requestId)
      conditions.push(eq(auditEvent.requestId, query.requestId));
    if (query.correlationId)
      conditions.push(eq(auditEvent.correlationId, query.correlationId));
    if (query.source) conditions.push(eq(auditEvent.source, query.source));
    if (includeCursor && query.cursor) {
      const cursor = this.decodeCursor(query.cursor);
      const occurredAt = new Date(cursor.occurredAt);
      conditions.push(
        or(
          lt(auditEvent.occurredAt, occurredAt),
          and(
            eq(auditEvent.occurredAt, occurredAt),
            lt(auditEvent.sequence, cursor.sequence),
          ),
        ),
      );
    }
    return conditions;
  }

  private validateRange(from?: string, to?: string): void {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (
      (fromDate && Number.isNaN(fromDate.getTime())) ||
      (toDate && Number.isNaN(toDate.getTime()))
    ) {
      throw new BadRequestException('from and to must be valid ISO 8601 dates');
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('from must not be later than to');
    }
    if (
      fromDate &&
      toDate &&
      toDate.getTime() - fromDate.getTime() > 90 * 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException('Maximum audit query window is 90 days');
    }
  }

  private validateQuery(query: AuditEventQuery): void {
    this.validateRange(query.from, query.to);
    const limit = query.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException('limit must be an integer from 1 to 200');
    }
    if (
      query.actorType &&
      !AUDIT_ACTOR_TYPES.includes(query.actorType)
    ) {
      throw new BadRequestException('Invalid audit actorType');
    }
    if (query.outcome && !AUDIT_OUTCOMES.includes(query.outcome)) {
      throw new BadRequestException('Invalid audit outcome');
    }
    if (query.severity && !AUDIT_SEVERITIES.includes(query.severity)) {
      throw new BadRequestException('Invalid audit severity');
    }
    if (query.source && !AUDIT_SOURCES.includes(query.source)) {
      throw new BadRequestException('Invalid audit source');
    }
    for (const [name, value] of Object.entries(query)) {
      if (typeof value === 'string' && value.length > 1000) {
        throw new BadRequestException(`${name} exceeds maximum length`);
      }
    }
  }

  private encodeCursor(row: AuditRow): string {
    return Buffer.from(
      JSON.stringify({
        occurredAt: row.occurredAt.toISOString(),
        sequence: row.sequence,
      }),
    ).toString('base64url');
  }

  private decodeCursor(cursor: string): {
    occurredAt: string;
    sequence: number;
  } {
    try {
      const value = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as { occurredAt?: unknown; sequence?: unknown };
      if (
        typeof value.occurredAt !== 'string' ||
        Number.isNaN(new Date(value.occurredAt).getTime()) ||
        typeof value.sequence !== 'number' ||
        !Number.isSafeInteger(value.sequence)
      ) {
        throw new Error('invalid');
      }
      return {
        occurredAt: value.occurredAt,
        sequence: value.sequence,
      };
    } catch {
      throw new BadRequestException('Invalid audit cursor');
    }
  }
}
