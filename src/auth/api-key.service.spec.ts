import { Test, TestingModule } from '@nestjs/testing';

jest.mock('./auth.service', () => ({ AuthService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('./supabase-auth.service', () => ({
  SupabaseAuthService: jest.fn().mockImplementation(() => ({})),
}));

import { ApiKeyService } from './api-key.service';
import { AuthService } from './auth.service';
import { SupabaseAuthService } from './supabase-auth.service';
import { DRIZZLE } from '../database/database.module';
import { CacheService } from '../cache/cache.service';

describe('ApiKeyService.resolveUserFromBearer', () => {
  let service: ApiKeyService;
  let mockSupabaseAuth: { authenticateBearerToken: jest.Mock };
  let mockCache: {
    store: Map<string, unknown>;
    get: jest.Mock;
    set: jest.Mock;
  };
  let selectLimitMock: jest.Mock;

  beforeEach(async () => {
    mockSupabaseAuth = { authenticateBearerToken: jest.fn() };

    const store = new Map<string, unknown>();
    mockCache = {
      store,
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: jest.fn((key: string, value: unknown) => {
        store.set(key, value);
        return Promise.resolve();
      }),
    };

    selectLimitMock = jest.fn().mockResolvedValue([]);
    const mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: selectLimitMock,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: CacheService, useValue: mockCache },
        { provide: AuthService, useValue: {} },
        { provide: SupabaseAuthService, useValue: mockSupabaseAuth },
      ],
    }).compile();

    service = module.get(ApiKeyService);
  });

  it('prefers the Supabase JWT path when it resolves', async () => {
    mockSupabaseAuth.authenticateBearerToken.mockResolvedValue({
      userId: 'u1',
      role: 'user',
      banned: false,
    });

    const result = await service.resolveUserFromBearer('a-supabase-jwt');

    expect(result).toEqual({ userId: 'u1', role: 'user', banned: false });
    expect(selectLimitMock).not.toHaveBeenCalled();
  });

  it('falls back to the legacy session-token lookup when the credential is not a valid Supabase token', async () => {
    mockSupabaseAuth.authenticateBearerToken.mockResolvedValue(null);
    const futureExpiry = new Date(Date.now() + 3600_000);
    selectLimitMock.mockResolvedValue([
      { userId: 'u2', role: 'admin', expiresAt: futureExpiry },
    ]);

    const result = await service.resolveUserFromBearer('legacy-session-token');

    expect(result).toEqual({ userId: 'u2', role: 'admin', banned: false });
  });

  it('returns null when neither path resolves the credential', async () => {
    mockSupabaseAuth.authenticateBearerToken.mockResolvedValue(null);
    selectLimitMock.mockResolvedValue([]);

    const result = await service.resolveUserFromBearer('garbage');

    expect(result).toBeNull();
  });

  it('caches a successful Supabase resolution so the second call skips verification', async () => {
    mockSupabaseAuth.authenticateBearerToken.mockResolvedValue({
      userId: 'u3',
      role: 'user',
      banned: false,
    });

    await service.resolveUserFromBearer('a-supabase-jwt');
    await service.resolveUserFromBearer('a-supabase-jwt');

    expect(mockSupabaseAuth.authenticateBearerToken).toHaveBeenCalledTimes(1);
  });
});
