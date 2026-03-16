import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

// ─── Shared pagination envelope type (used by service layer) ─────────────────

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasNextPage: boolean;
}

// ─── Stop ─────────────────────────────────────────────────────────────────────

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
export class PaginatedStopsObject {
  @Field(() => [GtfsStopObject])
  data!: GtfsStopObject[];

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  limit!: number;

  @Field(() => Int)
  offset!: number;

  @Field()
  hasNextPage!: boolean;
}

// ─── Route ────────────────────────────────────────────────────────────────────

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
export class PaginatedRoutesObject {
  @Field(() => [GtfsRouteObject])
  data!: GtfsRouteObject[];

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  limit!: number;

  @Field(() => Int)
  offset!: number;

  @Field()
  hasNextPage!: boolean;
}

// ─── Trip ─────────────────────────────────────────────────────────────────────

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

@ObjectType()
export class PaginatedTripsObject {
  @Field(() => [GtfsTripObject])
  data!: GtfsTripObject[];

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  limit!: number;

  @Field(() => Int)
  offset!: number;

  @Field()
  hasNextPage!: boolean;
}

// ─── Stop Time ────────────────────────────────────────────────────────────────

@ObjectType()
export class GtfsStopTimeObject {
  @Field()
  id!: string;

  @Field()
  tripId!: string;

  @Field({ nullable: true })
  arrivalTime?: string;

  @Field({ nullable: true })
  departureTime?: string;

  @Field()
  stopId!: string;

  @Field(() => Int)
  stopSequence!: number;

  @Field(() => Int, { nullable: true })
  pickupType?: number;

  @Field(() => Int, { nullable: true })
  dropOffType?: number;

  @Field({ nullable: true })
  mode?: string;
}

@ObjectType()
export class PaginatedStopTimesObject {
  @Field(() => [GtfsStopTimeObject])
  data!: GtfsStopTimeObject[];

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  limit!: number;

  @Field(() => Int)
  offset!: number;

  @Field()
  hasNextPage!: boolean;
}
