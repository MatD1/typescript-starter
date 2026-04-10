import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CarriageDescriptorObject } from './carriage.object';

/**
 * Live position snapshot embedded in a TrackedTripObject.
 * Subset of VehiclePositionObject focused on map-display fields.
 */
@ObjectType()
export class LivePositionObject {
  @ApiProperty()
  @Field(() => Float)
  latitude!: number;

  @ApiProperty()
  @Field(() => Float)
  longitude!: number;

  @ApiPropertyOptional()
  @Field(() => Float, { nullable: true })
  bearing?: number;

  @ApiPropertyOptional()
  @Field(() => Float, { nullable: true })
  speed?: number;

  @ApiPropertyOptional({ description: 'INCOMING_AT | STOPPED_AT | IN_TRANSIT_TO' })
  @Field({ nullable: true, description: 'INCOMING_AT | STOPPED_AT | IN_TRANSIT_TO' })
  currentStatus?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  currentStopId?: string;

  @ApiPropertyOptional()
  @Field(() => Int, { nullable: true })
  currentStopSequence?: number;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  occupancyStatus?: string;

  @ApiPropertyOptional({ description: 'TfNSW track direction: UP | DOWN' })
  @Field({ nullable: true, description: 'TfNSW track direction: UP | DOWN' })
  trackDirection?: string;

  @ApiPropertyOptional()
  @Field(() => Int, { nullable: true })
  timestamp?: number;

  @ApiPropertyOptional({ type: () => [CarriageDescriptorObject] })
  @Field(() => [CarriageDescriptorObject], {
    nullable: true,
    description: 'Per-carriage occupancy and amenity data',
  })
  consist?: CarriageDescriptorObject[];
}

/**
 * Live stop-time update within a tracked trip.
 */
@ObjectType()
export class LiveStopTimeUpdateObject {
  @ApiPropertyOptional()
  @Field(() => Int, { nullable: true })
  stopSequence?: number;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  stopId?: string;

  @ApiPropertyOptional({ description: 'Arrival delay in seconds (positive = late)' })
  @Field(() => Int, { nullable: true, description: 'Arrival delay in seconds (positive = late)' })
  arrivalDelay?: number;

  @ApiPropertyOptional({ description: 'Departure delay in seconds' })
  @Field(() => Int, { nullable: true, description: 'Departure delay in seconds' })
  departureDelay?: number;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  scheduleRelationship?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  departureOccupancyStatus?: string;
}

/**
 * Combined live view of a single trip — vehicle position + trip delays +
 * vehicle amenity info. Returned by the `trackTrip` query / endpoint.
 *
 * All fields except `tripId` are nullable because a vehicle may not yet be
 * active (e.g. pre-departure) or position data may not be available for
 * every mode.
 */
@ObjectType()
export class TrackedTripObject {
  @ApiProperty({ description: 'GTFS trip ID — matches the tripId on a planned LegObject' })
  @Field({ description: 'GTFS trip ID — matches the tripId on a planned LegObject' })
  tripId!: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  routeId?: string;

  @ApiPropertyOptional({ description: 'Line code from GTFS (e.g. T1, CCN)' })
  @Field({
    nullable: true,
    description: 'Line code from GTFS (e.g. T1, CCN)',
  })
  lineCode?: string;

  @ApiPropertyOptional({ description: 'Route colour hex from GTFS (e.g. 009B77)' })
  @Field({
    nullable: true,
    description: 'Route colour hex from GTFS (e.g. 009B77)',
  })
  routeColour?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Vehicle label / fleet set number' })
  @Field({ nullable: true, description: 'Vehicle label / fleet set number' })
  vehicleLabel?: string;

  @ApiProperty({ description: 'Transport mode this vehicle belongs to' })
  @Field({ description: 'Transport mode this vehicle belongs to' })
  mode!: string;

  @ApiPropertyOptional({ description: 'Overall trip schedule relationship' })
  @Field({ nullable: true, description: 'Overall trip schedule relationship' })
  scheduleRelationship?: string;

  @ApiPropertyOptional({ description: 'Overall trip delay in seconds (positive = late)' })
  @Field(() => Int, { nullable: true, description: 'Overall trip delay in seconds (positive = late)' })
  delay?: number;

  /** Live GPS position — null if vehicle not yet broadcasting */
  @ApiPropertyOptional({ type: () => LivePositionObject })
  @Field(() => LivePositionObject, {
    nullable: true,
    description: 'Live GPS position and status. Null if vehicle is not yet active.',
  })
  position?: LivePositionObject;

  @ApiPropertyOptional({ type: () => [LiveStopTimeUpdateObject] })
  @Field(() => [LiveStopTimeUpdateObject], {
    nullable: true,
    description: 'Real-time updates for upcoming stops on this trip',
  })
  stopTimeUpdates?: LiveStopTimeUpdateObject[];

  // ── Vehicle amenity info ─────────────────────────────────────────────────

  @ApiPropertyOptional()
  @Field({ nullable: true })
  vehicleModel?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  airConditioned?: boolean;

  @ApiPropertyOptional({ description: '0=unknown 1=accessible 2=not accessible' })
  @Field(() => Int, { nullable: true, description: '0=unknown 1=accessible 2=not accessible' })
  wheelchairAccessible?: number;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  performingPriorTrip?: boolean;
}
