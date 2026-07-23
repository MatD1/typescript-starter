import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { auditEvent, auditExport } from '../database/schema/audit.schema';
import { AuditObjectStorage } from './audit.storage';
import { AuditService } from './audit.service';
import { CreateAuditExportDto } from './audit.dto';
import { AUDIT_ACTIONS } from './audit.types';

@Injectable()
export class AuditExportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly storage: AuditObjectStorage,
    private readonly audit: AuditService,
  ) {}

  async create(
    requestedBy: string,
    dto: CreateAuditExportDto,
  ): Promise<{ id: string; status: string }> {
    if (dto.format !== 'jsonl' && dto.format !== 'csv') {
      throw new BadRequestException('Audit export format must be jsonl or csv');
    }
    await this.audit.query({ ...dto, cursor: undefined, limit: 1 });
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException(
        'Audit export storage is not configured',
      );
    }
    const id = randomUUID();
    const filters = { ...dto, cursor: undefined, limit: undefined };
    await this.audit.record({
      category: 'audit',
      action: AUDIT_ACTIONS.AUDIT_EXPORT_REQUESTED,
      outcome: 'attempted',
      severity: 'high',
      targetType: 'audit_export',
      targetId: id,
      metadata: { format: dto.format, filters },
    });
    await this.db.insert(auditExport).values({
      id,
      requestedBy,
      format: dto.format,
      filters,
    });
    void this.process(id).catch(() => undefined);
    return { id, status: 'pending' };
  }

  async get(id: string) {
    const [row] = await this.db
      .select()
      .from(auditExport)
      .where(eq(auditExport.id, id))
      .limit(1);
    if (!row) throw new NotFoundException(`Audit export ${id} not found`);
    return {
      id: row.id,
      format: row.format,
      status: row.status,
      rowCount: row.rowCount,
      checksumSha256: row.checksumSha256,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      expiresAt: row.expiresAt,
      downloadUrl:
        row.status === 'completed' &&
        row.expiresAt &&
        row.expiresAt > new Date()
          ? `/api/v1/admin/audit-events/exports/${row.id}/download`
          : undefined,
      error: row.status === 'failed' ? row.error : undefined,
    };
  }

  async download(id: string): Promise<{
    body: Buffer;
    contentType: string;
    filename: string;
  }> {
    const [row] = await this.db
      .select()
      .from(auditExport)
      .where(eq(auditExport.id, id))
      .limit(1);
    if (
      !row ||
      row.status !== 'completed' ||
      !row.objectKey ||
      !row.expiresAt ||
      row.expiresAt <= new Date()
    ) {
      throw new NotFoundException('Audit export is unavailable or expired');
    }
    const body = await this.storage.get(row.objectKey);
    return {
      body,
      contentType:
        row.format === 'csv' ? 'text/csv' : 'application/x-ndjson',
      filename: `audit-${row.id}.${row.format === 'csv' ? 'csv' : 'jsonl'}`,
    };
  }

  private async process(id: string): Promise<void> {
    const [job] = await this.db
      .select()
      .from(auditExport)
      .where(eq(auditExport.id, id))
      .limit(1);
    if (!job) return;
    try {
      const filters = job.filters as Record<string, unknown>;
      const conditions: any[] = [];
      if (typeof filters.from === 'string')
        conditions.push(gte(auditEvent.occurredAt, new Date(filters.from)));
      if (typeof filters.to === 'string')
        conditions.push(lte(auditEvent.occurredAt, new Date(filters.to)));
      if (typeof filters.category === 'string')
        conditions.push(eq(auditEvent.category, filters.category));
      if (typeof filters.action === 'string')
        conditions.push(eq(auditEvent.action, filters.action));
      if (typeof filters.actorId === 'string')
        conditions.push(eq(auditEvent.actorId, filters.actorId));
      if (typeof filters.targetType === 'string')
        conditions.push(eq(auditEvent.targetType, filters.targetType));
      if (typeof filters.targetId === 'string')
        conditions.push(eq(auditEvent.targetId, filters.targetId));
      if (typeof filters.outcome === 'string')
        conditions.push(eq(auditEvent.outcome, filters.outcome));

      const rows = await this.db
        .select()
        .from(auditEvent)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(auditEvent.sequence))
        .limit(100_000);
      const body =
        job.format === 'csv'
          ? Buffer.from(this.toCsv(rows))
          : Buffer.from(
              rows
                .map((row) =>
                  JSON.stringify(
                    Object.fromEntries(
                      Object.entries(row).map(([key, value]) => [
                        key,
                        value instanceof Date ? value.toISOString() : value,
                      ]),
                    ),
                  ),
                )
                .join('\n') + (rows.length ? '\n' : ''),
            );
      const checksum = createHash('sha256').update(body).digest('hex');
      const objectKey = `audit/exports/${id}.${job.format}`;
      await this.storage.putTemporary(
        objectKey,
        body,
        job.format === 'csv' ? 'text/csv' : 'application/x-ndjson',
        { checksum },
      );
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.db
        .update(auditExport)
        .set({
          status: 'completed',
          objectKey,
          rowCount: rows.length,
          checksumSha256: checksum,
          completedAt: new Date(),
          expiresAt,
        })
        .where(eq(auditExport.id, id));
      await this.audit.recordBestEffort({
        category: 'audit',
        action: AUDIT_ACTIONS.AUDIT_EXPORT_COMPLETED,
        outcome: 'succeeded',
        targetType: 'audit_export',
        targetId: id,
        metadata: { rowCount: rows.length, format: job.format, checksum },
      });
    } catch (error) {
      await this.db
        .update(auditExport)
        .set({
          status: 'failed',
          error: (error instanceof Error ? error.message : String(error)).slice(
            0,
            1000,
          ),
          completedAt: new Date(),
        })
        .where(eq(auditExport.id, id));
      await this.audit.recordBestEffort({
        category: 'audit',
        action: AUDIT_ACTIONS.AUDIT_EXPORT_FAILED,
        outcome: 'failed',
        severity: 'high',
        targetType: 'audit_export',
        targetId: id,
        error: {
          code: 'EXPORT_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  private toCsv(rows: Array<typeof auditEvent.$inferSelect>): string {
    const columns = [
      'sequence',
      'id',
      'occurredAt',
      'category',
      'action',
      'severity',
      'outcome',
      'actorType',
      'actorId',
      'actorRole',
      'targetType',
      'targetId',
      'reason',
      'requestId',
      'correlationId',
      'source',
      'method',
      'route',
      'before',
      'after',
      'changedFields',
      'metadata',
      'error',
    ] as const;
    const escape = (value: unknown): string => {
      let text =
        value === null || value === undefined
          ? ''
          : value instanceof Date
            ? value.toISOString()
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value);
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    return [
      columns.join(','),
      ...rows.map((row) => columns.map((key) => escape(row[key])).join(',')),
    ].join('\n');
  }
}
