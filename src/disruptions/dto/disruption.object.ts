import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ActivePeriodObject {
  @Field(() => Int, { nullable: true })
  start?: number;

  @Field(() => Int, { nullable: true })
  end?: number;
}

@ObjectType()
export class InformedEntityObject {
  @Field({ nullable: true })
  agencyId?: string;

  @Field({ nullable: true })
  routeId?: string;

  @Field({ nullable: true })
  stopId?: string;

  @Field({ nullable: true })
  tripId?: string;
}

@ObjectType()
export class DisruptionObject {
  @Field()
  id!: string;

  @Field({ nullable: true })
  headerText?: string;

  @Field({ nullable: true })
  descriptionText?: string;

  @Field({ nullable: true })
  url?: string;

  @Field({ nullable: true })
  cause?: string;

  @Field({ nullable: true })
  effect?: string;

  @Field({ nullable: true })
  severity?: string;

  @Field(() => [ActivePeriodObject])
  activePeriods!: ActivePeriodObject[];

  @Field(() => [InformedEntityObject])
  informedEntities!: InformedEntityObject[];

  @Field()
  mode!: string;
}
