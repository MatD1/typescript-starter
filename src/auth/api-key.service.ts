import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import type { DrizzleDB } from '../database/database.module';
import { apiKey, session, user } from '../database/schema/auth.schema';
import { CacheService } from '../cache/cache.service';
import { AuthService } from './auth.service';

/** Redis TTL for cached API key verification results (seconds). */
const APIKEY_VERIFY_TTL = 60;
/** Redis TTL for cached session → userId lookups (seconds). */
const SESSION_TTL = 120;

export interface ApiKeyRecord {
  id: string;
  name: string | null;
  start: string | null;
  userId: string;
  enabled: boolean;
  createdAt: Date;
  expiresAt: Date | null;
  permissions?: string;
}

interface VerifyResult {
  valid: boolean;
  userId?: string;
  keyId?: string;
  permissions?: string[];
}

@Injectable()
export class ApiKeyService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly cache: CacheService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) { }

  async createApiKey(
    userId: string,
    name?: string,
    permissions?: string,
    expiresAt?: Date,
    rateLimitEnabled: boolean = true,
    rateLimitTimeWindow: number = 60000,
    rateLimitMax: number = 60,
  ): Promise<{ key: string; id: string; start: string }> {
    // We use better-auth's internal API to create the key.
    // This ensures consistency with their plugin logic (hashing, prefixing, etc.)
    const result = await this.authService.auth.api.createApiKey({
      body: {
        userId,
        name: name ?? 'Default Key',
        permissions: permissions ? { api: [permissions] } : { api: ['user'] },
        expiresAt: expiresAt?.toISOString(),
        rateLimitEnabled,
        rateLimitTimeWindow,
        rateLimitMax,
      },
    });

    // better-auth returns the key record. The actual raw key is in the response.
    // NOTE: Depending on better-auth version, you might need to adjust the field names.
    return {
      key: result.key,
      id: result.id,
      start: result.start,
    };
  }

  async verifyApiKey(keyValue: string): Promise<VerifyResult> {
    const cacheKey = `apiKey:verify:${keyValue}`;

    const cached = await this.cache.get<VerifyResult>(cacheKey);
    if (cached !== null) return cached;

    // Use better-auth verification logic
    const result = await this.authService.auth.api.verifyApiKey({
      body: {
        key: keyValue,
      },
    });

    if (!result.valid) {
      const failResult: VerifyResult = { valid: false };
      await this.cache.set(cacheKey, failResult, 10);
      return failResult;
    }

    // Extract permissions. better-auth stores them as a JSON object.
    // e.g. { api: ['admin'] }
    const rawPermissions = result.key?.permissions as any;
    const permissionsList = rawPermissions?.api || ['user'];

    const verifyResult: VerifyResult = {
      valid: true,
      userId: result.key?.userId,
      keyId: result.key?.id,
      permissions: permissionsList,
    };

    await this.cache.set(cacheKey, verifyResult, APIKEY_VERIFY_TTL);
    return verifyResult;
  }

  async listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
    const rows = await this.db
      .select({
        id: apiKey.id,
        name: apiKey.name,
        start: apiKey.start,
        userId: apiKey.userId,
        enabled: apiKey.enabled,
        createdAt: apiKey.createdAt,
        expiresAt: apiKey.expiresAt,
        permissions: apiKey.permissions,
      })
      .from(apiKey)
      .where(eq(apiKey.userId, userId));

    return rows.map((r) => ({
      ...r,
      // Normalize permissions for the UI
      permissions: r.permissions ? JSON.parse(r.permissions)?.api?.[0] : 'user',
    }));
  }

  async listAllApiKeys(
    limit: number = 50,
    offset: number = 0,
  ): Promise<ApiKeyRecord[]> {
    const rows = await this.db
      .select({
        id: apiKey.id,
        name: apiKey.name,
        start: apiKey.start,
        userId: apiKey.userId,
        enabled: apiKey.enabled,
        createdAt: apiKey.createdAt,
        expiresAt: apiKey.expiresAt,
        permissions: apiKey.permissions,
      })
      .from(apiKey)
      .limit(limit)
      .offset(offset);

    return rows.map((r) => ({
      ...r,
      permissions: r.permissions ? JSON.parse(r.permissions)?.api?.[0] : 'user',
    }));
  }

  async updateApiKeyRateLimit(
    keyId: string,
    enabled: boolean,
    max: number,
    timeWindow: number,
  ): Promise<void> {
    await this.db
      .update(apiKey)
      .set({
        rateLimitEnabled: enabled,
        rateLimitMax: max,
        rateLimitTimeWindow: timeWindow,
        updatedAt: new Date(),
      })
      .where(eq(apiKey.id, keyId));

    // Get the key record to know the key details for cache invalidation
    const rows = await this.db
      .select({ key: apiKey.key })
      .from(apiKey)
      .where(eq(apiKey.id, keyId))
      .limit(1);

    if (rows.length) {
      await this.cache.del(`apiKey:verify:${rows[0].key}`);
    }
  }

  async revokeApiKeyAdmin(keyId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(apiKey)
      .where(eq(apiKey.id, keyId))
      .limit(1);

    if (!rows.length) throw new NotFoundException('API key not found');

    await this.db
      .update(apiKey)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(apiKey.id, keyId));

    await this.cache.del(`apiKey:verify:${rows[0].key}`);
  }

  async revokeApiKey(keyId: string, userId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(apiKey)
      .where(eq(apiKey.id, keyId))
      .limit(1);

    if (!rows.length) throw new NotFoundException('API key not found');
    if (rows[0].userId !== userId) {
      throw new BadRequestException('API key does not belong to this user');
    }

    await this.db
      .update(apiKey)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(apiKey.id, keyId));

    await this.cache.del(`apiKey:verify:${rows[0].key}`);
  }



  async getUserFromSession(
    sessionToken: string,
  ): Promise<{ userId: string; role: string } | null> {
    const cacheKey = `session:user-full:${sessionToken}`;

    const cached = await this.cache.get<{ userId: string; role: string } | null>(
      cacheKey,
    );
    if (cached !== null) return cached;

    const rows = await this.db
      .select({
        userId: user.id,
        role: user.role,
        expiresAt: session.expiresAt,
      })
      .from(session)
      .innerJoin(user, eq(session.userId, user.id))
      .where(eq(session.token, sessionToken))
      .limit(1);

    if (!rows.length) return null;
    const s = rows[0];
    if (s.expiresAt < new Date()) return null;

    const result = { userId: s.userId, role: s.role };
    await this.cache.set(cacheKey, result, SESSION_TTL);
    return result;
  }
}

