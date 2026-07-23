import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminUsersQueryDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Search by name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by role (e.g. admin, user)' })
  @IsOptional()
  @IsString()
  role?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'User role (e.g. admin, user)' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'Whether the user is banned' })
  @IsOptional()
  @IsBoolean()
  banned?: boolean;

  @ApiPropertyOptional({ description: 'Reason for banning the user' })
  @IsOptional()
  @IsString()
  banReason?: string;

  @ApiPropertyOptional({ description: 'Ban duration in seconds' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  banExpiresIn?: number;
}

export class AdminApiKeysQueryDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by enabled status' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  enabled?: boolean;
}

export class AdminCreateApiKeyDto {
  @ApiPropertyOptional({ description: 'A descriptive name for the API key' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Optional expiration date in ISO 8601 format.' })
  @IsString()
  @IsOptional()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Permission level for the key.', enum: ['user', 'admin', 'app-authorised'] })
  @IsString()
  @IsOptional()
  @IsIn(['user', 'admin', 'app-authorised'])
  permissionLevel?: string;
}

export class UpdateApiKeyDto {
  @ApiPropertyOptional({ description: 'Whether the API key is enabled' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Comma-separated permission scopes' })
  @IsOptional()
  @IsString()
  permissions?: string;

  @ApiPropertyOptional({ description: 'Is rate limiting enabled' })
  @IsOptional()
  @IsBoolean()
  rateLimitEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Max requests per minute/window (0 = unlimited)', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rateLimitMax?: number;

  @ApiPropertyOptional({ description: 'Rate limit time window in milliseconds', minimum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  rateLimitTimeWindow?: number;
}

export class AdminLogsQueryDto {
  @ApiPropertyOptional({ description: 'Cursor for pagination' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by API key ID' })
  @IsOptional()
  @IsString()
  keyId?: string;

  @ApiPropertyOptional({ description: 'Filter by HTTP method (GET, POST, etc.)' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ description: 'Filter by HTTP status code' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  statusCode?: number;

  @ApiPropertyOptional({ description: 'Filter by request path' })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional({ description: 'Start of time range (ISO 8601)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'End of time range (ISO 8601)' })
  @IsOptional()
  @IsString()
  to?: string;
}

export class AdminErrorLogsQueryDto {
  @ApiPropertyOptional({ description: 'Cursor for pagination' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Start of time range (ISO 8601)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'End of time range (ISO 8601)' })
  @IsOptional()
  @IsString()
  to?: string;
}

export class AdminStatsUsageQueryDto {
  @ApiProperty({ description: 'Start of time range (ISO 8601)' })
  @IsString()
  from!: string;

  @ApiProperty({ description: 'End of time range (ISO 8601)' })
  @IsString()
  to!: string;

  @ApiProperty({ description: 'Grouping granularity', enum: ['hour', 'day'] })
  @IsIn(['hour', 'day'])
  granularity!: 'hour' | 'day';
}

export class AdminStatsTopQueryDto {
  @ApiPropertyOptional({ description: 'Max items to return', minimum: 1, maximum: 100, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Start of time range (ISO 8601)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'End of time range (ISO 8601)' })
  @IsOptional()
  @IsString()
  to?: string;
}

export class AdminTestNotificationDto {
  @ApiPropertyOptional({ description: 'Notification title', default: 'Test notification' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Notification body', default: 'This is a test push from the admin portal.' })
  @IsOptional()
  @IsString()
  body?: string;
}

export class AdminServiceAlertDto {
  @ApiProperty({ description: 'Rider-facing line code the alert applies to (e.g. T1, CCN, M1)' })
  @IsString()
  @IsNotEmpty()
  line!: string;

  @ApiProperty({ description: 'Notification title / alert headline' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'Notification body / alert detail' })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiPropertyOptional({ description: 'Alert severity', enum: ['delays', 'cancellations', 'disruption'], default: 'disruption' })
  @IsOptional()
  @IsIn(['delays', 'cancellations', 'disruption'])
  severity?: 'delays' | 'cancellations' | 'disruption';
}
