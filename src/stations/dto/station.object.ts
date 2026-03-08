import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class StationObject {
  @Field()
  stopId!: string;

  @Field()
  stopName!: string;

  @Field({ nullable: true })
  stopCode?: string;

  @Field(() => Float, { nullable: true })
  lat?: number;

  @Field(() => Float, { nullable: true })
  lon?: number;

  @Field(() => Int, { nullable: true })
  locationType?: number;

  @Field({ nullable: true })
  parentStation?: string;

  @Field(() => Int, { nullable: true })
  wheelchairBoarding?: number;

  @Field({ nullable: true })
  platformCode?: string;

  @Field({ nullable: true })
  mode?: string;
}
