import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CarriageDescriptorObject } from './carriage.object';

@ObjectType()
export class VehiclePositionObject {
  @ApiProperty()
  @Field()
  vehicleId!: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  tripId?: string;

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
  @Field(() => Int, { nullable: true })
  directionId?: number;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  startDate?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  startTime?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  tripScheduleRelationship?: string;

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
  odometer?: number;

  @ApiPropertyOptional()
  @Field(() => Float, { nullable: true })
  speed?: number;

  @ApiPropertyOptional()
  @Field(() => Int, { nullable: true })
  currentStopSequence?: number;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  currentStopId?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  currentStatus?: string;

  @ApiPropertyOptional()
  @Field(() => Int, { nullable: true })
  timestamp?: number;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  congestionLevel?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  occupancyStatus?: string;

  // ── TfNSW extension fields ──────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Track direction: UP | DOWN' })
  @Field({ nullable: true, description: 'Track direction: UP | DOWN' })
  trackDirection?: string;

  @ApiPropertyOptional({ description: 'Vehicle label / set number' })
  @Field({ nullable: true, description: 'Vehicle label / set number' })
  vehicleLabel?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  vehicleModel?: string;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  airConditioned?: boolean;

  @ApiPropertyOptional({ description: '0=unknown, 1=accessible, 2=not accessible' })
  @Field(() => Int, { nullable: true, description: '0=unknown, 1=accessible, 2=not accessible' })
  wheelchairAccessible?: number;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  performingPriorTrip?: boolean;

  @ApiPropertyOptional()
  @Field(() => Int, { nullable: true })
  specialVehicleAttributes?: number;

  @ApiPropertyOptional({ type: () => [CarriageDescriptorObject] })
  @Field(() => [CarriageDescriptorObject], {
    nullable: true,
    description: 'Per-carriage composition with occupancy and amenity data',
  })
  consist?: CarriageDescriptorObject[];

  @ApiProperty()
  @Field()
  mode!: string;
}
