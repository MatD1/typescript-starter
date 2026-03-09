import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { CarriageDescriptorObject } from './carriage.object';

/**
 * Live position snapshot embedded in a TrackedTripObject.
 * Subset of VehiclePositionObject focused on map-display fields.
 */
@ObjectType()
export class LivePositionObject {
  @Field(() => Float)
  latitude!: number;

  @Field(() => Float)
  longitude!: number;

  @Field(() => Float, { nullable: true })
  bearing?: number;

  @Field(() => Float, { nullable: true })
  speed?: number;

  @Field({ nullable: true, description: 'INCOMING_AT | STOPPED_AT | IN_TRANSIT_TO' })
  currentStatus?: string;

  @Field({ nullable: true })
  currentStopId?: string;

  @Field(() => Int, { nullable: true })
  currentStopSequence?: number;

  @Field({ nullable: true })
  occupancyStatus?: string;

  @Field({ nullable: true, description: 'TfNSW track direction: UP | DOWN' })
  trackDirection?: string;

  @Field(() => Int, { nullable: true })
  timestamp?: number;

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
  @Field(() => Int, { nullable: true })
  stopSequence?: number;

  @Field({ nullable: true })
  stopId?: string;

  @Field(() => Int, { nullable: true, description: 'Arrival delay in seconds (positive = late)' })
  arrivalDelay?: number;

  @Field(() => Int, { nullable: true, description: 'Departure delay in seconds' })
  departureDelay?: number;

  @Field({ nullable: true })
  scheduleRelationship?: string;

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
  @Field({ description: 'GTFS trip ID — matches the tripId on a planned LegObject' })
  tripId!: string;

  @Field({ nullable: true })
  routeId?: string;

  @Field({ nullable: true })
  vehicleId?: string;

  @Field({ nullable: true, description: 'Vehicle label / fleet set number' })
  vehicleLabel?: string;

  @Field({ description: 'Transport mode this vehicle belongs to' })
  mode!: string;

  @Field({ nullable: true, description: 'Overall trip schedule relationship' })
  scheduleRelationship?: string;

  @Field(() => Int, { nullable: true, description: 'Overall trip delay in seconds (positive = late)' })
  delay?: number;

  /** Live GPS position — null if vehicle not yet broadcasting */
  @Field(() => LivePositionObject, {
    nullable: true,
    description: 'Live GPS position and status. Null if vehicle is not yet active.',
  })
  position?: LivePositionObject;

  @Field(() => [LiveStopTimeUpdateObject], {
    nullable: true,
    description: 'Real-time updates for upcoming stops on this trip',
  })
  stopTimeUpdates?: LiveStopTimeUpdateObject[];

  // ── Vehicle amenity info ─────────────────────────────────────────────────

  @Field({ nullable: true })
  vehicleModel?: string;

  @Field({ nullable: true })
  airConditioned?: boolean;

  @Field(() => Int, { nullable: true, description: '0=unknown 1=accessible 2=not accessible' })
  wheelchairAccessible?: number;

  @Field({ nullable: true })
  performingPriorTrip?: boolean;
}
