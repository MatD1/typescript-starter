import {
  ArgsType,
  Field,
  ID,
  InputType,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ArgsType()
export class AuditEventsArgs {
  @Field({ nullable: true })
  cursor?: string;

  @Field(() => Int, { nullable: true, defaultValue: 50 })
  limit?: number;

  @Field({ nullable: true })
  from?: string;

  @Field({ nullable: true })
  to?: string;

  @Field(() => ID, { nullable: true })
  eventId?: string;

  @Field({ nullable: true })
  category?: string;

  @Field({ nullable: true })
  action?: string;

  @Field({ nullable: true })
  actorType?: string;

  @Field(() => ID, { nullable: true })
  actorId?: string;

  @Field({ nullable: true })
  targetType?: string;

  @Field(() => ID, { nullable: true })
  targetId?: string;

  @Field({ nullable: true })
  outcome?: string;

  @Field({ nullable: true })
  severity?: string;

  @Field({ nullable: true })
  requestId?: string;

  @Field({ nullable: true })
  correlationId?: string;

  @Field({ nullable: true })
  source?: string;
}

@ObjectType()
export class AuditEventObject {
  @Field()
  sequence!: string;

  @Field(() => ID)
  id!: string;

  @Field()
  occurredAt!: Date;

  @Field()
  recordedAt!: Date;

  @Field()
  category!: string;

  @Field()
  action!: string;

  @Field()
  severity!: string;

  @Field()
  outcome!: string;

  @Field()
  actorType!: string;

  @Field(() => ID, { nullable: true })
  actorId?: string;

  @Field({ nullable: true })
  actorRole?: string;

  @Field({ nullable: true })
  targetType?: string;

  @Field(() => ID, { nullable: true })
  targetId?: string;

  @Field({ nullable: true })
  reason?: string;

  @Field({ nullable: true })
  beforeJson?: string;

  @Field({ nullable: true })
  afterJson?: string;

  @Field({ nullable: true })
  changedFieldsJson?: string;

  @Field({ nullable: true })
  metadataJson?: string;

  @Field({ nullable: true })
  errorJson?: string;

  @Field({ nullable: true })
  requestId?: string;

  @Field({ nullable: true })
  correlationId?: string;

  @Field()
  source!: string;

  @Field({ nullable: true })
  method?: string;

  @Field({ nullable: true })
  route?: string;
}

@ObjectType()
export class AuditEventPageObject {
  @Field(() => [AuditEventObject])
  data!: AuditEventObject[];

  @Field({ nullable: true })
  nextCursor?: string;
}

@ObjectType()
export class AuditSummaryObject {
  @Field()
  category!: string;

  @Field()
  action!: string;

  @Field()
  outcome!: string;

  @Field()
  severity!: string;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class AuditArchiveObject {
  @Field(() => ID)
  id!: string;

  @Field()
  windowStart!: Date;

  @Field()
  windowEnd!: Date;

  @Field(() => Int)
  rowCount!: number;

  @Field()
  status!: string;

  @Field({ nullable: true })
  checksumSha256?: string;

  @Field({ nullable: true })
  retentionUntil?: Date;

  @Field({ nullable: true })
  verifiedAt?: Date;
}

@ObjectType()
export class AuditArchiveVerificationObject {
  @Field(() => ID)
  id!: string;

  @Field()
  valid!: boolean;

  @Field()
  dataLocked!: boolean;

  @Field()
  manifestLocked!: boolean;

  @Field({ nullable: true })
  verifiedAt?: Date;
}

@ObjectType()
export class AuditExportObject {
  @Field(() => ID)
  id!: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  format?: string;

  @Field(() => Int, { nullable: true })
  rowCount?: number;

  @Field({ nullable: true })
  checksumSha256?: string;

  @Field({ nullable: true })
  downloadUrl?: string;

  @Field({ nullable: true })
  expiresAt?: Date;

  @Field({ nullable: true })
  error?: string;
}
