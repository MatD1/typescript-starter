import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TripPlannerService } from './trip-planner.service';
import { TransportService } from '../transport/transport.service';
import { GtfsStaticService } from '../gtfs-static/gtfs-static.service';
import { CacheService } from '../cache/cache.service';

describe('TripPlannerService.findStops validation', () => {
  let service: TripPlannerService;

  const mockTransportService = {
    getStopFinder: jest.fn(),
  };

  const mockGtfsStaticService = {
    getRouteMetadataMap: jest.fn().mockResolvedValue(new Map()),
  };

  const mockCacheService = {
    getOrSet: jest.fn((_key: string, fn: () => Promise<unknown>) => fn()),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripPlannerService,
        { provide: TransportService, useValue: mockTransportService },
        { provide: GtfsStaticService, useValue: mockGtfsStaticService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<TripPlannerService>(TripPlannerService);
  });

  it('throws BadRequestException when type=stop and query is not a stop ID', async () => {
    await expect(
      service.findStops({ name_sf: 'Central', type_sf: 'stop' }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.findStops({ name_sf: 'Central', type_sf: 'stop' }),
    ).rejects.toThrow(/stop ID/);

    expect(mockTransportService.getStopFinder).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when type=coord and query is not lon:lat:EPSG:4326', async () => {
    await expect(
      service.findStops({ name_sf: 'Central', type_sf: 'coord' }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.findStops({ name_sf: 'Central', type_sf: 'coord' }),
    ).rejects.toThrow(/lon:lat:EPSG:4326/);

    expect(mockTransportService.getStopFinder).not.toHaveBeenCalled();
  });

  it('passes validation when type=stop and query is a numeric stop ID', async () => {
    mockTransportService.getStopFinder.mockResolvedValue({ locations: [] });

    await service.findStops({ name_sf: '200060', type_sf: 'stop' });

    expect(mockTransportService.getStopFinder).toHaveBeenCalledWith(
      expect.objectContaining({ name_sf: '200060', type_sf: 'stop' }),
    );
  });

  it('passes validation when type=coord and query matches lon:lat:EPSG:4326', async () => {
    mockTransportService.getStopFinder.mockResolvedValue({ locations: [] });

    await service.findStops({
      name_sf: '151.206:-33.884:EPSG:4326',
      type_sf: 'coord',
    });

    expect(mockTransportService.getStopFinder).toHaveBeenCalledWith(
      expect.objectContaining({
        name_sf: '151.206:-33.884:EPSG:4326',
        type_sf: 'coord',
      }),
    );
  });

  it('passes validation when type=any (default for name search)', async () => {
    mockTransportService.getStopFinder.mockResolvedValue({ locations: [] });

    await service.findStops({ name_sf: 'Wynyard' });

    expect(mockTransportService.getStopFinder).toHaveBeenCalledWith(
      expect.objectContaining({ name_sf: 'Wynyard' }),
    );
  });
});
