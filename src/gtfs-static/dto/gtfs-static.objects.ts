import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  @ApiProperty({ description: 'GTFS Stop ID' })
  @Field()
  stopId!: string;

  @ApiProperty({ description: 'Stop Name' })
  @Field()
  stopName!: string;

  @ApiPropertyOptional({ description: 'Stop Code' })
  @Field({ nullable: true })
  stopCode?: string;

  @ApiPropertyOptional({ description: 'Latitude' })
  @Field(() => Float, { nullable: true })
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude' })
  @Field(() => Float, { nullable: true })
  lon?: number;

  @ApiPropertyOptional({ description: 'Transport Mode' })
  @Field({ nullable: true })
  mode?: string;
}

@ObjectType()
export class PaginatedStopsObject {
  @ApiProperty({ type: [GtfsStopObject] })
  @Field(() => [GtfsStopObject])
  data!: GtfsStopObject[];

  @ApiProperty()
  @Field(() => Int)
  total!: number;

  @ApiProperty()
  @Field(() => Int)
  limit!: number;

  @ApiProperty()
  @Field(() => Int)
  offset!: number;

  @ApiProperty()
  @Field()
  hasNextPage!: boolean;
}

// ─── Route ────────────────────────────────────────────────────────────────────

@ObjectType()
export class GtfsRouteObject {
  @ApiProperty({ description: 'GTFS Route ID' })
  @Field()
  routeId!: string;

  @ApiPropertyOptional({ description: 'Route Short Name (e.g. T1, M1)' })
  @Field({ nullable: true })
  routeShortName?: string;

  @ApiPropertyOptional({ description: 'Route Long Name' })
  @Field({ nullable: true })
  routeLongName?: string;

  @ApiPropertyOptional({ description: 'Route Type (GTFS enum)' })
  @Field(() => Int, { nullable: true })
  routeType?: number;

  @ApiPropertyOptional({ description: 'Route hex color' })
  @Field({ nullable: true })
  routeColor?: string;

  @ApiPropertyOptional({ description: 'Transport mode' })
  @Field({ nullable: true })
  mode?: string;
}

@ObjectType()
export class PaginatedRoutesObject {
  @ApiProperty({ type: [GtfsRouteObject] })
  @Field(() => [GtfsRouteObject])
  data!: GtfsRouteObject[];

  @ApiProperty()
  @Field(() => Int)
  total!: number;

  @ApiProperty()
  @Field(() => Int)
  limit!: number;

  @ApiProperty()
  @Field(() => Int)
  offset!: number;

  @ApiProperty()
  @Field()
  hasNextPage!: boolean;
}

// ─── Trip ─────────────────────────────────────────────────────────────────────

@ObjectType()
export class GtfsTripObject {
  @ApiProperty({ description: 'GTFS Trip ID' })
  @Field()
  tripId!: string;

  @ApiPropertyOptional({ description: 'GTFS Route ID' })
  @Field({ nullable: true })
  routeId?: string;

  @ApiPropertyOptional({ description: 'GTFS Service ID' })
  @Field({ nullable: true })
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Trip Headsign' })
  @Field({ nullable: true })
  tripHeadsign?: string;

  @ApiPropertyOptional({ description: '0=Outbound, 1=Inbound' })
  @Field(() => Int, { nullable: true })
  directionId?: number;

  @ApiPropertyOptional({ description: 'Transport mode' })
  @Field({ nullable: true })
  mode?: string;
}

@ObjectType()
export class PaginatedTripsObject {
  @ApiProperty({ type: [GtfsTripObject] })
  @Field(() => [GtfsTripObject])
  data!: GtfsTripObject[];

  @ApiProperty()
  @Field(() => Int)
  total!: number;

  @ApiProperty()
  @Field(() => Int)
  limit!: number;

  @ApiProperty()
  @Field(() => Int)
  offset!: number;

  @Field()
  hasNextPage!: boolean;
}

// ─── Stop Time ────────────────────────────────────────────────────────────────

@ObjectType()
export class GtfsStopTimeObject {
  @ApiProperty({ description: 'Internal unique ID' })
  @Field()
  id!: string;

  @ApiProperty({ description: 'GTFS Trip ID' })
  @Field()
  tripId!: string;

  @ApiPropertyOptional({ description: 'Arrival time (HH:mm:ss)' })
  @Field({ nullable: true })
  arrivalTime?: string;

  @ApiPropertyOptional({ description: 'Departure time (HH:mm:ss)' })
  @Field({ nullable: true })
  departureTime?: string;

  @ApiProperty({ description: 'GTFS Stop ID' })
  @Field()
  stopId!: string;

  @ApiProperty({ description: 'Order of the stop in the trip' })
  @Field(() => Int)
  stopSequence!: number;

  @ApiPropertyOptional({ description: '0=Regular, 1=No pickup, 2=Phone request, 3=Driver request' })
  @Field(() => Int, { nullable: true })
  pickupType?: number;

  @ApiPropertyOptional({ description: '0=Regular, 1=No drop-off, 2=Phone request, 3=Driver request' })
  @Field(() => Int, { nullable: true })
  dropOffType?: number;

  @ApiPropertyOptional({ description: 'Transport mode' })
  @Field({ nullable: true })
  mode?: string;
}

@ObjectType()
export class PaginatedStopTimesObject {
  @ApiProperty({ type: [GtfsStopTimeObject] })
  @Field(() => [GtfsStopTimeObject])
  data!: GtfsStopTimeObject[];

  @ApiProperty()
  @Field(() => Int)
  total!: number;

  @ApiProperty()
  @Field(() => Int)
  limit!: number;

  @ApiProperty()
  @Field(() => Int)
  offset!: number;

  @ApiProperty()
  @Field()
  hasNextPage!: boolean;
}
