import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthService } from './supabase-auth.service';

jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
  createRemoteJWKSet: jest.fn(),
  decodeProtectedHeader: jest.fn(),
}));
jest.mock('./auth.service', () => ({ AuthService: jest.fn().mockImplementation(() => ({})) }));
import { AuthService } from './auth.service';
import { DRIZZLE } from '../database/database.module';
import type { DrizzleDB } from '../database/database.module';
import { CacheService } from '../cache/cache.service';

const EXISTING_USER_ID = 'existing-user-id-from-better-auth';
const TEST_EMAIL = 'existing@example.com';

describe('SupabaseAuthService', () => {
  let service: SupabaseAuthService;
  let mockDb: jest.Mocked<DrizzleDB>;
  let onConflictDoUpdateMock: jest.Mock;

  beforeEach(async () => {
    onConflictDoUpdateMock = jest.fn().mockResolvedValue(undefined);
    const thenable = {
      then: (resolve: (v?: unknown) => void) => resolve(undefined),
      catch: () => thenable,
    };
    const insertChain = {
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: onConflictDoUpdateMock,
        ...thenable,
      }),
    };
    const existingUserRow = {
      id: EXISTING_USER_ID,
      name: 'Existing User',
      email: TEST_EMAIL,
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: 'user',
      banned: false,
    };
    const selectChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      // resolveOrCreateUser looks up by supabaseUserId first (not found for
      // a "pre-existing, not-yet-anchored" account, matching these tests'
      // intent), then falls through to the post-upsert email lookup.
      limit: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValue([existingUserRow]),
    };
    mockDb = {
      insert: jest.fn().mockReturnValue(insertChain),
      select: jest.fn().mockReturnValue(selectChain),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    } as unknown as jest.Mocked<DrizzleDB>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupabaseAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'session.ttlSeconds') return 3600;
              if (key === 'session.refreshTokenTtlSeconds') return 604800;
              if (key === 'supabase.jwtSecret') return 'test-jwt-secret';
              return undefined;
            },
          },
        },
        { provide: AuthService, useValue: {} },
        { provide: DRIZZLE, useValue: mockDb },
        { provide: CacheService, useValue: { del: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(SupabaseAuthService);

    jest.spyOn(service as any, 'verifyToken').mockResolvedValue({
      sub: 'supabase-sub-id',
      email: TEST_EMAIL,
      user_metadata: { full_name: 'Existing User' },
    });
  });

  describe('refreshSession', () => {
    const OLD_REFRESH_TOKEN = 'old-refresh-token';
    const oldSessionRow = {
      id: 'session-1',
      userId: EXISTING_USER_ID,
      token: 'old-session-token',
      refreshToken: OLD_REFRESH_TOKEN,
      refreshTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    };

    function makeCache() {
      const store = new Map<string, unknown>();
      return {
        store,
        get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        set: jest.fn((key: string, value: unknown) => {
          store.set(key, value);
          return Promise.resolve();
        }),
        del: jest.fn((key: string) => {
          store.delete(key);
          return Promise.resolve();
        }),
      };
    }

    function buildService(cache: ReturnType<typeof makeCache>, db: Partial<jest.Mocked<DrizzleDB>>) {
      return Test.createTestingModule({
        providers: [
          SupabaseAuthService,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string) => {
                if (key === 'session.ttlSeconds') return 3600;
                if (key === 'session.refreshTokenTtlSeconds') return 604800;
                return undefined;
              },
            },
          },
          { provide: AuthService, useValue: {} },
          { provide: DRIZZLE, useValue: db },
          { provide: CacheService, useValue: cache },
        ],
      })
        .compile()
        .then((m) => m.get(SupabaseAuthService));
    }

    it('rotates the session in place and returns new tokens', async () => {
      const cache = makeCache();
      const updateSet = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      });
      const db = {
        select: jest
          .fn()
          .mockReturnValueOnce({
            from: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue([oldSessionRow]),
          })
          .mockReturnValueOnce({
            from: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue([{ role: 'user' }]),
          }),
        update: jest.fn().mockReturnValue({ set: updateSet }),
      } as unknown as jest.Mocked<DrizzleDB>;

      const svc = await buildService(cache, db);
      const result = await svc.refreshSession(OLD_REFRESH_TOKEN);

      expect(result.sessionToken).toBeDefined();
      expect(result.refreshToken).not.toBe(OLD_REFRESH_TOKEN);
      expect(db.update).toHaveBeenCalledTimes(1);
      // Both the short replay-grace marker and the longer reuse-detection
      // marker get set for the old token.
      expect(cache.set).toHaveBeenCalledWith(
        `refresh:grace:${OLD_REFRESH_TOKEN}`,
        expect.objectContaining({ userId: EXISTING_USER_ID }),
        30,
      );
      expect(cache.set).toHaveBeenCalledWith(
        `refresh:used:${OLD_REFRESH_TOKEN}`,
        EXISTING_USER_ID,
        expect.any(Number),
      );
    });

    it('replays the same rotated session when the old token is retried within the grace window (lost response)', async () => {
      const cache = makeCache();
      cache.store.set(`refresh:grace:${OLD_REFRESH_TOKEN}`, {
        userId: EXISTING_USER_ID,
        sessionToken: 'already-issued-session-token',
        refreshToken: 'already-issued-refresh-token',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        role: 'user',
      });
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([]), // token already rotated away
        }),
        update: jest.fn(),
        delete: jest.fn(),
      } as unknown as jest.Mocked<DrizzleDB>;

      const svc = await buildService(cache, db);
      const result = await svc.refreshSession(OLD_REFRESH_TOKEN);

      expect(result.sessionToken).toBe('already-issued-session-token');
      expect(result.refreshToken).toBe('already-issued-refresh-token');
      // A safe replay must not rotate again or revoke anything.
      expect(db.update).not.toHaveBeenCalled();
      expect(db.delete).not.toHaveBeenCalled();
    });

    it('revokes all sessions when the old token is reused after the grace window has expired', async () => {
      const cache = makeCache();
      // Grace entry has expired (not present); the longer-lived reuse marker remains.
      cache.store.set(`refresh:used:${OLD_REFRESH_TOKEN}`, EXISTING_USER_ID);
      const deleteWhere = jest.fn().mockResolvedValue(undefined);
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([]),
        }),
        delete: jest.fn().mockReturnValue({ where: deleteWhere }),
      } as unknown as jest.Mocked<DrizzleDB>;

      const svc = await buildService(cache, db);
      await expect(svc.refreshSession(OLD_REFRESH_TOKEN)).rejects.toThrow(
        'Refresh token reuse detected. All sessions have been revoked.',
      );
      expect(db.delete).toHaveBeenCalled();
      expect(deleteWhere).toHaveBeenCalled();
    });
  });

  describe('exchangeSupabaseToken (idempotent when user exists)', () => {
    it('returns existing userId when user already exists (no unique violation)', async () => {
      const result = await service.exchangeSupabaseToken('valid-supabase-jwt');

      expect(result.userId).toBe(EXISTING_USER_ID);
      expect(result.role).toBe('user');
      expect(result.sessionToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);

      const insertCall = mockDb.insert as jest.Mock;
      expect(insertCall).toHaveBeenCalled();
      expect(onConflictDoUpdateMock).toHaveBeenCalled();
    });

    it('calls insert with onConflictDoUpdate to handle existing users safely and sync roles', async () => {
      await service.exchangeSupabaseToken('valid-supabase-jwt');

      expect(onConflictDoUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.anything() }),
      );
    });
  });

  describe('resolveOrCreateUser', () => {
    it('takes the fast path when the user is already anchored to this Supabase identity', async () => {
      const anchoredRow = {
        id: EXISTING_USER_ID,
        role: 'user',
        banned: false,
      };
      // Override the shared beforeEach mock: the supabaseUserId lookup
      // finds a row immediately, so the insert/upsert path must not run.
      (mockDb.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([anchoredRow]),
      });

      const result = await service.resolveOrCreateUser({
        sub: 'supabase-sub-id',
        email: TEST_EMAIL,
      });

      expect(result).toEqual({
        userId: EXISTING_USER_ID,
        role: 'user',
        banned: false,
      });
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('throws when the payload has no sub claim', async () => {
      await expect(
        service.resolveOrCreateUser({ email: TEST_EMAIL }),
      ).rejects.toThrow('Supabase JWT missing sub claim');
    });
  });

  describe('authenticateBearerToken', () => {
    it('returns the resolved user for a valid Supabase token', async () => {
      const result = await service.authenticateBearerToken('valid-supabase-jwt');
      expect(result).toEqual({
        userId: EXISTING_USER_ID,
        role: 'user',
        banned: false,
      });
    });

    it('returns null instead of throwing when verification fails', async () => {
      jest
        .spyOn(service, 'verifyToken')
        .mockRejectedValue(new Error('bad signature'));

      const result = await service.authenticateBearerToken('not-a-supabase-token');
      expect(result).toBeNull();
    });
  });
});
