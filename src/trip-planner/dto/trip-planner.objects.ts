import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class LocationObject {
  @Field({ nullable: true })
  id?: string;

  @Field({ nullable: true })
  name?: string;

  @Field(() => Float, { nullable: true })
  lat?: number;

  @Field(() => Float, { nullable: true })
  lon?: number;

  @Field({ nullable: true })
  type?: string;
}

@ObjectType()
export class LegObject {
  @Field({ nullable: true })
  tripId?: string;

  @Field({ nullable: true })
  transportation?: string;

  @Field({ nullable: true })
  lineName?: string;

  @Field({ nullable: true })
  destination?: string;

  @Field(() => LocationObject, { nullable: true })
  origin?: LocationObject;

  @Field(() => LocationObject, { nullable: true })
  dest?: LocationObject;

  @Field({ nullable: true })
  departureTimePlanned?: string;

  @Field({ nullable: true })
  departureTimeEstimated?: string;

  @Field({ nullable: true })
  arrivalTimePlanned?: string;

  @Field({ nullable: true })
  arrivalTimeEstimated?: string;

  @Field(() => Int, { nullable: true })
  duration?: number;
}

@ObjectType()
export class TripResultObject {
  @Field(() => [LegObject])
  legs!: LegObject[];

  @Field(() => Int, { nullable: true })
  duration?: number;

  @Field(() => Int, { nullable: true })
  interchanges?: number;
}

@ObjectType()
export class StopObject {
  @Field({ nullable: true })
  id?: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  disassembledName?: string;

  @Field(() => Float, { nullable: true })
  lat?: number;

  @Field(() => Float, { nullable: true })
  lon?: number;

  @Field({ nullable: true })
  type?: string;

  @Field({ nullable: true })
  transportMode?: string;
}

@ObjectType()
export class DepartureObject {
  @Field({ nullable: true })
  stopName?: string;

  @Field({ nullable: true })
  stopId?: string;

  @Field({ nullable: true })
  lineName?: string;

  @Field({ nullable: true })
  destination?: string;

  @Field({ nullable: true })
  departureTimePlanned?: string;

  @Field({ nullable: true })
  departureTimeEstimated?: string;

  @Field({ nullable: true })
  transportMode?: string;

  @Field({ nullable: true })
  platform?: string;
}
