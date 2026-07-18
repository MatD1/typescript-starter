import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { Public } from '../common/decorators/public.decorator';
import { TransportModeEnum } from '../transport/transport.types';
import {
  LinePerformanceComparisonObject,
  LinePerformanceDayObject,
  NetworkPerformanceSummaryObject,
  NetworkSnapshotObject,
} from './dto/line-performance.object';
import { HistoryService } from './history.service';

@Resolver()
export class HistoryResolver {
  constructor(private readonly historyService: HistoryService) {}

  @Public()
  @Query(() => [LinePerformanceDayObject], {
    description:
      'Daily punctuality history per line. Filter by line badge (T1, CCN, M1…) and/or mode; defaults to the last 30 days across the network. Optionally pass from/to (YYYY-MM-DD, Sydney) instead of days.',
  })
  linePerformance(
    @Args('line', { nullable: true }) line?: string,
    @Args('mode', { type: () => TransportModeEnum, nullable: true })
    mode?: TransportModeEnum,
    @Args('days', { type: () => Int, nullable: true, defaultValue: 30 })
    days?: number,
    @Args('from', { nullable: true }) from?: string,
    @Args('to', { nullable: true }) to?: string,
  ) {
    return this.historyService.linePerformance({
      line,
      mode,
      days: Math.min(Math.max(days ?? 30, 1), 365),
      from,
      to,
    });
  }

  @Public()
  @Query(() => [NetworkSnapshotObject], {
    description:
      'Most recent per-line network snapshot from the history sampler (updated every 5 minutes).',
  })
  networkHealth(
    @Args('mode', { type: () => TransportModeEnum, nullable: true })
    mode?: TransportModeEnum,
  ) {
    return this.historyService.latestSnapshots(mode);
  }

  @Public()
  @Query(() => [NetworkSnapshotObject], {
    description:
      'Historical network snapshots for charts (retained ~30 days). Defaults to last 24 hours.',
  })
  networkSnapshotHistory(
    @Args('line', { nullable: true }) line?: string,
    @Args('mode', { type: () => TransportModeEnum, nullable: true })
    mode?: TransportModeEnum,
    @Args('hours', { type: () => Int, nullable: true, defaultValue: 24 })
    hours?: number,
  ) {
    return this.historyService.snapshotHistory({
      line,
      mode,
      hours: Math.min(Math.max(hours ?? 24, 1), 24 * 30),
    });
  }

  @Public()
  @Query(() => NetworkPerformanceSummaryObject, {
    description: 'Network-wide weighted punctuality summary over the last N days.',
  })
  networkPerformanceSummary(
    @Args('days', { type: () => Int, nullable: true, defaultValue: 7 })
    days?: number,
  ) {
    return this.historyService.networkPerformanceSummary(
      Math.min(Math.max(days ?? 7, 1), 365),
    );
  }

  @Public()
  @Query(() => LinePerformanceComparisonObject, {
    description:
      'Compare a line across two date ranges (e.g. this week vs last week). Dates are YYYY-MM-DD Sydney.',
  })
  compareLinePerformance(
    @Args('line') line: string,
    @Args('periodAFrom') periodAFrom: string,
    @Args('periodATo') periodATo: string,
    @Args('periodBFrom') periodBFrom: string,
    @Args('periodBTo') periodBTo: string,
    @Args('mode', { type: () => TransportModeEnum, nullable: true })
    mode?: TransportModeEnum,
  ) {
    return this.historyService.compareLinePerformance({
      line,
      mode,
      periodAFrom,
      periodATo,
      periodBFrom,
      periodBTo,
    });
  }
}
