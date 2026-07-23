import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { gzipSync } from 'zlib';
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import {
  auditArchive,
  auditEvent,
} from '../database/schema/audit.schema';
import { AuditObjectStorage } from './audit.storage';
import { AuditService } from './audit.service';
import { AUDIT_ACTIONS } from './audit.types';
import { CacheService } from '../cache/cache.service';
import {
  canonicalJson,
  sha256,
  signCanonical,
  verifyCanonicalSignature,
} from './audit.archive.util';

interface AuditManifest {
  version: 1;
  archiveId: string;
  windowStart: string;
  windowEnd: string;
  firstSequence: number | null;
  lastSequence: number | null;
  rowCount: number;
  dataChecksumSha256: string;
  previousManifestChecksum: string | null;
  retentionUntil: string;
  createdAt: string;
  signature: string;
}

@Injectable()
export class AuditArchiveService {
  private readonly logger = new Logger(AuditArchiveService.name);
  private readonly signingSecret: string;
  private readonly disabled: boolean;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    config: ConfigService,
    private readonly storage: AuditObjectStorage,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {
    this.signingSecret =
      config.get<string>('audit.signingSecret') ??
      config.get<string>('auth.secret') ??
      'development-only-signing-secret';
    this.disabled = config.get<boolean>('audit.archive.disabled') ?? false;
  }

  @Cron('15 2 * * *', { timeZone: 'UTC' })
  async archivePreviousUtcDay(): Promise<void> {
    if (this.disabled) return;
    const locked = await this.cache.acquireLock(
      'audit:archive:lock',
      60 * 60,
    );
    if (!locked) return;
    const now = new Date();
    const windowEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const windowStart = new Date(windowEnd.getTime() - 86_400_000);
    try {
      await this.archiveWindow(windowStart, windowEnd);
    } finally {
      await this.cache.releaseLock('audit:archive:lock');
    }
  }

  @Cron('45 * * * *', { timeZone: 'UTC' })
  async retryFailedArchives(): Promise<void> {
    if (this.disabled) return;
    const locked = await this.cache.acquireLock(
      'audit:archive:lock',
      45 * 60,
    );
    if (!locked) return;
    try {
      const failed = await this.db
        .select({
          windowStart: auditArchive.windowStart,
          windowEnd: auditArchive.windowEnd,
        })
        .from(auditArchive)
        .where(eq(auditArchive.status, 'failed'))
        .orderBy(asc(auditArchive.windowStart))
        .limit(3);
      for (const archive of failed) {
        try {
          await this.archiveWindow(archive.windowStart, archive.windowEnd);
        } catch (error) {
          this.logger.warn(
            `Audit archive retry failed for ${archive.windowStart.toISOString()}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          break;
        }
      }
    } finally {
      await this.cache.releaseLock('audit:archive:lock');
    }
  }

  async archiveWindow(windowStart: Date, windowEnd: Date) {
    const existing = await this.db
      .select()
      .from(auditArchive)
      .where(
        and(
          eq(auditArchive.windowStart, windowStart),
          eq(auditArchive.windowEnd, windowEnd),
        ),
      )
      .limit(1);
    if (existing[0]?.status === 'verified') return existing[0];

    const archiveId = existing[0]?.id ?? randomUUID();
    const day = windowStart.toISOString().slice(0, 10);
    const dataObjectKey = `audit/archive/${day}/${archiveId}.jsonl.gz`;
    const manifestObjectKey = `audit/archive/${day}/${archiveId}.manifest.json`;
    const retentionUntil = new Date(
      windowEnd.getTime() + 7 * 365.25 * 86_400_000,
    );

    if (!existing.length) {
      await this.db.insert(auditArchive).values({
        id: archiveId,
        windowStart,
        windowEnd,
        dataObjectKey,
        manifestObjectKey,
        retentionUntil,
      });
    }

    try {
      const rows = await this.db
        .select()
        .from(auditEvent)
        .where(
          and(
            gte(auditEvent.occurredAt, windowStart),
            lt(auditEvent.occurredAt, windowEnd),
          ),
        )
        .orderBy(asc(auditEvent.sequence));

      const canonical = rows
        .map((row) => canonicalJson(row))
        .join('\n');
      const data = gzipSync(Buffer.from(canonical + (rows.length ? '\n' : '')));
      const checksum = sha256(data);
      const [previous] = await this.db
        .select({
          checksum: auditArchive.manifestChecksumSha256,
        })
        .from(auditArchive)
        .where(lt(auditArchive.windowEnd, windowEnd))
        .orderBy(desc(auditArchive.windowEnd))
        .limit(1);

      const unsigned = {
        version: 1 as const,
        archiveId,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        firstSequence: rows[0]?.sequence ?? null,
        lastSequence: rows[rows.length - 1]?.sequence ?? null,
        rowCount: rows.length,
        dataChecksumSha256: checksum,
        previousManifestChecksum: previous?.checksum ?? null,
        retentionUntil: retentionUntil.toISOString(),
        createdAt: new Date().toISOString(),
      };
      const signature = signCanonical(unsigned, this.signingSecret);
      const manifest: AuditManifest = { ...unsigned, signature };
      const manifestBuffer = Buffer.from(canonicalJson(manifest));
      const manifestChecksum = sha256(manifestBuffer);

      await this.storage.putImmutable(
        dataObjectKey,
        data,
        'application/x-ndjson',
        retentionUntil,
        { checksum },
      );
      await this.storage.putImmutable(
        manifestObjectKey,
        manifestBuffer,
        'application/json',
        retentionUntil,
        { checksum: manifestChecksum },
      );

      const [dataReadback, manifestReadback, dataLocked, manifestLocked] =
        await Promise.all([
          this.storage.get(dataObjectKey),
          this.storage.get(manifestObjectKey),
          this.storage.isLocked(dataObjectKey),
          this.storage.isLocked(manifestObjectKey),
        ]);
      if (
        sha256(dataReadback) !== checksum ||
        sha256(manifestReadback) !== manifestChecksum ||
        !dataLocked ||
        !manifestLocked
      ) {
        throw new Error('Audit archive read-back or Object Lock verification failed');
      }

      const [updated] = await this.db
        .update(auditArchive)
        .set({
          rowCount: rows.length,
          firstSequence: rows[0] ? String(rows[0].sequence) : null,
          lastSequence: rows.length
            ? String(rows[rows.length - 1].sequence)
            : null,
          checksumSha256: checksum,
          manifestChecksumSha256: manifestChecksum,
          previousManifestChecksum: unsigned.previousManifestChecksum,
          signature,
          retentionUntil,
          status: 'verified',
          verifiedAt: new Date(),
          updatedAt: new Date(),
          lastError: null,
        })
        .where(eq(auditArchive.id, archiveId))
        .returning();

      await this.audit.recordBestEffort({
        category: 'audit',
        action: AUDIT_ACTIONS.AUDIT_ARCHIVE_CREATED,
        outcome: 'succeeded',
        source: 'job',
        actor: { type: 'system', id: 'audit-archive-job' },
        targetType: 'audit_archive',
        targetId: archiveId,
        metadata: { windowStart, windowEnd, rowCount: rows.length, checksum },
      });
      return updated;
    } catch (error) {
      await this.db
        .update(auditArchive)
        .set({
          status: 'failed',
          attempts: sql`${auditArchive.attempts} + 1`,
          lastError: (error instanceof Error ? error.message : String(error)).slice(
            0,
            1000,
          ),
          updatedAt: new Date(),
        })
        .where(eq(auditArchive.id, archiveId));
      await this.audit.recordBestEffort({
        category: 'audit',
        action: AUDIT_ACTIONS.AUDIT_ARCHIVE_FAILED,
        outcome: 'failed',
        severity: 'critical',
        source: 'job',
        actor: { type: 'system', id: 'audit-archive-job' },
        targetType: 'audit_archive',
        targetId: archiveId,
        error: {
          code: 'ARCHIVE_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  async verify(id: string) {
    const [archive] = await this.db
      .select()
      .from(auditArchive)
      .where(eq(auditArchive.id, id))
      .limit(1);
    if (!archive) throw new NotFoundException(`Audit archive ${id} not found`);

    const [data, manifestBuffer, dataLocked, manifestLocked] =
      await Promise.all([
        this.storage.get(archive.dataObjectKey),
        this.storage.get(archive.manifestObjectKey),
        this.storage.isLocked(archive.dataObjectKey),
        this.storage.isLocked(archive.manifestObjectKey),
      ]);
    const manifest = JSON.parse(manifestBuffer.toString('utf8')) as AuditManifest;
    const { signature, ...unsigned } = manifest;
    const valid =
      sha256(data) === archive.checksumSha256 &&
      sha256(manifestBuffer) === archive.manifestChecksumSha256 &&
      verifyCanonicalSignature(unsigned, signature, this.signingSecret) &&
      dataLocked &&
      manifestLocked;
    if (valid) {
      await this.db
        .update(auditArchive)
        .set({ status: 'verified', verifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(auditArchive.id, id));
    }
    return {
      id,
      valid,
      dataLocked,
      manifestLocked,
      verifiedAt: valid ? new Date() : undefined,
    };
  }

  @Cron('30 3 1 * *', { timeZone: 'UTC' })
  async purgeExpiredOnlineEvents(): Promise<void> {
    const locked = await this.cache.acquireLock(
      'audit:retention:lock',
      30 * 60,
    );
    if (!locked) return;
    try {
      const result = await this.db.execute<{ purged: number }>(
        sql`select audit_purge_verified_events() as purged`,
      );
      const purged = Number(result.rows?.[0]?.purged ?? 0);
      await this.audit.recordBestEffort({
        category: 'audit',
        action: AUDIT_ACTIONS.AUDIT_RETENTION_PURGED,
        outcome: 'succeeded',
        source: 'job',
        actor: { type: 'system', id: 'audit-retention-job' },
        targetType: 'audit_event',
        metadata: { purged },
      });
    } finally {
      await this.cache.releaseLock('audit:retention:lock');
    }
  }

}
