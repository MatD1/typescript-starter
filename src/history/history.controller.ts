import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { HistoryBackfillService } from './history-backfill.service';
import { HistorySamplerService } from './history-sampler.service';
import { HistoryService } from './history.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';

class PurgeHistoryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsString()
  line?: string;

  @IsOptional()
  @IsBoolean()
  confirmFullWipe?: boolean;
}

@ApiTags('History')
@Controller('history')
export class HistoryController {
  constructor(
    private readonly historyService: HistoryService,
    private readonly samplerService: HistorySamplerService,
    private readonly backfillService: HistoryBackfillService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Get('line-performance')
  @ApiOperation({
    summary: 'Daily line performance (REST mirror of GraphQL linePerformance)',
  })
  linePerformance(
    @Query('line') line?: string,
    @Query('mode') mode?: string,
    @Query('days') days?: string,
  ) {
    return this.historyService.linePerformance({
      line,
      mode,
      days: Math.min(Math.max(parseInt(days ?? '30', 10) || 30, 1), 365),
    });
  }

  @Public()
  @Get('network-health')
  @ApiOperation({ summary: 'Latest per-line network snapshots' })
  networkHealth(@Query('mode') mode?: string) {
    return this.historyService.latestSnapshots(mode);
  }

  @Public()
  @Get('snapshots')
  @ApiOperation({ summary: 'Snapshot time-series for charts' })
  snapshotHistory(
    @Query('line') line?: string,
    @Query('mode') mode?: string,
    @Query('hours') hours?: string,
  ) {
    return this.historyService.snapshotHistory({
      line,
      mode,
      hours: Math.min(Math.max(parseInt(hours ?? '24', 10) || 24, 1), 24 * 30),
    });
  }

  @Public()
  @Get('summary')
  @ApiOperation({ summary: 'Network-wide performance summary' })
  summary(@Query('days') days?: string) {
    return this.historyService.networkPerformanceSummary(
      Math.min(Math.max(parseInt(days ?? '7', 10) || 7, 1), 365),
    );
  }

  @Public()
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'CSV export of daily line performance' })
  @ApiOkResponse({ description: 'CSV file' })
  async exportCsv(
    @Res() res: Response,
    @Query('line') line?: string,
    @Query('mode') mode?: string,
    @Query('days') days?: string,
  ) {
    const csv = await this.historyService.exportLinePerformanceCsv({
      line,
      mode,
      days: Math.min(Math.max(parseInt(days ?? '30', 10) || 30, 1), 365),
    });
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="line-performance.csv"',
    );
    res.send(csv);
  }

  @Public()
  @UseGuards(AdminGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @Get('sampler/metrics')
  @ApiOperation({ summary: 'History sampler operational metrics (admin)' })
  samplerMetrics() {
    return this.samplerService.getMetrics();
  }

  @Public()
  @UseGuards(AdminGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @Post('backfill')
  @ApiOperation({
    summary:
      'Rebuild line_performance_daily from retained network_snapshots (admin)',
  })
  async backfill(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Headers('x-audit-reason') reason?: string,
  ) {
    const attempt = await this.audit.recordAttempt({
      category: 'history',
      action: AUDIT_ACTIONS.HISTORY_BACKFILL_ATTEMPTED,
      severity: 'high',
      targetType: 'history',
      targetId: 'line_performance_daily',
      reason,
      metadata: { from, to },
    });
    try {
      const result = await this.backfillService.backfillFromSnapshots({
        from,
        to,
      });
      await this.audit.record({
        category: 'history',
        action: AUDIT_ACTIONS.HISTORY_BACKFILL_COMPLETED,
        outcome: 'succeeded',
        severity: 'high',
        targetType: 'history',
        targetId: 'line_performance_daily',
        reason,
        correlationId: attempt.id,
        metadata: result as unknown as Record<string, unknown>,
      });
      return result;
    } catch (error) {
      await this.audit.record({
        category: 'history',
        action: AUDIT_ACTIONS.HISTORY_BACKFILL_FAILED,
        outcome: 'failed',
        severity: 'high',
        targetType: 'history',
        targetId: 'line_performance_daily',
        reason,
        correlationId: attempt.id,
        error: {
          code: 'HISTORY_BACKFILL_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  @Public()
  @UseGuards(AdminGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @Post('purge')
  @ApiOperation({
    summary: 'Purge accumulated history data (admin)',
    description:
      'Deletes from network_snapshots, line_performance_daily, and disruption_events, scoped by ' +
      'date range and optionally mode/line. Requires either from/to or confirmFullWipe=true — ' +
      'refuses an unscoped, unconfirmed request rather than risk wiping everything by accident. ' +
      'Does not touch line_health_alerts (live alert state, not historical accumulation).',
  })
  @ApiBody({ type: PurgeHistoryDto })
  async purge(
    @Body() dto: PurgeHistoryDto,
    @Headers('x-audit-reason') reason?: string,
  ) {
    const attempt = await this.audit.recordAttempt({
      category: 'history',
      action: AUDIT_ACTIONS.HISTORY_PURGE_ATTEMPTED,
      severity: 'critical',
      targetType: 'history',
      targetId: dto.confirmFullWipe ? 'all' : 'filtered',
      reason,
      metadata: { ...dto },
    });
    try {
      const result = await this.historyService.purgeHistory(dto);
      await this.audit.record({
        category: 'history',
        action: AUDIT_ACTIONS.HISTORY_PURGE_COMPLETED,
        outcome: 'succeeded',
        severity: 'critical',
        targetType: 'history',
        targetId: dto.confirmFullWipe ? 'all' : 'filtered',
        reason,
        correlationId: attempt.id,
        metadata: result as unknown as Record<string, unknown>,
      });
      return result;
    } catch (error) {
      await this.audit.record({
        category: 'history',
        action: AUDIT_ACTIONS.HISTORY_PURGE_FAILED,
        outcome: 'failed',
        severity: 'critical',
        targetType: 'history',
        targetId: dto.confirmFullWipe ? 'all' : 'filtered',
        reason,
        correlationId: attempt.id,
        error: {
          code: 'HISTORY_PURGE_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}
