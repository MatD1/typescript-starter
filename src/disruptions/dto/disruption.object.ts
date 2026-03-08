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

  @Field(() => Int, { nullable: true, description: 'GTFS route_type (0=tram, 1=metro, 2=rail, 3=bus, 4=ferry)' })
  routeType?: number;

  @Field({ nullable: true })
  stopId?: string;

  @Field({ nullable: true })
  tripId?: string;

  @Field(() => Int, { nullable: true })
  directionId?: number;
}

@ObjectType()
export class DisruptionObject {
  @Field()
  id!: string;

  @Field({ nullable: true })
  headerText?: string;

  @Field({ nullable: true })
  descriptionText?: string;

  @Field({ nullable: true, description: 'TTS (text-to-speech) version of the header' })
  ttsHeaderText?: string;

  @Field({ nullable: true, description: 'TTS (text-to-speech) version of the description' })
  ttsDescriptionText?: string;

  @Field({ nullable: true })
  url?: string;

  @Field({ nullable: true })
  cause?: string;

  @Field({ nullable: true })
  effect?: string;

  @Field({ nullable: true, description: 'Severity level: UNKNOWN_SEVERITY | INFO | WARNING | SEVERE' })
  severityLevel?: string;

  @Field(() => [ActivePeriodObject])
  activePeriods!: ActivePeriodObject[];

  @Field(() => [InformedEntityObject])
  informedEntities!: InformedEntityObject[];

  @Field()
  mode!: string;
}
