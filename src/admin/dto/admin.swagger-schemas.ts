import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── User Schemas ─────────────────────────────────────────────────────────────

export class AdminUserSwagger {
  @ApiProperty({ description: 'User ID' })
  id!: string;

  @ApiProperty({ description: 'Display name' })
  name!: string;

  @ApiProperty({ description: 'Email address' })
  email!: string;

  @ApiProperty({ description: 'User role (e.g. admin, user)' })
  role!: string;

  @ApiProperty({ description: 'Whether the user is banned' })
  banned!: boolean;

  @ApiProperty({ description: 'Account creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: Date;
}

export class AdminUserDetailSwagger extends AdminUserSwagger {
  @ApiProperty({ description: 'Number of API keys owned' })
  apiKeyCount!: number;

  @ApiProperty({ description: 'Request count in last 7 days' })
  requestCount7d!: number;
}

export class PaginatedUsersSwagger {
  @ApiProperty({ type: [AdminUserSwagger], description: 'List of users' })
  data!: AdminUserSwagger[];

  @ApiProperty({ description: 'Total number of users' })
  total!: number;

  @ApiProperty({ description: 'Current page' })
  page!: number;

  @ApiProperty({ description: 'Items per page' })
  limit!: number;
}

// ─── API Key Schemas ───────────────────────────────────────────────────────────

export class DailyUsageBucketSwagger {
  @ApiProperty({ description: 'Date (YYYY-MM-DD)' })
  date!: string;

  @ApiProperty({ description: 'Request count for that day' })
  count!: number;
}

export class AdminApiKeySwagger {
  @ApiProperty({ description: 'API key ID' })
  id!: string;

  @ApiPropertyOptional({ description: 'Key name' })
  name?: string;

  @ApiPropertyOptional({ description: 'Key prefix (first 8 chars)' })
  start?: string;

  @ApiProperty({ description: 'Owner user ID' })
  userId!: string;

  @ApiProperty({ description: 'Whether the key is enabled' })
  enabled!: boolean;

  @ApiPropertyOptional({ description: 'Max requests per minute (0 = unlimited)' })
  rateLimitMax?: number;

  @ApiProperty({ description: 'Total request count' })
  requestCount!: number;

  @ApiPropertyOptional({ description: 'Remaining requests (if rate limited)' })
  remaining?: number;

  @ApiPropertyOptional({ description: 'Expiration timestamp' })
  expiresAt?: Date;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: Date;

  @ApiPropertyOptional({ description: 'Permission scopes' })
  permissions?: string;
}

export class AdminApiKeyDetailSwagger extends AdminApiKeySwagger {
  @ApiProperty({ type: [DailyUsageBucketSwagger], description: 'Daily usage for last 7 days' })
  usage7d!: DailyUsageBucketSwagger[];
}

export class PaginatedApiKeysSwagger {
  @ApiProperty({ type: [AdminApiKeySwagger], description: 'List of API keys' })
  data!: AdminApiKeySwagger[];

  @ApiProperty({ description: 'Total number of keys' })
  total!: number;

  @ApiProperty({ description: 'Current page' })
  page!: number;

  @ApiProperty({ description: 'Items per page' })
  limit!: number;
}

// ─── Log Schemas ──────────────────────────────────────────────────────────────

export class AdminLogEntrySwagger {
  @ApiProperty({ description: 'Log entry ID' })
  id!: string;

  @ApiProperty({ description: 'HTTP method' })
  method!: string;

  @ApiProperty({ description: 'Request path' })
  path!: string;

  @ApiProperty({ description: 'HTTP status code' })
  statusCode!: number;

  @ApiPropertyOptional({ description: 'User ID (if authenticated)' })
  userId?: string;

  @ApiPropertyOptional({ description: 'API key ID (if used)' })
  keyId?: string;

  @ApiProperty({ description: 'Response time in milliseconds' })
  responseTimeMs!: number;

  @ApiPropertyOptional({ description: 'Client IP address' })
  ipAddress?: string;

  @ApiPropertyOptional({ description: 'User-Agent header' })
  userAgent?: string;

  @ApiPropertyOptional({ description: 'Error message (if status >= 400)' })
  error?: string;

  @ApiProperty({ description: 'Request timestamp' })
  createdAt!: Date;
}

export class AdminLogPageSwagger {
  @ApiProperty({ type: [AdminLogEntrySwagger], description: 'List of log entries' })
  data!: AdminLogEntrySwagger[];

  @ApiPropertyOptional({ description: 'Cursor for next page' })
  nextCursor?: string;

  @ApiProperty({ description: 'Total number of matching entries' })
  total!: number;
}

// ─── Stats Schemas ────────────────────────────────────────────────────────────

export class AdminOverviewStatsSwagger {
  @ApiProperty({ description: 'Total requests in last 24 hours' })
  totalRequests24h!: number;

  @ApiProperty({ description: 'Active users in last 7 days' })
  activeUsers7d!: number;

  @ApiProperty({ description: 'Error rate (0-1) in last 24 hours' })
  errorRate24h!: number;

  @ApiProperty({ description: 'Most-requested API path in last 24h' })
  topPath!: string;
}

export class UsageBucketSwagger {
  @ApiProperty({ description: 'Bucket timestamp (ISO 8601)' })
  timestamp!: string;

  @ApiProperty({ description: 'Request count' })
  count!: number;

  @ApiProperty({ description: 'Error count' })
  errors!: number;
}

export class EndpointStatSwagger {
  @ApiProperty({ description: 'API path' })
  path!: string;

  @ApiProperty({ description: 'Request count' })
  count!: number;
}

export class UserStatSwagger {
  @ApiProperty({ description: 'User ID' })
  userId!: string;

  @ApiProperty({ description: 'User display name' })
  userName!: string;

  @ApiProperty({ description: 'Request count' })
  count!: number;
}

export class KeyStatSwagger {
  @ApiProperty({ description: 'API key ID' })
  keyId!: string;

  @ApiPropertyOptional({ description: 'Key name' })
  keyName?: string;

  @ApiProperty({ description: 'Request count' })
  count!: number;
}

// ─── GTFS Schemas ─────────────────────────────────────────────────────────────

export class GtfsTableCountSwagger {
  @ApiProperty({ description: 'Table name' })
  table!: string;

  @ApiProperty({ description: 'Row count' })
  count!: number;
}

export class GtfsStatusSwagger {
  @ApiPropertyOptional({ description: 'Last ingest timestamp (ISO 8601)' })
  lastIngest?: string;

  @ApiProperty({ type: [GtfsTableCountSwagger], description: 'Row counts per table' })
  tableCounts!: GtfsTableCountSwagger[];
}

export class GtfsIngestResultSwagger {
  @ApiProperty({ description: 'Whether ingest succeeded' })
  success!: boolean;

  @ApiProperty({ type: [String], description: 'Modes that were ingested' })
  modesIngested!: string[];
}

// ─── Health Schemas ───────────────────────────────────────────────────────────

export class SystemHealthCheckSwagger {
  @ApiProperty({ description: 'Check name (e.g. database, redis, nsw-api)' })
  name!: string;

  @ApiProperty({ description: 'Status (ok, error)' })
  status!: string;

  @ApiProperty({ description: 'Latency in milliseconds' })
  latencyMs!: number;
}

export class SystemHealthSwagger {
  @ApiProperty({ description: 'Overall health status' })
  healthy!: boolean;

  @ApiProperty({ type: [SystemHealthCheckSwagger], description: 'Individual check results' })
  checks!: SystemHealthCheckSwagger[];
}
