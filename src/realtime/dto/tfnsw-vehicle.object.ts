import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'TfNSW-specific vehicle metadata (extension 1007)' })
export class TfnswVehicleObject {
  @Field({ nullable: true, description: 'Whether the vehicle is air-conditioned' })
  airConditioned?: boolean;

  @Field(() => Int, { nullable: true, description: '0 = unknown, 1 = accessible, 2 = not accessible' })
  wheelchairAccessible?: number;

  @Field({ nullable: true })
  vehicleModel?: string;

  @Field({ nullable: true, description: 'Whether the vehicle is completing a prior trip run-in' })
  performingPriorTrip?: boolean;

  @Field(() => Int, { nullable: true })
  specialVehicleAttributes?: number;
}
