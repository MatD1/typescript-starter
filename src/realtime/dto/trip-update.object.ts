import { Field, Int, ObjectType } from '@nestjs/graphql';
import { CarriageDescriptorObject } from './carriage.object';

@ObjectType()
export class StopTimeUpdateObject {
  @Field(() => Int, { nullable: true })
  stopSequence?: number;

  @Field({ nullable: true })
  stopId?: string;

  @Field(() => Int, { nullable: true })
  arrivalDelay?: number;

  @Field(() => Int, { nullable: true })
  arrivalTime?: number;

  @Field(() => Int, { nullable: true })
  departureDelay?: number;

  @Field(() => Int, { nullable: true })
  departureTime?: number;

  @Field({ nullable: true })
  scheduleRelationship?: string;

  @Field({ nullable: true, description: 'Occupancy status at this stop departure' })
  departureOccupancyStatus?: string;

  @Field(() => [CarriageDescriptorObject], {
    nullable: true,
    description: 'Predictive per-carriage occupancy at this stop (TfNSW extension 1007)',
  })
  carriagePredictiveOccupancy?: CarriageDescriptorObject[];
}

@ObjectType()
export class TripUpdateObject {
  @Field()
  tripId!: string;

  @Field({ nullable: true })
  routeId?: string;

  @Field({
    nullable: true,
    description: 'Line code from GTFS (e.g. T1, CCN)',
  })
  lineCode?: string;

  @Field({
    nullable: true,
    description: 'Route colour hex from GTFS (e.g. 009B77)',
  })
  routeColour?: string;

  @Field({ nullable: true })
  vehicleId?: string;

  @Field({ nullable: true, description: 'Vehicle label / set number' })
  vehicleLabel?: string;

  @Field(() => Int, { nullable: true })
  directionId?: number;

  @Field({ nullable: true })
  startDate?: string;

  @Field({ nullable: true })
  startTime?: string;

  @Field({ nullable: true })
  scheduleRelationship?: string;

  @Field(() => Int, { nullable: true, description: 'Overall trip delay in seconds' })
  delay?: number;

  @Field(() => [StopTimeUpdateObject])
  stopTimeUpdates!: StopTimeUpdateObject[];

  @Field(() => Int, { nullable: true })
  timestamp?: number;

  @Field()
  mode!: string;
}
