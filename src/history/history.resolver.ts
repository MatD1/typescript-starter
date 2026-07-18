import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { Public } from '../common/decorators/public.decorator';
import { TransportModeEnum } from '../transport/transport.types';
import {
  LinePerformanceDayObject,
  NetworkSnapshotObject,
} from './dto/line-performance.object';
import { HistoryService } from './history.service';

@Resolver()
export class HistoryResolver {
  constructor(private readonly historyService: HistoryService) {}

  @Public()
  @Query(() => [LinePerformanceDayObject], {
    description:
      'Daily punctuality history per line. Filter by line badge (T1, CCN, M1…) and/or mode; defaults to the last 30 days across the network.',
  })
  linePerformance(
    @Args('line', { nullable: true }) line?: string,
    @Args('mode', { type: () => TransportModeEnum, nullable: true })
    mode?: TransportModeEnum,
    @Args('days', { type: () => Int, nullable: true, defaultValue: 30 })
    days?: number,
  ) {
    return this.historyService.linePerformance({
      line,
      mode,
      days: Math.min(Math.max(days ?? 30, 1), 365),
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
}
