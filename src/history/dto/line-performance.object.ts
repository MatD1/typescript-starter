import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('LineHealthAlert', {
  description:
    'A currently-active degraded-service alert for a line (widespread delays, cancellations, or a severe disruption). Cleared automatically once the condition improves, so absence of this field means the line is currently healthy.',
})
export class LineHealthAlertObject {
  @Field()
  severity!: string;

  @Field()
  title!: string;

  @Field()
  body!: string;

  @Field(() => String)
  since!: any;
}

@ObjectType('DisruptionEffectCount')
export class DisruptionEffectCountObject {
  @Field()
  effect!: string;

  @Field(() => Int)
  count!: number;
}

@ObjectType('LinePerformanceDay', {
  description:
    'One day of aggregated punctuality for a line. Metrics are snapshot-weighted: trips are sampled every 5 minutes, so longer delays weigh more.',
})
export class LinePerformanceDayObject {
  @Field()
  day!: string;

  @Field()
  mode!: string;

  @Field()
  line!: string;

  @Field(() => Int, {
    description: 'Number of 5-minute samples contributing to this day.',
  })
  samples!: number;

  @Field(() => Int)
  trackedTrips!: number;

  @Field(() => Int)
  delayedTrips!: number;

  @Field(() => Int)
  cancelledTrips!: number;

  @Field(() => Int)
  skippedTrips!: number;

  @Field(() => Int)
  earlyTrips!: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Percentage of samples within 5 minutes of schedule.',
  })
  onTimePct!: number | null;

  @Field(() => Float, { nullable: true })
  peakOnTimePct!: number | null;

  @Field(() => Float, { nullable: true })
  offPeakOnTimePct!: number | null;

  @Field(() => Int, { nullable: true })
  avgDelaySeconds!: number | null;

  @Field(() => Int)
  maxDelaySeconds!: number;

  @Field(() => Int, { nullable: true })
  delayP50Seconds!: number | null;

  @Field(() => Int, { nullable: true })
  delayP90Seconds!: number | null;

  @Field(() => Int, {
    nullable: true,
    description: 'Average occupancy score 0–4 (EMPTY…FULL).',
  })
  avgOccupancy!: number | null;

  @Field(() => Int)
  crowdedVehicleSamples!: number;

  @Field(() => Int)
  disruptionMinutes!: number;

  @Field(() => [DisruptionEffectCountObject])
  disruptionCounts!: DisruptionEffectCountObject[];

  @Field(() => Int, {
    description: 'GTFS trips scheduled for this line today (Sydney calendar).',
  })
  scheduledTrips!: number;

  @Field(() => Float, {
    nullable: true,
    description:
      'trackedTrips / scheduledTrips × 100 — rough schedule coverage.',
  })
  reliabilityPct!: number | null;
}

@ObjectType('NetworkSnapshot', {
  description: 'Per-line network state from the history sampler.',
})
export class NetworkSnapshotObject {
  @Field(() => String)
  capturedAt!: any;

  @Field()
  mode!: string;

  @Field()
  line!: string;

  @Field(() => Int)
  vehicles!: number;

  @Field(() => Int)
  trackedTrips!: number;

  @Field(() => Int)
  delayedTrips!: number;

  @Field(() => Int)
  cancelledTrips!: number;

  @Field(() => Int)
  skippedTrips!: number;

  @Field(() => Int)
  earlyTrips!: number;

  @Field(() => Int)
  avgDelaySeconds!: number;

  @Field(() => Int)
  maxDelaySeconds!: number;

  @Field(() => Int)
  delayP50Seconds!: number;

  @Field(() => Int)
  delayP90Seconds!: number;

  @Field(() => Int)
  avgOccupancy!: number;

  @Field(() => Int)
  crowdedVehicles!: number;

  @Field(() => Int)
  activeDisruptions!: number;

  @Field(() => Int)
  scheduledTrips!: number;

  @Field(() => LineHealthAlertObject, { nullable: true })
  activeAlert!: LineHealthAlertObject | null;
}

@ObjectType('NetworkPerformanceSummary')
export class NetworkPerformanceSummaryObject {
  @Field(() => Int)
  days!: number;

  @Field(() => Int)
  totalTrackedTrips!: number;

  @Field(() => Int)
  totalDelayedTrips!: number;

  @Field(() => Int)
  totalCancelledTrips!: number;

  @Field(() => Int)
  totalDisruptionMinutes!: number;

  @Field(() => Float, { nullable: true })
  onTimePct!: number | null;

  @Field({ nullable: true })
  worstLine!: string | null;

  @Field(() => Float, { nullable: true })
  worstLineOnTimePct!: number | null;
}

@ObjectType('PerformancePeriodStats')
export class PerformancePeriodStatsObject {
  @Field()
  from!: string;

  @Field()
  to!: string;

  @Field(() => Float, { nullable: true })
  onTimePct!: number | null;

  @Field(() => Int, { nullable: true })
  avgDelaySeconds!: number | null;

  @Field(() => Int)
  disruptionMinutes!: number;
}

@ObjectType('LinePerformanceComparison')
export class LinePerformanceComparisonObject {
  @Field()
  line!: string;

  @Field({ nullable: true })
  mode!: string | null;

  @Field(() => PerformancePeriodStatsObject)
  periodA!: PerformancePeriodStatsObject;

  @Field(() => PerformancePeriodStatsObject)
  periodB!: PerformancePeriodStatsObject;

  @Field(() => Float, { nullable: true })
  onTimePctDelta!: number | null;

  @Field(() => Int, { nullable: true })
  avgDelaySecondsDelta!: number | null;

  @Field(() => Int)
  disruptionMinutesDelta!: number;
}
