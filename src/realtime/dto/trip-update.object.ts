import { Field, Int, ObjectType } from '@nestjs/graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CarriageDescriptorObject } from './carriage.object';

@ObjectType()
export class StopTimeUpdateObject {
  @ApiPropertyOptional()
  @Field(() => Int, { nullable: true })
  stopSequence?: number;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  stopId?: string;

  @ApiPropertyOptional()
  @Field(() => Int, { nullable: true })
  arrivalDelay?: number;

  @ApiPropertyOptional({ description: 'Prediction confidence in seconds for the arrival estimate — smaller means more confident' })
  @Field(() => Int, { nullable: true })
  arrivalUncertainty?: number;

  @ApiPropertyOptional()
  @Field(() => Int, { nullable: true })
  arrivalTime?: number;

  @ApiPropertyOptional()
  @Field(() => Int, { nullable: true })
  departureDelay?: number;

  @ApiPropertyOptional({ description: 'Prediction confidence in seconds for the departure estimate' })
  @Field(() => Int, { nullable: true })
  departureUncertainty?: number;

  @ApiPropertyOptional()
  @Field(() => Int, { nullable: true })
  departureTime?: number;

  @ApiPropertyOptional()
  @Field({ nullable: true })
  scheduleRelationship?: string;

  @ApiPropertyOptional({ description: 'Occupancy status at this stop departure' })
  @Field({ nullable: true, description: 'Occupancy status at this stop departure' })
  departureOccupancyStatus?: string;

  @ApiPropertyOptional({ type: () => [CarriageDescriptorObject] })
  @Field(() => [CarriageDescriptorObject], {
    nullable: true,
    description: 'Predictive per-carriage occupancy at this stop (TfNSW extension 1007)',
  })
  carriagePredictiveOccupancy?: CarriageDescriptorObject[];
}

@ObjectType()
export class TripUpdateObject {
  @ApiProperty()
  @Field()
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

  @ApiPropertyOptional({ description: 'Vehicle label / set number' })
  @Field({ nullable: true, description: 'Vehicle label / set number' })
  vehicleLabel?: string;

  @ApiPropertyOptional({ description: 'Plate of the physical vehicle (buses mainly; rarely populated for rail)' })
  @Field({ nullable: true, description: 'Plate of the physical vehicle (buses mainly; rarely populated for rail)' })
  licensePlate?: string;

  @ApiPropertyOptional({ description: 'TfNSW vehicle-amenity extension, when populated on the trip-updates feed' })
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

  @ApiPropertyOptional({ description: 'Bitmask of TfNSW special vehicle attributes' })
  @Field(() => Int, { nullable: true })
  specialVehicleAttributes?: number;

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
  scheduleRelationship?: string;

  @ApiPropertyOptional({ description: 'Overall trip delay in seconds' })
  @Field(() => Int, { nullable: true, description: 'Overall trip delay in seconds' })
  delay?: number;

  @ApiProperty({ type: () => [StopTimeUpdateObject] })
  @Field(() => [StopTimeUpdateObject])
  stopTimeUpdates!: StopTimeUpdateObject[];

  @ApiPropertyOptional()
  @Field(() => Int, { nullable: true })
  timestamp?: number;

  @ApiProperty()
  @Field()
  mode!: string;
}
