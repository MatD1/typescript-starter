import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class GtfsStopObject {
  @Field()
  stopId!: string;

  @Field()
  stopName!: string;

  @Field({ nullable: true })
  stopCode?: string;

  @Field(() => Float, { nullable: true })
  lat?: number;

  @Field(() => Float, { nullable: true })
  lon?: number;

  @Field({ nullable: true })
  mode?: string;
}

@ObjectType()
export class GtfsRouteObject {
  @Field()
  routeId!: string;

  @Field({ nullable: true })
  routeShortName?: string;

  @Field({ nullable: true })
  routeLongName?: string;

  @Field(() => Int, { nullable: true })
  routeType?: number;

  @Field({ nullable: true })
  routeColor?: string;

  @Field({ nullable: true })
  mode?: string;
}

@ObjectType()
export class GtfsTripObject {
  @Field()
  tripId!: string;

  @Field({ nullable: true })
  routeId?: string;

  @Field({ nullable: true })
  serviceId?: string;

  @Field({ nullable: true })
  tripHeadsign?: string;

  @Field(() => Int, { nullable: true })
  directionId?: number;

  @Field({ nullable: true })
  mode?: string;
}
