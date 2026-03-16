import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { DRIZZLE } from '../database/database.module';
import { GtfsStaticService } from './gtfs-static.service';
import { CacheService } from '../cache/cache.service';
import { gtfsRoute } from '../database/schema/gtfs.schema';

describe('GtfsStaticService', () => {
  let service: GtfsStaticService;
  let mockDb: { select: jest.Mock; from: jest.Mock; where: jest.Mock };
  let mockCache: { get: jest.Mock; set: jest.Mock };
  let queryChain: {
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    offset: jest.Mock;
  };

  beforeEach(async () => {
    queryChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockResolvedValue([]),
    };
    mockDb = {
      select: jest.fn().mockReturnValue(queryChain),
      from: queryChain.from,
      where: queryChain.where,
    };

    mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GtfsStaticService,
        { provide: ConfigService, useValue: { get: () => 'test-key' } },
        { provide: HttpService, useValue: {} },
        { provide: DRIZZLE, useValue: mockDb },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<GtfsStaticService>(GtfsStaticService);
    jest.clearAllMocks();
  });

  describe('getIntercityRouteIds', () => {
    it('returns cached route IDs when cache hit', async () => {
      mockCache.get.mockResolvedValue(['BMT_1', 'CCN_1']);

      const result = await service.getIntercityRouteIds();

      expect(result).toEqual(new Set(['BMT_1', 'CCN_1']));
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('queries gtfs_routes by route_short_name and caches result', async () => {
      const chain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([
          { routeId: 'BMT_1' },
          { routeId: 'CCN_1' },
          { routeId: 'HUN_1' },
        ]),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(chain);

      const result = await service.getIntercityRouteIds();

      expect(result).toEqual(new Set(['BMT_1', 'CCN_1', 'HUN_1']));
      expect(mockDb.select).toHaveBeenCalledWith({ routeId: gtfsRoute.routeId });
      expect(chain.from).toHaveBeenCalledWith(gtfsRoute);
      expect(mockCache.set).toHaveBeenCalledWith(
        'gtfs:intercity_route_ids',
        expect.any(Array),
        expect.any(Number),
      );
    });

    it('returns empty set when no intercity routes in DB', async () => {
      const chain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(chain);

      const result = await service.getIntercityRouteIds();

      expect(result).toEqual(new Set());
    });
  });

  describe('getRouteMetadataMap', () => {
    it('returns cached map when cache hit', async () => {
      mockCache.get.mockResolvedValue({
        T1: { lineCode: 'T1', routeColour: '009B77' },
        BMT_1: { lineCode: 'BMT', routeColour: undefined },
      });

      const result = await service.getRouteMetadataMap();

      expect(result.get('T1')).toEqual({ lineCode: 'T1', routeColour: '009B77' });
      expect(result.get('BMT_1')).toEqual({ lineCode: 'BMT', routeColour: undefined });
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('queries gtfs_routes and caches result', async () => {
      const chain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([
          { routeId: 'T1', routeShortName: 'T1', routeColor: '009B77' },
          { routeId: 'BMT_1', routeShortName: 'BMT', routeColor: null },
        ]),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(chain);

      const result = await service.getRouteMetadataMap();

      expect(result.get('T1')).toEqual({ lineCode: 'T1', routeColour: '009B77' });
      expect(result.get('BMT_1')).toEqual({ lineCode: 'BMT', routeColour: undefined });
      expect(mockCache.set).toHaveBeenCalledWith(
        'gtfs:route_metadata',
        expect.objectContaining({
          T1: { lineCode: 'T1', routeColour: '009B77' },
          BMT_1: { lineCode: 'BMT', routeColour: undefined },
        }),
        expect.any(Number),
      );
    });

    it('returns empty map when no routes in DB', async () => {
      const chain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(chain);

      const result = await service.getRouteMetadataMap();

      expect(result).toEqual(new Map());
    });
  });

  describe('getStops', () => {
    it('returns paginated envelope with hasNextPage false when on last page', async () => {
      const stops = [{ stopId: 'A' }, { stopId: 'B' }];
      let callCount = 0;
      const chain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockImplementation(() => {
          // First call = data query, second call = count query (via where-less chain)
          return Promise.resolve(callCount++ === 0 ? stops : [{ total: 2 }]);
        }),
      };
      // count query resolves from the non-chained path
      const countChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([{ total: 2 }]),
      };
      // select is called twice: once for data, once for count
      mockDb.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              offset: jest.fn().mockResolvedValue(stops),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockResolvedValue([{ total: 2 }]),
        });

      const result = await service.getStops(undefined, 100, 0);

      expect(result.data).toEqual(stops);
      expect(result.total).toBe(2);
      expect(result.limit).toBe(100);
      expect(result.offset).toBe(0);
      expect(result.hasNextPage).toBe(false); // 0 + 100 >= 2
    });

    it('returns hasNextPage true when more records exist', async () => {
      const stops = Array.from({ length: 100 }, (_, i) => ({ stopId: `S${i}` }));
      mockDb.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              offset: jest.fn().mockResolvedValue(stops),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockResolvedValue([{ total: 2543 }]),
        });

      const result = await service.getStops(undefined, 100, 0);

      expect(result.data).toHaveLength(100);
      expect(result.total).toBe(2543);
      expect(result.hasNextPage).toBe(true); // 0 + 100 < 2543
    });
  });
});
