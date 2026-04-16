import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiExtraModels,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiTooManyRequestsResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { AdminService } from './admin.service';
import {
  AdminUsersQueryDto,
  UpdateUserDto,
  AdminApiKeysQueryDto,
  UpdateApiKeyDto,
  AdminLogsQueryDto,
  AdminErrorLogsQueryDto,
  AdminStatsUsageQueryDto,
  AdminStatsTopQueryDto,
} from './dto/admin.dto';
import {
  AdminUserSwagger,
  AdminUserDetailSwagger,
  PaginatedUsersSwagger,
  AdminApiKeySwagger,
  AdminApiKeyDetailSwagger,
  PaginatedApiKeysSwagger,
  AdminLogPageSwagger,
  AdminOverviewStatsSwagger,
  UsageBucketSwagger,
  EndpointStatSwagger,
  UserStatSwagger,
  KeyStatSwagger,
  GtfsStatusSwagger,
  GtfsIngestResultSwagger,
  SystemHealthSwagger,
  SystemOverviewSwagger,
} from './dto/admin.swagger-schemas';

@ApiTags('Admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Valid admin session token required in Authorization: Bearer header' })
@ApiForbiddenResponse({ description: 'Authenticated user does not have the admin role' })
@ApiExtraModels(
  AdminUserSwagger,
  AdminUserDetailSwagger,
  PaginatedUsersSwagger,
  AdminApiKeySwagger,
  AdminApiKeyDetailSwagger,
  PaginatedApiKeysSwagger,
  AdminLogPageSwagger,
  AdminOverviewStatsSwagger,
  UsageBucketSwagger,
  EndpointStatSwagger,
  UserStatSwagger,
  KeyStatSwagger,
  GtfsStatusSwagger,
  GtfsIngestResultSwagger,
  SystemHealthSwagger,
  SystemOverviewSwagger,
)
@Public()
@UseGuards(AdminGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) { }

  private buildWebHeaders(req: Request): Headers {
    const webHeaders = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach((v) => webHeaders.append(key, v));
      } else {
        webHeaders.set(key, value);
      }
    }
    return webHeaders;
  }

  // ─── Auth ────────────────────────────────────────────────────────────────

  @Get('auth/me')
  @ApiOperation({
    summary: 'Get current admin user profile',
    description: 'Returns the full profile of the currently authenticated admin user.',
  })
  @ApiOkResponse({ type: AdminUserSwagger, description: 'Authenticated admin user profile' })
  getMe(@Req() req: Request) {
    const user = (req as unknown as Record<string, unknown>)['user'] as
      | { userId: string }
      | undefined;
    return this.adminService.getMe(user?.userId ?? '');
  }

  // ─── Users ───────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({
    summary: 'List all users (paginated)',
    description:
      'Returns a paginated list of all registered users. ' +
      'Supports filtering by `role` (e.g. admin, user) and text search across name and email.',
  })
  @ApiOkResponse({ type: PaginatedUsersSwagger, description: 'Paginated user list' })
  getUsers(@Req() req: Request, @Query() query: AdminUsersQueryDto) {
    return this.adminService.getUsers(query, this.buildWebHeaders(req));
  }

  @Get('users/:id')
  @ApiOperation({
    summary: 'Get a single user with usage stats',
    description: 'Returns full user details including API key count and 7-day request volume.',
  })
  @ApiParam({ name: 'id', description: 'User ID (UUID)' })
  @ApiOkResponse({ type: AdminUserDetailSwagger, description: 'User profile with usage stats' })
  @ApiNotFoundResponse({ description: 'No user found for the given ID' })
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id')
  @ApiOperation({
    summary: 'Update user role or banning settings',
    description:
      'Update the `role` (admin | user) or `banned` status of a user. ' +
      'Supports advanced banning with optional `banReason` and `banExpiresIn` duration.',
  })
  @ApiParam({ name: 'id', description: 'User ID (UUID)' })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ type: AdminUserSwagger, description: 'Updated user record' })
  @ApiNotFoundResponse({ description: 'No user found for the given ID' })
  updateUser(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(id, dto, this.buildWebHeaders(req));
  }

  @Post('users/:id/impersonate')
  @ApiOperation({
    summary: 'Impersonate a user',
    description: 'Allows an admin to start a session as another user for troubleshooting purposes.',
  })
  @ApiParam({ name: 'id', description: 'Target user ID to impersonate' })
  @ApiCreatedResponse({ description: 'New impersonation session created' })
  @ApiNotFoundResponse({ description: 'Target user not found' })
  impersonate(@Param('id') id: string, @Req() req: Request) {
    const adminUser = (req as any).user;
    return this.adminService.impersonateUser(adminUser?.userId ?? 'unknown', id, this.buildWebHeaders(req));
  }

  @Post('users/stop-impersonating')
  @ApiOperation({
    summary: 'Stop current impersonation',
    description: 'Ends the active impersonation session and reverts to the admin context.',
  })
  @ApiOkResponse({ description: 'Impersonation session terminated' })
  stopImpersonating(@Req() req: Request) {
    return this.adminService.stopImpersonating(this.buildWebHeaders(req));
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Delete a user and all associated data',
    description:
      'Permanently deletes the user record and all associated API keys, sessions, and accounts. ' +
      'This action is irreversible. Rate-limited to 5 requests per minute.',
  })
  @ApiParam({ name: 'id', description: 'User ID (UUID)' })
  @ApiNoContentResponse({ description: 'User successfully deleted' })
  @ApiNotFoundResponse({ description: 'No user found for the given ID' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded (5 per minute)' })
  async deleteUser(@Req() req: Request, @Param('id') id: string) {
    await this.adminService.deleteUser(id, this.buildWebHeaders(req));
  }

  // ─── API Keys ─────────────────────────────────────────────────────────────

  @Get('api-keys')
  @ApiOperation({
    summary: 'List all API keys (paginated)',
    description:
      'Returns a paginated list of all API keys across all users. ' +
      'Filter by `userId` to see keys for a specific user, or by `enabled` to list active/inactive keys.',
  })
  @ApiOkResponse({ type: PaginatedApiKeysSwagger, description: 'Paginated API key list' })
  getApiKeys(@Query() query: AdminApiKeysQueryDto) {
    return this.adminService.getApiKeys(query);
  }

  @Get('api-keys/:id')
  @ApiOperation({
    summary: 'Get a single API key with 7-day usage breakdown',
    description: 'Returns full API key details plus a per-day request count for the last 7 days.',
  })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  @ApiOkResponse({ type: AdminApiKeyDetailSwagger, description: 'API key with daily usage history' })
  @ApiNotFoundResponse({ description: 'No API key found for the given ID' })
  getApiKey(@Param('id') id: string) {
    return this.adminService.getApiKey(id);
  }

  @Patch('api-keys/:id')
  @ApiOperation({
    summary: 'Update API key settings',
    description:
      'Modify the `enabled` state, `permissions`, or rate-limit configuration of an API key. ' +
      'Disabling a key (`enabled: false`) immediately blocks its acceptance by the API.',
  })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  @ApiBody({ type: UpdateApiKeyDto })
  @ApiOkResponse({ type: AdminApiKeySwagger, description: 'Updated API key record' })
  @ApiNotFoundResponse({ description: 'No API key found for the given ID' })
  updateApiKey(@Param('id') id: string, @Body() dto: UpdateApiKeyDto) {
    return this.adminService.updateApiKey(id, dto);
  }

  @Delete('api-keys/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Delete an API key (hard delete)' })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'API key not found' })
  async deleteApiKey(@Param('id') id: string) {
    await this.adminService.deleteApiKey(id);
  }

  @Post('api-keys/:id/reset-usage')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Reset request count and remaining quota for an API key',
    description:
      'Clears the `requestCount` and restores `remaining` to the maximum for rate-limited keys. ' +
      'Useful for manually un-throttling a key mid-window.',
  })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  @ApiOkResponse({ type: AdminApiKeySwagger, description: 'API key with reset counters' })
  @ApiNotFoundResponse({ description: 'No API key found for the given ID' })
  resetApiKeyUsage(@Param('id') id: string) {
    return this.adminService.resetApiKeyUsage(id);
  }

  // ─── Logs ─────────────────────────────────────────────────────────────────

  @Get('logs')
  @ApiOperation({
    summary: 'Query request logs (cursor-paginated)',
    description:
      'Returns request log entries ordered by timestamp descending. ' +
      'Supports filtering by user, API key, HTTP method, status code, path, and time range. ' +
      'Use `nextCursor` from the response to retrieve the next page.',
  })
  @ApiOkResponse({ type: AdminLogPageSwagger, description: 'Page of request log entries with next-page cursor' })
  getLogs(@Query() query: AdminLogsQueryDto) {
    return this.adminService.getLogs(query);
  }

  @Get('logs/errors')
  @ApiOperation({
    summary: 'Query error logs (HTTP status ≥ 400, cursor-paginated)',
    description:
      'Convenience view of logs filtered to HTTP 4xx and 5xx responses. ' +
      'Supports time range filtering and cursor-based pagination.',
  })
  @ApiOkResponse({ type: AdminLogPageSwagger, description: 'Page of error log entries' })
  getErrorLogs(@Query() query: AdminErrorLogsQueryDto) {
    return this.adminService.getErrorLogs(query);
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  @Get('stats/overview')
  @ApiOperation({
    summary: 'High-level usage overview',
    description:
      'Returns a quick summary suitable for a dashboard header: ' +
      'total requests in the last 24 hours, 7-day active user count, error rate, and the most-requested path.',
  })
  @ApiOkResponse({ type: AdminOverviewStatsSwagger, description: 'Overview metrics for the management dashboard' })
  getOverviewStats() {
    return this.adminService.getOverviewStats();
  }

  @Get('stats/usage')
  @ApiOperation({ summary: 'Time-series usage stats grouped by hour or day' })
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { $ref: getSchemaPath(UsageBucketSwagger) },
    },
  })
  getUsageStats(@Query() query: AdminStatsUsageQueryDto) {
    return this.adminService.getUsageStats(query);
  }

  @Get('stats/endpoints')
  @ApiOperation({ summary: 'Top endpoints by request count' })
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { $ref: getSchemaPath(EndpointStatSwagger) },
    },
  })
  getEndpointStats(@Query() query: AdminStatsTopQueryDto) {
    return this.adminService.getEndpointStats(query);
  }

  @Get('stats/users')
  @ApiOperation({ summary: 'Top users by request count' })
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { $ref: getSchemaPath(UserStatSwagger) },
    },
  })
  getUserStats(@Query() query: AdminStatsTopQueryDto) {
    return this.adminService.getUserStats(query);
  }

  @Get('stats/keys')
  @ApiOperation({ summary: 'Top API keys by request count' })
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { $ref: getSchemaPath(KeyStatSwagger) },
    },
  })
  getKeyStats(@Query() query: AdminStatsTopQueryDto) {
    return this.adminService.getKeyStats(query);
  }

  // ─── GTFS ─────────────────────────────────────────────────────────────────

  @Get('gtfs/status')
  @ApiOperation({
    summary: 'GTFS static data status',
    description: 'Returns per-table row counts and the timestamp of the last successful GTFS ingest.',
  })
  @ApiOkResponse({ type: GtfsStatusSwagger, description: 'GTFS table row counts and last ingest time' })
  getGtfsStatus() {
    return this.adminService.getGtfsStatus();
  }

  @Post('gtfs/ingest')
  @Throttle({ default: { limit: 1, ttl: 300_000 } })
  @ApiOperation({
    summary: 'Trigger a full GTFS static data ingest (admin)',
    description:
      'Downloads GTFS data from NSW Open Data and reloads all static tables. ' +
      'This runs automatically overnight; use this to trigger a manual refresh. ' +
      'Rate-limited to 1 request per 5 minutes.',
  })
  @ApiCreatedResponse({ type: GtfsIngestResultSwagger, description: 'Ingest summary with modes ingested' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded (1 per 5 minutes)' })
  triggerGtfsIngest() {
    return this.adminService.triggerGtfsIngest();
  }

  @Delete('gtfs/cache')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Flush all Redis cache entries',
    description:
      'Removes all keys from the Redis cache. ' +
      'Use this after a manual GTFS ingest or to force a fresh pull from upstream APIs. ' +
      'Clients will experience slightly higher latency on the next request while caches are warmed.',
  })
  @ApiNoContentResponse({ description: 'Cache flushed successfully' })
  async flushCache() {
    await this.adminService.flushCache();
  }

  // ─── Health ───────────────────────────────────────────────────────────────

  @Get('health')
  @ApiOperation({
    summary: 'System health check',
    description:
      'Runs live connectivity checks against the database, Redis, and TfNSW Open Data API. ' +
      'Reports each component as `ok` or `error` with latency in milliseconds, ' +
      'plus Node.js process memory and uptime.',
  })
  @ApiOkResponse({ type: SystemHealthSwagger, description: 'Health status of all system dependencies' })
  getHealth() {
    return this.adminService.getHealth();
  }

  @Get('system/overview')
  @ApiOperation({
    summary: 'Combined system overview',
    description:
      'Single-request convenience endpoint that returns the current system health plus the 24-hour stats overview. ' +
      'Ideal for populating a management dashboard home page.',
  })
  @ApiOkResponse({ type: SystemOverviewSwagger, description: 'Combined health status and usage stats' })
  getSystemOverview() {
    return this.adminService.getSystemOverview();
  }
}

