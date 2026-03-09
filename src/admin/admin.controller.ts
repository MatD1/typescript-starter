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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AdminGuard } from './guards/admin.guard';
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

@ApiTags('Admin')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Auth ────────────────────────────────────────────────────────────────

  @Get('auth/me')
  @ApiOperation({ summary: 'Get current admin user profile' })
  getMe(@Req() req: Request) {
    const adminUser = (req as unknown as Record<string, unknown>)['adminUser'] as
      | { userId: string }
      | undefined;
    return this.adminService.getMe(adminUser?.userId ?? '');
  }

  // ─── Users ───────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List all users (paginated)' })
  getUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.getUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get a single user with stats' })
  @ApiParam({ name: 'id', description: 'User ID' })
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update user role or banned status' })
  @ApiParam({ name: 'id', description: 'User ID' })
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user and all associated data' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async deleteUser(@Param('id') id: string) {
    await this.adminService.deleteUser(id);
  }

  // ─── API Keys ─────────────────────────────────────────────────────────────

  @Get('api-keys')
  @ApiOperation({ summary: 'List all API keys (paginated)' })
  getApiKeys(@Query() query: AdminApiKeysQueryDto) {
    return this.adminService.getApiKeys(query);
  }

  @Get('api-keys/:id')
  @ApiOperation({ summary: 'Get a single API key with 7-day usage' })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  getApiKey(@Param('id') id: string) {
    return this.adminService.getApiKey(id);
  }

  @Patch('api-keys/:id')
  @ApiOperation({ summary: 'Update API key settings' })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  updateApiKey(@Param('id') id: string, @Body() dto: UpdateApiKeyDto) {
    return this.adminService.updateApiKey(id, dto);
  }

  @Delete('api-keys/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an API key (hard delete)' })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  async deleteApiKey(@Param('id') id: string) {
    await this.adminService.deleteApiKey(id);
  }

  @Post('api-keys/:id/reset-usage')
  @ApiOperation({ summary: 'Reset request count and remaining for an API key' })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  resetApiKeyUsage(@Param('id') id: string) {
    return this.adminService.resetApiKeyUsage(id);
  }

  // ─── Logs ─────────────────────────────────────────────────────────────────

  @Get('logs')
  @ApiOperation({ summary: 'Query request logs (cursor paginated)' })
  getLogs(@Query() query: AdminLogsQueryDto) {
    return this.adminService.getLogs(query);
  }

  @Get('logs/errors')
  @ApiOperation({ summary: 'Query error logs (status >= 400, cursor paginated)' })
  getErrorLogs(@Query() query: AdminErrorLogsQueryDto) {
    return this.adminService.getErrorLogs(query);
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  @Get('stats/overview')
  @ApiOperation({ summary: 'Overview stats: 24h requests, error rate, active users 7d' })
  getOverviewStats() {
    return this.adminService.getOverviewStats();
  }

  @Get('stats/usage')
  @ApiOperation({ summary: 'Time-series usage stats grouped by hour or day' })
  getUsageStats(@Query() query: AdminStatsUsageQueryDto) {
    return this.adminService.getUsageStats(query);
  }

  @Get('stats/endpoints')
  @ApiOperation({ summary: 'Top endpoints by request count' })
  getEndpointStats(@Query() query: AdminStatsTopQueryDto) {
    return this.adminService.getEndpointStats(query);
  }

  @Get('stats/users')
  @ApiOperation({ summary: 'Top users by request count' })
  getUserStats(@Query() query: AdminStatsTopQueryDto) {
    return this.adminService.getUserStats(query);
  }

  @Get('stats/keys')
  @ApiOperation({ summary: 'Top API keys by request count' })
  getKeyStats(@Query() query: AdminStatsTopQueryDto) {
    return this.adminService.getKeyStats(query);
  }

  // ─── GTFS ─────────────────────────────────────────────────────────────────

  @Get('gtfs/status')
  @ApiOperation({ summary: 'GTFS static data status: table counts and last ingest time' })
  getGtfsStatus() {
    return this.adminService.getGtfsStatus();
  }

  @Post('gtfs/ingest')
  @ApiOperation({ summary: 'Trigger a full GTFS static data ingest' })
  triggerGtfsIngest() {
    return this.adminService.triggerGtfsIngest();
  }

  @Delete('gtfs/cache')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Flush all Redis cache entries' })
  async flushCache() {
    await this.adminService.flushCache();
  }

  // ─── Health ───────────────────────────────────────────────────────────────

  @Get('health')
  @ApiOperation({ summary: 'System health check (DB, Redis, TfNSW API)' })
  getHealth() {
    return this.adminService.getHealth();
  }
}

