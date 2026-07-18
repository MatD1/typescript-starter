import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

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

  @Field(() => Int)
  trackedTrips!: number;

  @Field(() => Int)
  cancelledTrips!: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Percentage of samples within 5 minutes of schedule.',
  })
  onTimePct!: number | null;

  @Field(() => Int, { nullable: true })
  avgDelaySeconds!: number | null;

  @Field(() => Int)
  maxDelaySeconds!: number;

  @Field(() => Int)
  disruptionMinutes!: number;
}

@ObjectType('NetworkSnapshot', {
  description: 'Latest live per-line network state from the history sampler.',
})
export class NetworkSnapshotObject {
  @Field()
  capturedAt!: Date;

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
  avgDelaySeconds!: number;

  @Field(() => Int)
  maxDelaySeconds!: number;

  @Field(() => Int)
  activeDisruptions!: number;
}
