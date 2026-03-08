import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { DRIZZLE } from '../database/database.module';
import type { DrizzleDB } from '../database/database.module';
import { apikey, session } from '../database/schema/auth.schema';

const KEY_PREFIX = 'nsw_';

export interface ApiKeyRecord {
  id: string;
  name: string | null;
  start: string | null;
  userId: string;
  enabled: boolean;
  createdAt: Date;
  expiresAt: Date | null;
}

@Injectable()
export class ApiKeyService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async createApiKey(
    userId: string,
    name?: string,
    expiresAt?: Date,
  ): Promise<{ key: string; id: string; start: string }> {
    const rawKey = randomBytes(32).toString('hex');
    const fullKey = `${KEY_PREFIX}${rawKey}`;
    const start = fullKey.slice(0, 10);
    const id = randomBytes(16).toString('hex');

    await this.db.insert(apikey).values({
      id,
      name: name ?? null,
      start,
      prefix: KEY_PREFIX,
      key: fullKey,
      userId,
      enabled: true,
      requestCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: expiresAt ?? null,
    });

    return { key: fullKey, id, start };
  }

  async verifyApiKey(
    keyValue: string,
  ): Promise<{ valid: boolean; userId?: string; keyId?: string }> {
    const rows = await this.db
      .select()
      .from(apikey)
      .where(eq(apikey.key, keyValue))
      .limit(1);

    if (!rows.length) return { valid: false };

    const record = rows[0];
    if (!record.enabled) return { valid: false };
    if (record.expiresAt && record.expiresAt < new Date()) {
      return { valid: false };
    }

    await this.db
      .update(apikey)
      .set({
        requestCount: (record.requestCount ?? 0) + 1,
        lastRequest: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(apikey.id, record.id));

    return { valid: true, userId: record.userId, keyId: record.id };
  }

  async listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
    return this.db
      .select({
        id: apikey.id,
        name: apikey.name,
        start: apikey.start,
        userId: apikey.userId,
        enabled: apikey.enabled,
        createdAt: apikey.createdAt,
        expiresAt: apikey.expiresAt,
      })
      .from(apikey)
      .where(eq(apikey.userId, userId));
  }

  async revokeApiKey(keyId: string, userId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(apikey)
      .where(eq(apikey.id, keyId))
      .limit(1);

    if (!rows.length) throw new NotFoundException('API key not found');
    if (rows[0].userId !== userId) {
      throw new BadRequestException('API key does not belong to this user');
    }

    await this.db
      .update(apikey)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(apikey.id, keyId));
  }

  async getUserFromSession(sessionToken: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(session)
      .where(eq(session.token, sessionToken))
      .limit(1);

    if (!rows.length) return null;
    const s = rows[0];
    if (s.expiresAt < new Date()) return null;
    return s.userId;
  }
}
