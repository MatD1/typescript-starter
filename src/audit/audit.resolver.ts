import {
  Args,
  Context,
  ID,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { AuditService } from './audit.service';
import { AuditArchiveService } from './audit.archive.service';
import { AuditExportService } from './audit.export.service';
import {
  AuditArchiveObject,
  AuditArchiveVerificationObject,
  AuditEventObject,
  AuditEventPageObject,
  AuditEventsArgs,
  AuditExportObject,
  AuditSummaryObject,
} from './audit.graphql';
import {
  AUDIT_ACTIONS,
  AuditActorType,
  AuditOutcome,
  AuditSeverity,
  AuditSource,
} from './audit.types';

@Public()
@UseGuards(AdminGuard, RolesGuard)
@Roles(Role.ADMIN)
@Resolver()
export class AuditResolver {
  constructor(
    private readonly audit: AuditService,
    private readonly archives: AuditArchiveService,
    private readonly exports: AuditExportService,
  ) {}

  @Query(() => AuditEventPageObject, { name: 'adminAuditEvents' })
  async events(@Args() args: AuditEventsArgs): Promise<AuditEventPageObject> {
    const page = await this.audit.query(this.toQuery(args));
    await this.audit.recordBestEffort({
      category: 'audit',
      action: AUDIT_ACTIONS.AUDIT_SEARCHED,
      outcome: 'succeeded',
      targetType: 'audit_event',
      metadata: { returned: page.data.length },
    });
    return {
      data: page.data.map((row) => this.mapEvent(row)),
      nextCursor: page.nextCursor,
    };
  }

  @Query(() => AuditEventObject, { name: 'adminAuditEvent' })
  async event(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AuditEventObject> {
    const row = await this.audit.getById(id);
    await this.audit.recordBestEffort({
      category: 'audit',
      action: AUDIT_ACTIONS.AUDIT_VIEWED,
      outcome: 'succeeded',
      targetType: 'audit_event',
      targetId: id,
    });
    return this.mapEvent(row);
  }

  @Query(() => [AuditSummaryObject], { name: 'adminAuditSummary' })
  summary(@Args() args: AuditEventsArgs): Promise<AuditSummaryObject[]> {
    return this.audit.summary(this.toQuery(args));
  }

  @Query(() => AuditExportObject, { name: 'adminAuditExport' })
  exportStatus(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AuditExportObject> {
    return this.exports.get(id);
  }

  @Query(() => [AuditArchiveObject], { name: 'adminAuditArchives' })
  archiveList(
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<AuditArchiveObject[]> {
    return this.audit.listArchives(limit);
  }

  @Mutation(() => AuditExportObject, { name: 'adminCreateAuditExport' })
  createExport(
    @Context() ctx: { req: Request },
    @Args('format') format: string,
    @Args('from', { nullable: true }) from?: string,
    @Args('to', { nullable: true }) to?: string,
    @Args('category', { nullable: true }) category?: string,
    @Args('action', { nullable: true }) action?: string,
  ): Promise<AuditExportObject> {
    const actor = (ctx.req as any).user as { userId?: string } | undefined;
    return this.exports.create(actor?.userId ?? '', {
      format: format as 'jsonl' | 'csv',
      from,
      to,
      category,
      action,
    });
  }

  @Mutation(() => AuditArchiveVerificationObject, {
    name: 'adminVerifyAuditArchive',
  })
  async verifyArchive(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AuditArchiveVerificationObject> {
    const result = await this.archives.verify(id);
    await this.audit.record({
      category: 'audit',
      action: AUDIT_ACTIONS.AUDIT_ARCHIVE_VERIFIED,
      outcome: result.valid ? 'succeeded' : 'failed',
      severity: result.valid ? 'info' : 'critical',
      targetType: 'audit_archive',
      targetId: id,
      metadata: result,
    });
    return result;
  }

  private toQuery(args: AuditEventsArgs) {
    return {
      ...args,
      actorType: args.actorType as AuditActorType | undefined,
      outcome: args.outcome as AuditOutcome | undefined,
      severity: args.severity as AuditSeverity | undefined,
      source: args.source as AuditSource | undefined,
    };
  }

  private mapEvent(row: any): AuditEventObject {
    const json = (value: unknown) =>
      value === null || value === undefined ? undefined : JSON.stringify(value);
    return {
      sequence: String(row.sequence),
      id: row.id,
      occurredAt: row.occurredAt,
      recordedAt: row.recordedAt,
      category: row.category,
      action: row.action,
      severity: row.severity,
      outcome: row.outcome,
      actorType: row.actorType,
      actorId: row.actorId ?? undefined,
      actorRole: row.actorRole ?? undefined,
      targetType: row.targetType ?? undefined,
      targetId: row.targetId ?? undefined,
      reason: row.reason ?? undefined,
      beforeJson: json(row.before),
      afterJson: json(row.after),
      changedFieldsJson: json(row.changedFields),
      metadataJson: json(row.metadata),
      errorJson: json(row.error),
      requestId: row.requestId ?? undefined,
      correlationId: row.correlationId ?? undefined,
      source: row.source,
      method: row.method ?? undefined,
      route: row.route ?? undefined,
    };
  }
}
