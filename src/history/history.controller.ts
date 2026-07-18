import {
  Controller,
  Get,
  Header,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { HistoryBackfillService } from './history-backfill.service';
import { HistorySamplerService } from './history-sampler.service';
import { HistoryService } from './history.service';

@ApiTags('History')
@Controller('history')
export class HistoryController {
  constructor(
    private readonly historyService: HistoryService,
    private readonly samplerService: HistorySamplerService,
    private readonly backfillService: HistoryBackfillService,
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
  backfill(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.backfillService.backfillFromSnapshots({ from, to });
  }
}
