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
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
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
} from './dto/admin.swagger-schemas';

@ApiTags('Admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Admin session token required' })
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
)
@Public()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Auth ────────────────────────────────────────────────────────────────

  @Get('auth/me')
  @ApiOperation({ summary: 'Get current admin user profile' })
  @ApiOkResponse({ type: AdminUserSwagger })
  getMe(@Req() req: Request) {
    const adminUser = (req as unknown as Record<string, unknown>)['adminUser'] as
      | { userId: string }
      | undefined;
    return this.adminService.getMe(adminUser?.userId ?? '');
  }

  // ─── Users ───────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List all users (paginated)' })
  @ApiOkResponse({ type: PaginatedUsersSwagger })
  getUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.getUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get a single user with stats' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiOkResponse({ type: AdminUserDetailSwagger })
  @ApiNotFoundResponse({ description: 'User not found' })
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update user role or banned status' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ type: AdminUserSwagger })
  @ApiNotFoundResponse({ description: 'User not found' })
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Delete a user and all associated data' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'User not found' })
  async deleteUser(@Param('id') id: string) {
    await this.adminService.deleteUser(id);
  }

  // ─── API Keys ─────────────────────────────────────────────────────────────

  @Get('api-keys')
  @ApiOperation({ summary: 'List all API keys (paginated)' })
  @ApiOkResponse({ type: PaginatedApiKeysSwagger })
  getApiKeys(@Query() query: AdminApiKeysQueryDto) {
    return this.adminService.getApiKeys(query);
  }

  @Get('api-keys/:id')
  @ApiOperation({ summary: 'Get a single API key with 7-day usage' })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  @ApiOkResponse({ type: AdminApiKeyDetailSwagger })
  @ApiNotFoundResponse({ description: 'API key not found' })
  getApiKey(@Param('id') id: string) {
    return this.adminService.getApiKey(id);
  }

  @Patch('api-keys/:id')
  @ApiOperation({ summary: 'Update API key settings' })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  @ApiBody({ type: UpdateApiKeyDto })
  @ApiOkResponse({ type: AdminApiKeySwagger })
  @ApiNotFoundResponse({ description: 'API key not found' })
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
  @ApiOperation({ summary: 'Reset request count and remaining for an API key' })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  @ApiOkResponse({ type: AdminApiKeySwagger })
  @ApiNotFoundResponse({ description: 'API key not found' })
  resetApiKeyUsage(@Param('id') id: string) {
    return this.adminService.resetApiKeyUsage(id);
  }

  // ─── Logs ─────────────────────────────────────────────────────────────────

  @Get('logs')
  @ApiOperation({ summary: 'Query request logs (cursor paginated)' })
  @ApiOkResponse({ type: AdminLogPageSwagger })
  getLogs(@Query() query: AdminLogsQueryDto) {
    return this.adminService.getLogs(query);
  }

  @Get('logs/errors')
  @ApiOperation({ summary: 'Query error logs (status >= 400, cursor paginated)' })
  @ApiOkResponse({ type: AdminLogPageSwagger })
  getErrorLogs(@Query() query: AdminErrorLogsQueryDto) {
    return this.adminService.getErrorLogs(query);
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  @Get('stats/overview')
  @ApiOperation({ summary: 'Overview stats: 24h requests, error rate, active users 7d' })
  @ApiOkResponse({ type: AdminOverviewStatsSwagger })
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
  @ApiOperation({ summary: 'GTFS static data status: table counts and last ingest time' })
  @ApiOkResponse({ type: GtfsStatusSwagger })
  getGtfsStatus() {
    return this.adminService.getGtfsStatus();
  }

  @Post('gtfs/ingest')
  @Throttle({ default: { limit: 1, ttl: 300_000 } })
  @ApiOperation({ summary: 'Trigger a full GTFS static data ingest' })
  @ApiOkResponse({ type: GtfsIngestResultSwagger })
  triggerGtfsIngest() {
    return this.adminService.triggerGtfsIngest();
  }

  @Delete('gtfs/cache')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Flush all Redis cache entries' })
  @ApiNoContentResponse()
  async flushCache() {
    await this.adminService.flushCache();
  }

  // ─── Health ───────────────────────────────────────────────────────────────

  @Get('health')
  @ApiOperation({ summary: 'System health check (DB, Redis, TfNSW API)' })
  @ApiOkResponse({ type: SystemHealthSwagger })
  getHealth() {
    return this.adminService.getHealth();
  }
}

