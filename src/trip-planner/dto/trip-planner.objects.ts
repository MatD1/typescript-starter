import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ObjectType()
export class LocationObject {
  @ApiPropertyOptional()
  @Field({ nullable: true })
  id?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  name?: string;

  @ApiPropertyOptional()
  @Field(() => Float, { nullable: true })
  lat?: number;

  @ApiPropertyOptional()
  @Field(() => Float, { nullable: true })
  lon?: number;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  type?: string;
}

@ObjectType()
export class LegObject {
  @ApiPropertyOptional()
  @Field({ nullable: true })
  tripId?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  transportation?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  lineName?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  destination?: string;

  @ApiPropertyOptional({ type: () => LocationObject })
  @Field(() => LocationObject, { nullable: true })
  origin?: LocationObject;

  @ApiPropertyOptional({ type: () => LocationObject })
  @Field(() => LocationObject, { nullable: true })
  dest?: LocationObject;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  departureTimePlanned?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  departureTimeEstimated?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  arrivalTimePlanned?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  arrivalTimeEstimated?: string;

  @ApiPropertyOptional()
  @Field(() => Int, { nullable: true })
  duration?: number;

  @Field({
    nullable: true,
    description: 'Line code from GTFS (e.g. T1, CCN)',
  })
  @ApiPropertyOptional({ description: 'Line code from GTFS (e.g. T1, CCN)' })
  lineCode?: string;

  @Field({
    nullable: true,
    description: 'Route colour hex from GTFS (e.g. 009B77)',
  })
  @ApiPropertyOptional({ description: 'Route colour hex from GTFS (e.g. 009B77)' })
  routeColour?: string;
}

@ObjectType()
export class TripResultObject {
  @ApiProperty({ type: [LegObject] })
  @Field(() => [LegObject])
  legs!: LegObject[];

  @ApiPropertyOptional()
  @Field(() => Int, { nullable: true })
  duration?: number;

  @ApiPropertyOptional()
  @Field(() => Int, { nullable: true })
  interchanges?: number;
}

@ObjectType()
export class TripPlannerResponseObject {
  @ApiProperty({ type: [TripResultObject] })
  @Field(() => [TripResultObject])
  trips!: TripResultObject[];

  @ApiPropertyOptional()
  @Field({ nullable: true })
  context?: string;
}

@ObjectType()
export class StopObject {
  @ApiPropertyOptional()
  @Field({ nullable: true })
  id?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  name?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  disassembledName?: string;

  @ApiPropertyOptional()
  @Field(() => Float, { nullable: true })
  lat?: number;

  @ApiPropertyOptional()
  @Field(() => Float, { nullable: true })
  lon?: number;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  type?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  transportMode?: string;
}

@ObjectType()
export class DepartureObject {
  // internal tripID to power GraphQL data loader
  tripId?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  stopName?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  stopId?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  lineName?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  destination?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  departureTimePlanned?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  departureTimeEstimated?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  transportMode?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  platform?: string;

  @Field({
    nullable: true,
    description: 'Line code from GTFS (e.g. T1, CCN)',
  })
  @ApiPropertyOptional({ description: 'Line code from GTFS (e.g. T1, CCN)' })
  lineCode?: string;

  @Field({
    nullable: true,
    description: 'Route colour hex from GTFS (e.g. 009B77)',
  })
  @ApiPropertyOptional({ description: 'Route colour hex from GTFS (e.g. 009B77)' })
  routeColour?: string;
}
