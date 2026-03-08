import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { CarriageDescriptorObject } from './carriage.object';

@ObjectType()
export class VehiclePositionObject {
  @Field()
  vehicleId!: string;

  @Field({ nullable: true })
  tripId?: string;

  @Field({ nullable: true })
  routeId?: string;

  @Field(() => Int, { nullable: true })
  directionId?: number;

  @Field({ nullable: true })
  startDate?: string;

  @Field({ nullable: true })
  startTime?: string;

  @Field({ nullable: true })
  tripScheduleRelationship?: string;

  @Field(() => Float)
  latitude!: number;

  @Field(() => Float)
  longitude!: number;

  @Field(() => Float, { nullable: true })
  bearing?: number;

  @Field(() => Float, { nullable: true })
  odometer?: number;

  @Field(() => Float, { nullable: true })
  speed?: number;

  @Field(() => Int, { nullable: true })
  currentStopSequence?: number;

  @Field({ nullable: true })
  currentStopId?: string;

  @Field({ nullable: true })
  currentStatus?: string;

  @Field(() => Int, { nullable: true })
  timestamp?: number;

  @Field({ nullable: true })
  congestionLevel?: string;

  @Field({ nullable: true })
  occupancyStatus?: string;

  // ── TfNSW extension fields ──────────────────────────────────────────────────

  @Field({ nullable: true, description: 'Track direction: UP | DOWN' })
  trackDirection?: string;

  @Field({ nullable: true, description: 'Vehicle label / set number' })
  vehicleLabel?: string;

  @Field({ nullable: true })
  vehicleModel?: string;

  @Field({ nullable: true })
  airConditioned?: boolean;

  @Field(() => Int, { nullable: true, description: '0=unknown, 1=accessible, 2=not accessible' })
  wheelchairAccessible?: number;

  @Field({ nullable: true })
  performingPriorTrip?: boolean;

  @Field(() => Int, { nullable: true })
  specialVehicleAttributes?: number;

  @Field(() => [CarriageDescriptorObject], {
    nullable: true,
    description: 'Per-carriage composition with occupancy and amenity data',
  })
  consist?: CarriageDescriptorObject[];

  @Field()
  mode!: string;
}
