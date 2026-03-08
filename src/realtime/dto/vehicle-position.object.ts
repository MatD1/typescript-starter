import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class VehiclePositionObject {
  @Field()
  vehicleId!: string;

  @Field({ nullable: true })
  tripId?: string;

  @Field({ nullable: true })
  routeId?: string;

  @Field(() => Float)
  latitude!: number;

  @Field(() => Float)
  longitude!: number;

  @Field(() => Float, { nullable: true })
  bearing?: number;

  @Field(() => Float, { nullable: true })
  speed?: number;

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

  @Field()
  mode!: string;
}
