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
  let onConflictDoNothingMock: jest.Mock;

  beforeEach(async () => {
    onConflictDoNothingMock = jest.fn().mockResolvedValue(undefined);
    const thenable = {
      then: (resolve: (v?: unknown) => void) => resolve(undefined),
      catch: () => thenable,
    };
    const insertChain = {
      values: jest.fn().mockReturnValue({
        onConflictDoNothing: onConflictDoNothingMock,
        ...thenable,
      }),
    };
    const selectChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        {
          id: EXISTING_USER_ID,
          name: 'Existing User',
          email: TEST_EMAIL,
          emailVerified: true,
          image: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'user',
          banned: false,
        },
      ]),
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
      email: TEST_EMAIL,
      user_metadata: { full_name: 'Existing User' },
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
      expect(onConflictDoNothingMock).toHaveBeenCalled();
    });

    it('calls insert with onConflictDoNothing to handle existing users safely', async () => {
      await service.exchangeSupabaseToken('valid-supabase-jwt');

      expect(onConflictDoNothingMock).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.anything() }),
      );
    });
  });
});
