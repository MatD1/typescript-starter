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
  let queryChain: { from: jest.Mock; where: jest.Mock };

  beforeEach(async () => {
    queryChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([]),
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
      queryChain.where.mockResolvedValue([
        { routeId: 'BMT_1' },
        { routeId: 'CCN_1' },
        { routeId: 'HUN_1' },
      ]);

      const result = await service.getIntercityRouteIds();

      expect(result).toEqual(new Set(['BMT_1', 'CCN_1', 'HUN_1']));
      expect(mockDb.select).toHaveBeenCalledWith({ routeId: gtfsRoute.routeId });
      expect(mockDb.from).toHaveBeenCalledWith(gtfsRoute);
      expect(mockCache.set).toHaveBeenCalledWith(
        'gtfs:intercity_route_ids',
        expect.any(Array),
        expect.any(Number),
      );
    });

    it('returns empty set when no intercity routes in DB', async () => {
      queryChain.where.mockResolvedValue([]);

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
      queryChain.where.mockResolvedValue([
        { routeId: 'T1', routeShortName: 'T1', routeColor: '009B77' },
        { routeId: 'BMT_1', routeShortName: 'BMT', routeColor: null },
      ]);

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
      queryChain.where.mockResolvedValue([]);

      const result = await service.getRouteMetadataMap();

      expect(result).toEqual(new Map());
    });
  });
});
