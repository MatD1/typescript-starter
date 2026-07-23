import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { AuditEventsQueryDto, CreateAuditExportDto } from './audit.dto';
import { AuditService } from './audit.service';
import { AuditExportService } from './audit.export.service';
import { AuditArchiveService } from './audit.archive.service';
import { AUDIT_ACTIONS } from './audit.types';

@ApiTags('Admin Audit')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly exports: AuditExportService,
    private readonly archives: AuditArchiveService,
  ) {}

  @Get('audit-events')
  @ApiOperation({ summary: 'Search append-only audit events' })
  async search(@Query() query: AuditEventsQueryDto) {
    const result = await this.audit.query(query);
    await this.audit.recordBestEffort({
      category: 'audit',
      action: AUDIT_ACTIONS.AUDIT_SEARCHED,
      outcome: 'succeeded',
      targetType: 'audit_event',
      metadata: {
        filters: { ...query, cursor: query.cursor ? '[PRESENT]' : undefined },
        returned: result.data.length,
      },
    });
    return result;
  }

  @Get('audit-events/summary')
  @ApiOperation({ summary: 'Summarize audit events by action and outcome' })
  summary(@Query() query: AuditEventsQueryDto) {
    return this.audit.summary(query);
  }

  @Post('audit-events/exports')
  @ApiOperation({ summary: 'Create an audit event export' })
  createExport(@Req() req: Request, @Body() dto: CreateAuditExportDto) {
    const user = (req as any).user as { userId?: string } | undefined;
    return this.exports.create(user?.userId ?? '', dto);
  }

  @Get('audit-events/exports/:id')
  @ApiOperation({ summary: 'Get audit export status' })
  getExport(@Param('id') id: string) {
    return this.exports.get(id);
  }

  @Get('audit-events/exports/:id/download')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Download a completed, unexpired audit export' })
  async downloadExport(@Param('id') id: string, @Res() res: Response) {
    const file = await this.exports.download(id);
    await this.audit.record({
      category: 'audit',
      action: AUDIT_ACTIONS.AUDIT_ARCHIVE_DOWNLOADED,
      outcome: 'succeeded',
      targetType: 'audit_export',
      targetId: id,
    });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.send(file.body);
  }

  @Get('audit-events/:id')
  @ApiOperation({ summary: 'Get one audit event' })
  async getOne(@Param('id') id: string) {
    const row = await this.audit.getById(id);
    await this.audit.recordBestEffort({
      category: 'audit',
      action: AUDIT_ACTIONS.AUDIT_VIEWED,
      outcome: 'succeeded',
      targetType: 'audit_event',
      targetId: id,
    });
    return row;
  }

  @Get('audit-archives')
  @ApiOperation({ summary: 'List immutable audit archives' })
  async archivesList(@Query('limit') limit?: string) {
    const result = await this.audit.listArchives(
      limit ? Number(limit) : undefined,
    );
    await this.audit.recordBestEffort({
      category: 'audit',
      action: AUDIT_ACTIONS.AUDIT_SEARCHED,
      outcome: 'succeeded',
      targetType: 'audit_archive',
      metadata: { returned: result.length },
    });
    return result;
  }

  @Post('audit-archives/:id/verify')
  @ApiOperation({ summary: 'Verify an immutable audit archive' })
  async verifyArchive(@Param('id') id: string) {
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
}
