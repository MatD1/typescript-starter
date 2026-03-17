import {
  Args,
  Context,
  ID,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminService } from './admin.service';
import {
  AdminUser,
  AdminUserDetail,
  PaginatedUsers,
  AdminApiKey,
  AdminApiKeyDetail,
  PaginatedApiKeys,
  AdminLogPage,
  AdminOverviewStats,
  UsageBucket,
  EndpointStat,
  UserStat,
  KeyStat,
  GtfsStatus,
  GtfsIngestResult,
  SystemHealth,
  UpdateUserInput,
  UpdateApiKeyInput,
  UsageGranularity,
} from './dto/admin.types';

@Public()
@UseGuards(AdminGuard)
@Resolver()
export class AdminResolver {
  constructor(private readonly adminService: AdminService) {}

  /** Extract the adminUser.userId set by AdminGuard from the GraphQL context. */
  private extractUserId(ctx: { req: Request }): string {
    return (
      (ctx.req as unknown as Record<string, unknown>)['adminUser'] as
        | { userId: string }
        | undefined
    )?.userId ?? '';
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  @Query(() => AdminUser, { name: 'adminMe' })
  async adminMe(@Context() ctx: { req: Request }): Promise<AdminUser> {
    return this.adminService.getMe(this.extractUserId(ctx));
  }

  @Query(() => PaginatedUsers, { name: 'adminUsers' })
  async adminUsers(
    @Args('page', { type: () => Int, nullable: true }) page?: number,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('search', { nullable: true }) search?: string,
    @Args('role', { nullable: true }) role?: string,
  ): Promise<PaginatedUsers> {
    return this.adminService.getUsers({ page, limit, search, role });
  }

  @Query(() => AdminUserDetail, { name: 'adminUser' })
  async adminUser(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AdminUserDetail> {
    return this.adminService.getUser(id);
  }

  @Query(() => PaginatedApiKeys, { name: 'adminApiKeys' })
  async adminApiKeys(
    @Args('page', { type: () => Int, nullable: true }) page?: number,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('userId', { type: () => ID, nullable: true }) userId?: string,
    @Args('enabled', { nullable: true }) enabled?: boolean,
  ): Promise<PaginatedApiKeys> {
    return this.adminService.getApiKeys({ page, limit, userId, enabled });
  }

  @Query(() => AdminApiKeyDetail, { name: 'adminApiKey' })
  async adminApiKey(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AdminApiKeyDetail> {
    return this.adminService.getApiKey(id);
  }

  @Query(() => AdminLogPage, { name: 'adminLogs' })
  async adminLogs(
    @Args('cursor', { nullable: true }) cursor?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('userId', { type: () => ID, nullable: true }) userId?: string,
    @Args('keyId', { type: () => ID, nullable: true }) keyId?: string,
    @Args('method', { nullable: true }) method?: string,
    @Args('statusCode', { type: () => Int, nullable: true }) statusCode?: number,
    @Args('path', { nullable: true }) path?: string,
    @Args('from', { nullable: true }) from?: string,
    @Args('to', { nullable: true }) to?: string,
  ): Promise<AdminLogPage> {
    return this.adminService.getLogs({
      cursor,
      limit,
      userId,
      keyId,
      method,
      statusCode,
      path,
      from,
      to,
    });
  }

  @Query(() => AdminLogPage, { name: 'adminErrorLogs' })
  async adminErrorLogs(
    @Args('cursor', { nullable: true }) cursor?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('from', { nullable: true }) from?: string,
    @Args('to', { nullable: true }) to?: string,
  ): Promise<AdminLogPage> {
    return this.adminService.getErrorLogs({ cursor, limit, from, to });
  }

  @Query(() => AdminOverviewStats, { name: 'adminStatsOverview' })
  async adminStatsOverview(): Promise<AdminOverviewStats> {
    return this.adminService.getOverviewStats();
  }

  @Query(() => [UsageBucket], { name: 'adminStatsUsage' })
  async adminStatsUsage(
    @Args('from') from: string,
    @Args('to') to: string,
    @Args('granularity', { type: () => UsageGranularity })
    granularity: UsageGranularity,
  ): Promise<UsageBucket[]> {
    return this.adminService.getUsageStats({ from, to, granularity });
  }

  @Query(() => [EndpointStat], { name: 'adminStatsEndpoints' })
  async adminStatsEndpoints(
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('from', { nullable: true }) from?: string,
    @Args('to', { nullable: true }) to?: string,
  ): Promise<EndpointStat[]> {
    return this.adminService.getEndpointStats({ limit, from, to });
  }

  @Query(() => [UserStat], { name: 'adminStatsUsers' })
  async adminStatsUsers(
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('from', { nullable: true }) from?: string,
    @Args('to', { nullable: true }) to?: string,
  ): Promise<UserStat[]> {
    return this.adminService.getUserStats({ limit, from, to });
  }

  @Query(() => [KeyStat], { name: 'adminStatsKeys' })
  async adminStatsKeys(
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('from', { nullable: true }) from?: string,
    @Args('to', { nullable: true }) to?: string,
  ): Promise<KeyStat[]> {
    return this.adminService.getKeyStats({ limit, from, to });
  }

  @Query(() => GtfsStatus, { name: 'adminGtfsStatus' })
  async adminGtfsStatus(): Promise<GtfsStatus> {
    return this.adminService.getGtfsStatus();
  }

  @Query(() => SystemHealth, { name: 'adminHealth' })
  async adminHealth(): Promise<SystemHealth> {
    return this.adminService.getHealth();
  }

  // ─── Mutations ────────────────────────────────────────────────────────────

  @Mutation(() => AdminUser, { name: 'adminUpdateUser' })
  async adminUpdateUser(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateUserInput,
  ): Promise<AdminUser> {
    return this.adminService.updateUser(id, input);
  }

  @Mutation(() => Boolean, { name: 'adminDeleteUser' })
  async adminDeleteUser(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.adminService.deleteUser(id);
    return true;
  }

  @Mutation(() => AdminApiKey, { name: 'adminUpdateApiKey' })
  async adminUpdateApiKey(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateApiKeyInput,
  ): Promise<AdminApiKey> {
    return this.adminService.updateApiKey(id, input);
  }

  @Mutation(() => Boolean, { name: 'adminDeleteApiKey' })
  async adminDeleteApiKey(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.adminService.deleteApiKey(id);
    return true;
  }

  @Mutation(() => AdminApiKey, { name: 'adminResetApiKeyUsage' })
  async adminResetApiKeyUsage(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AdminApiKey> {
    return this.adminService.resetApiKeyUsage(id);
  }

  @Mutation(() => GtfsIngestResult, { name: 'adminTriggerGtfsIngest' })
  async adminTriggerGtfsIngest(): Promise<GtfsIngestResult> {
    return this.adminService.triggerGtfsIngest();
  }

  @Mutation(() => Boolean, { name: 'adminFlushCache' })
  async adminFlushCache(): Promise<boolean> {
    await this.adminService.flushCache();
    return true;
  }
}
