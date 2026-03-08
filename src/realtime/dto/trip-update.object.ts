import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class StopTimeUpdateObject {
  @Field(() => Int, { nullable: true })
  stopSequence?: number;

  @Field({ nullable: true })
  stopId?: string;

  @Field(() => Int, { nullable: true })
  arrivalDelay?: number;

  @Field(() => Int, { nullable: true })
  arrivalTime?: number;

  @Field(() => Int, { nullable: true })
  departureDelay?: number;

  @Field(() => Int, { nullable: true })
  departureTime?: number;

  @Field({ nullable: true })
  scheduleRelationship?: string;
}

@ObjectType()
export class TripUpdateObject {
  @Field()
  tripId!: string;

  @Field({ nullable: true })
  routeId?: string;

  @Field({ nullable: true })
  vehicleId?: string;

  @Field(() => Int, { nullable: true })
  directionId?: number;

  @Field({ nullable: true })
  startDate?: string;

  @Field({ nullable: true })
  startTime?: string;

  @Field({ nullable: true })
  scheduleRelationship?: string;

  @Field(() => [StopTimeUpdateObject])
  stopTimeUpdates!: StopTimeUpdateObject[];

  @Field(() => Int, { nullable: true })
  timestamp?: number;

  @Field()
  mode!: string;
}
