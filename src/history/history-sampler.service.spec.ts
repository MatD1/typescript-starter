import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from '../cache/cache.service';
import { DRIZZLE } from '../database/database.module';
import { DisruptionsService } from '../disruptions/disruptions.service';
import { GtfsStaticService } from '../gtfs-static/gtfs-static.service';
import { RealtimeService } from '../realtime/realtime.service';
import { HistorySamplerService } from './history-sampler.service';
import { SAMPLER_LOCK_KEY } from './history.constants';

describe('HistorySamplerService', () => {
  let service: HistorySamplerService;

  const mockTx = {
    insert: jest.fn(),
    delete: jest.fn(),
  };

  const mockDb = {
    transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<void>) => {
      mockTx.insert.mockReset();
      mockTx.delete.mockReset();
      mockTx.insert.mockImplementation(() => ({
        values: jest.fn().mockImplementation(() => {
          const builder = Promise.resolve(undefined) as Promise<void> & {
            onConflictDoUpdate: jest.Mock;
          };
          // Support both await values() and values().onConflictDoUpdate()
          (builder as unknown as { onConflictDoUpdate: jest.Mock }).onConflictDoUpdate =
            jest.fn().mockResolvedValue(undefined);
          Object.assign(builder, {
            onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
          });
          return {
            onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
            then: (resolve: (v: unknown) => unknown) => resolve(undefined),
          };
        }),
      }));
      mockTx.delete.mockImplementation(() => ({
        where: jest.fn().mockResolvedValue(undefined),
      }));
      await fn(mockTx);
    }),
    execute: jest.fn().mockResolvedValue(undefined),
  };

  const mockRealtime = {
    getTripUpdates: jest.fn().mockResolvedValue([]),
    getVehiclePositions: jest.fn().mockResolvedValue([]),
  };
  const mockDisruptions = {
    getDisruptions: jest.fn().mockResolvedValue([]),
  };
  const mockGtfs = {
    getRouteMetadataMap: jest.fn().mockResolvedValue(new Map()),
    getScheduledTripCountsByLine: jest.fn().mockResolvedValue(new Map()),
    getRouteIdsForStopIds: jest.fn().mockResolvedValue(new Map()),
    getRouteIdsForTripIds: jest.fn().mockResolvedValue(new Map()),
  };
  const mockCache = {
    acquireLock: jest.fn().mockResolvedValue(true),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCache.acquireLock.mockResolvedValue(true);
    mockRealtime.getTripUpdates.mockResolvedValue([]);
    mockRealtime.getVehiclePositions.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistorySamplerService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: DisruptionsService, useValue: mockDisruptions },
        { provide: GtfsStaticService, useValue: mockGtfs },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get(HistorySamplerService);
  });

  it('skips when lock is not acquired', async () => {
    mockCache.acquireLock.mockResolvedValue(false);
    await service.sample();
    expect(mockRealtime.getTripUpdates).not.toHaveBeenCalled();
    expect(mockCache.acquireLock).toHaveBeenCalledWith(
      SAMPLER_LOCK_KEY,
      expect.any(Number),
    );
  });

  it('skips write on empty sample and records metrics', async () => {
    await service.sample();
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockCache.set).toHaveBeenCalled();
  });

  it('persists when trip updates are present', async () => {
    mockRealtime.getTripUpdates.mockResolvedValue([
      {
        tripId: 't1',
        routeId: 'NSN_1',
        mode: 'sydneytrains',
        delay: 0,
        timestamp: Math.floor(Date.now() / 1000),
        stopTimeUpdates: [],
      },
    ]);

    await service.sample();
    expect(mockDb.transaction).toHaveBeenCalled();
  });

  it('persists newly-cancelled tripIds to the daily dedup set, merged with what was already seen', async () => {
    mockCache.get.mockImplementation((key: string) =>
      Promise.resolve(key.startsWith('history:dedup:cancelled:') ? ['already-seen-1'] : null),
    );
    mockRealtime.getTripUpdates.mockResolvedValue([
      {
        tripId: 'newly-cancelled-1',
        routeId: 'NSN_1',
        mode: 'sydneytrains',
        scheduleRelationship: 'CANCELED',
        timestamp: Math.floor(Date.now() / 1000),
        stopTimeUpdates: [],
      },
    ]);

    await service.sample();

    const dedupSetCall = mockCache.set.mock.calls.find(([key]: [string]) =>
      key.startsWith('history:dedup:cancelled:'),
    );
    expect(dedupSetCall).toBeDefined();
    expect(dedupSetCall![1]).toEqual(
      expect.arrayContaining(['already-seen-1', 'newly-cancelled-1']),
    );
  });

  it('does not touch the dedup set when there are no new cancellations', async () => {
    mockRealtime.getTripUpdates.mockResolvedValue([
      {
        tripId: 't1',
        routeId: 'NSN_1',
        mode: 'sydneytrains',
        delay: 0,
        timestamp: Math.floor(Date.now() / 1000),
        stopTimeUpdates: [],
      },
    ]);

    await service.sample();

    const dedupSetCall = mockCache.set.mock.calls.find(([key]: [string]) =>
      key.startsWith('history:dedup:cancelled:'),
    );
    expect(dedupSetCall).toBeUndefined();
  });

  it('skips persist when feed is stale', async () => {
    mockRealtime.getTripUpdates.mockResolvedValue([
      {
        tripId: 't1',
        routeId: 'NSN_1',
        mode: 'sydneytrains',
        delay: 0,
        timestamp: Math.floor(Date.now() / 1000) - 20 * 60,
        stopTimeUpdates: [],
      },
    ]);

    await service.sample();
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});
