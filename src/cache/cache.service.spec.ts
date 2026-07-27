import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

const mockRedisInstance = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  on: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedisInstance.get.mockResolvedValue(null);
    mockRedisInstance.set.mockResolvedValue('OK');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('redis://localhost:6379') },
        },
      ],
    }).compile();

    service = module.get(CacheService);
  });

  describe('getOrSet', () => {
    it('returns the cached value without calling the factory on a hit', async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify({ cached: true }));
      const factory = jest.fn();

      const result = await service.getOrSet('key-1', factory, 60);

      expect(result).toEqual({ cached: true });
      expect(factory).not.toHaveBeenCalled();
    });

    it('calls the factory once and caches the result on a miss', async () => {
      const factory = jest.fn().mockResolvedValue({ fresh: true });

      const result = await service.getOrSet('key-2', factory, 60);

      expect(result).toEqual({ fresh: true });
      expect(factory).toHaveBeenCalledTimes(1);
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'key-2',
        JSON.stringify({ fresh: true }),
        'EX',
        60,
      );
    });

    it('coalesces concurrent misses on the same key into a single factory call', async () => {
      let resolveFactory!: (value: { data: string }) => void;
      const factory = jest.fn(
        () =>
          new Promise<{ data: string }>((resolve) => {
            resolveFactory = resolve;
          }),
      );

      // Two concurrent callers racing on the same still-cold key — this is
      // exactly the sydneytrains/intercity race that was hitting TfNSW twice.
      const call1 = service.getOrSet('shared-key', factory, 60);
      const call2 = service.getOrSet('shared-key', factory, 60);

      // Let both calls' `await this.get(key)` resolve and reach the factory
      // invocation before we resolve it, so the coalescing check is actually
      // exercised rather than racing against the mock's own microtask.
      await new Promise((r) => setImmediate(r));
      resolveFactory({ data: 'once' });
      const [result1, result2] = await Promise.all([call1, call2]);

      expect(factory).toHaveBeenCalledTimes(1);
      expect(result1).toEqual({ data: 'once' });
      expect(result2).toEqual({ data: 'once' });
    });

    it('allows a fresh factory call for the same key after the in-flight one settles', async () => {
      const factory = jest
        .fn()
        .mockResolvedValueOnce({ n: 1 })
        .mockResolvedValueOnce({ n: 2 });

      const first = await service.getOrSet('sequential-key', factory, 60);
      // Second call still sees a cache miss (Redis mock always returns null),
      // but since the first call's in-flight entry has already cleared, this
      // is a legitimately new fetch, not a coalesced duplicate.
      const second = await service.getOrSet('sequential-key', factory, 60);

      expect(first).toEqual({ n: 1 });
      expect(second).toEqual({ n: 2 });
      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('does not coalesce different keys', async () => {
      const factoryA = jest.fn().mockResolvedValue('a');
      const factoryB = jest.fn().mockResolvedValue('b');

      const [resultA, resultB] = await Promise.all([
        service.getOrSet('key-a', factoryA, 60),
        service.getOrSet('key-b', factoryB, 60),
      ]);

      expect(resultA).toBe('a');
      expect(resultB).toBe('b');
      expect(factoryA).toHaveBeenCalledTimes(1);
      expect(factoryB).toHaveBeenCalledTimes(1);
    });

    it('clears the in-flight entry even when the factory rejects, so a later call can retry', async () => {
      const factory = jest
        .fn()
        .mockRejectedValueOnce(new Error('upstream failed'))
        .mockResolvedValueOnce({ ok: true });

      await expect(service.getOrSet('retry-key', factory, 60)).rejects.toThrow(
        'upstream failed',
      );

      const result = await service.getOrSet('retry-key', factory, 60);
      expect(result).toEqual({ ok: true });
      expect(factory).toHaveBeenCalledTimes(2);
    });
  });
});
