import { ObjectType, Field, ID, Int, InputType, registerEnumType, Float } from '@nestjs/graphql';
import { IsOptional, IsBoolean, IsString, IsNumber } from 'class-validator';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum UsageGranularity {
  HOUR = 'hour',
  DAY = 'day',
}
registerEnumType(UsageGranularity, { name: 'UsageGranularity' });

// ─── User Types ───────────────────────────────────────────────────────────────

@ObjectType()
export class AdminUser {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  email!: string;

  @Field()
  role!: string;

  @Field()
  banned!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class AdminUserDetail extends AdminUser {
  @Field(() => Int)
  apiKeyCount!: number;

  @Field(() => Int)
  requestCount7d!: number;
}

@ObjectType()
export class PaginatedUsers {
  @Field(() => [AdminUser])
  data!: AdminUser[];

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  page!: number;

  @Field(() => Int)
  limit!: number;
}

// ─── API Key Types ────────────────────────────────────────────────────────────

@ObjectType()
export class DailyUsageBucket {
  @Field()
  date!: string;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class AdminApiKey {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  start?: string;

  @Field()
  userId!: string;

  @Field()
  enabled!: boolean;

  @Field({ nullable: true })
  rateLimitMax?: number;

  @Field(() => Int)
  requestCount!: number;

  @Field(() => Int, { nullable: true })
  remaining?: number;

  @Field({ nullable: true })
  expiresAt?: Date;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field({ nullable: true })
  permissions?: string;
}

@ObjectType()
export class AdminApiKeyDetail extends AdminApiKey {
  @Field(() => [DailyUsageBucket])
  usage7d!: DailyUsageBucket[];
}

@ObjectType()
export class PaginatedApiKeys {
  @Field(() => [AdminApiKey])
  data!: AdminApiKey[];

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  page!: number;

  @Field(() => Int)
  limit!: number;
}

// ─── Log Types ────────────────────────────────────────────────────────────────

@ObjectType()
export class AdminLogEntry {
  @Field(() => ID)
  id!: string;

  @Field()
  method!: string;

  @Field()
  path!: string;

  @Field(() => Int)
  statusCode!: number;

  @Field({ nullable: true })
  userId?: string;

  @Field({ nullable: true })
  keyId?: string;

  @Field(() => Int)
  responseTimeMs!: number;

  @Field({ nullable: true })
  ipAddress?: string;

  @Field({ nullable: true })
  userAgent?: string;

  @Field({ nullable: true })
  error?: string;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class AdminLogPage {
  @Field(() => [AdminLogEntry])
  data!: AdminLogEntry[];

  @Field({ nullable: true })
  nextCursor?: string;

  @Field(() => Int)
  total!: number;
}

// ─── Stats Types ──────────────────────────────────────────────────────────────

@ObjectType()
export class AdminOverviewStats {
  @Field(() => Int)
  totalRequests24h!: number;

  @Field(() => Int)
  activeUsers7d!: number;

  @Field(() => Float)
  errorRate24h!: number;

  @Field({ description: 'Most-requested API path in last 24h' })
  topPath!: string;
}

@ObjectType()
export class UsageBucket {
  @Field()
  timestamp!: string;

  @Field(() => Int)
  count!: number;

  @Field(() => Int)
  errors!: number;
}

@ObjectType()
export class EndpointStat {
  @Field()
  path!: string;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class UserStat {
  @Field()
  userId!: string;

  @Field()
  userName!: string;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class KeyStat {
  @Field()
  keyId!: string;

  @Field({ nullable: true })
  keyName?: string;

  @Field(() => Int)
  count!: number;
}

// ─── GTFS Types ───────────────────────────────────────────────────────────────

@ObjectType()
export class GtfsTableCount {
  @Field()
  table!: string;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class GtfsStatus {
  @Field({ nullable: true })
  lastIngest?: string;

  @Field(() => [GtfsTableCount])
  tableCounts!: GtfsTableCount[];
}

@ObjectType()
export class GtfsIngestResult {
  @Field()
  success!: boolean;

  @Field(() => [String])
  modesIngested!: string[];
}

// ─── Health Types ─────────────────────────────────────────────────────────────

@ObjectType()
export class SystemHealthCheck {
  @Field()
  name!: string;

  @Field()
  status!: string;

  @Field(() => Int)
  latencyMs!: number;
}

@ObjectType()
export class SystemHealth {
  @Field()
  healthy!: boolean;

  @Field(() => [SystemHealthCheck])
  checks!: SystemHealthCheck[];
}

// ─── Input Types ──────────────────────────────────────────────────────────────

@InputType()
export class UpdateUserInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  role?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  banned?: boolean;
}

@InputType()
export class UpdateApiKeyInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsNumber()
  rateLimitMax?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  permissions?: string;
}
