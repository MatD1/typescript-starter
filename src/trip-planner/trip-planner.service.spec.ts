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
    getTripPlan: jest.fn(),
    getDepartureMonitor: jest.fn(),
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

  it('issues a direction-aware earlier token for arrive-by searches', async () => {
    mockTransportService.getTripPlan.mockResolvedValue({
      journeys: [
        {
          legs: [
            {
              origin: { departureTimePlanned: '2026-07-14T08:00:00+10:00' },
              destination: { arrivalTimePlanned: '2026-07-14T09:00:00+10:00' },
              transportation: {},
            },
          ],
        },
      ],
    });

    const response = await service.planTrip({
      originId: '10101100',
      destId: '10102027',
      itdDate: '20260714',
      itdTime: '0900',
      arriveBy: true,
    });

    expect(response.context).toBeDefined();
    const token = JSON.parse(
      Buffer.from(response.context!, 'base64').toString('utf8'),
    );
    expect(token).toEqual({
      itdDate: '20260714',
      itdTime: '0859',
      arriveBy: true,
    });
    expect(response.searchMode).toBe('arrive');
    expect(response.requestedDateTime).toBe('202607140900');
    expect(response.timezone).toBe('Australia/Sydney');
  });

  it('requests six trips by default to avoid the upstream three-trip page', async () => {
    mockTransportService.getTripPlan.mockResolvedValue({ journeys: [] });

    await service.planTrip({
      originId: '10101100',
      destId: '10102027',
    });

    expect(mockTransportService.getTripPlan).toHaveBeenCalledWith(
      expect.objectContaining({ calcNumberOfTrips: 6 }),
    );
  });

  it('rejects a pagination token from the opposite search direction', async () => {
    const context = Buffer.from(
      JSON.stringify({
        itdDate: '20260714',
        itdTime: '0859',
        arriveBy: true,
      }),
    ).toString('base64');

    await expect(
      service.planTrip({ context, arriveBy: false }),
    ).rejects.toThrow(/direction does not match/);
    expect(mockTransportService.getTripPlan).not.toHaveBeenCalled();
  });

  it('rejects incomplete or invalid date/time boundaries', async () => {
    await expect(service.planTrip({ itdDate: '20260714' })).rejects.toThrow(
      /supplied together/,
    );
    await expect(
      service.planTrip({ itdDate: '20260714', itdTime: '2561' }),
    ).rejects.toThrow(/HHmm/);
    expect(mockTransportService.getTripPlan).not.toHaveBeenCalled();
  });

  it('filters departed journeys and sorts departures from the requested time', async () => {
    mockTransportService.getTripPlan.mockResolvedValue({
      journeys: [
        journey('2026-07-14T08:14:00+10:00', '2026-07-14T08:45:00+10:00'),
        journey('2026-07-14T09:10:00+10:00', '2026-07-14T09:40:00+10:00'),
        journey('2026-07-14T09:00:00+10:00', '2026-07-14T09:30:00+10:00'),
      ],
    });

    const response = await service.planTrip({
      itdDate: '20260714',
      itdTime: '0900',
    });

    expect(response.trips).toHaveLength(2);
    expect(response.trips[0].legs[0].departureTimePlanned).toContain('09:00');
    expect(response.trips[1].legs[0].departureTimePlanned).toContain('09:10');
  });

  it('filters late arrivals and orders arrive-by journeys closest first', async () => {
    mockTransportService.getTripPlan.mockResolvedValue({
      journeys: [
        journey('2026-07-14T08:00:00+10:00', '2026-07-14T08:40:00+10:00'),
        journey('2026-07-14T08:10:00+10:00', '2026-07-14T08:55:00+10:00'),
        journey('2026-07-14T08:20:00+10:00', '2026-07-14T09:05:00+10:00'),
      ],
    });

    const response = await service.planTrip({
      itdDate: '20260714',
      itdTime: '0900',
      arriveBy: true,
    });

    expect(response.trips).toHaveLength(2);
    expect(response.trips[0].legs[0].arrivalTimePlanned).toContain('08:55');
    expect(response.trips[1].legs[0].arrivalTimePlanned).toContain('08:40');
  });

  it('returns a server-derived service reference for live tracking', async () => {
    mockTransportService.getTripPlan.mockResolvedValue({
      journeys: [
        {
          legs: [
            {
              origin: { departureTimePlanned: '2026-07-14T09:00:00+10:00' },
              destination: { arrivalTimePlanned: '2026-07-14T10:00:00+10:00' },
              transportation: {
                id: 'SCHEDULED-1',
                number: 'CCN',
                product: { name: 'Train' },
                properties: { RealtimeTripId: 'REALTIME-1' },
              },
            },
          ],
        },
      ],
    });

    const response = await service.planTrip({
      itdDate: '20260714',
      itdTime: '0900',
    });

    expect(response.trips[0].legs[0].serviceRef).toEqual(
      expect.objectContaining({
        realtimeTripId: 'REALTIME-1',
        scheduledTripId: 'SCHEDULED-1',
        mode: 'intercity',
        startDate: '20260714',
        startTime: '09:00:00',
      }),
    );
  });

  it('returns a server-derived service reference for departures', async () => {
    mockTransportService.getDepartureMonitor.mockResolvedValue({
      stopEvents: [
        {
          departureTimePlanned: '2026-07-14T09:00:00+10:00',
          departureTimeEstimated: '2026-07-14T09:01:00+10:00',
          location: { id: '200060', name: 'Central Station' },
          transportation: {
            id: 'SCHEDULED-1',
            number: 'CCN',
            product: { name: 'Train' },
            properties: { RealtimeTripId: 'REALTIME-1' },
          },
        },
      ],
    });

    const response = await service.getDepartures({
      name_dm: '200060',
      type_dm: 'stop',
    });

    expect(response).toHaveLength(1);
    expect(response[0].tripId).toBe('REALTIME-1');
    expect(response[0].serviceRef).toEqual(
      expect.objectContaining({
        realtimeTripId: 'REALTIME-1',
        scheduledTripId: 'SCHEDULED-1',
        mode: 'intercity',
        startDate: '20260714',
        startTime: '09:00:00',
      }),
    );
  });

  it('still derives a service reference when only the scheduled id is known', async () => {
    mockTransportService.getDepartureMonitor.mockResolvedValue({
      stopEvents: [
        {
          departureTimePlanned: '2026-07-14T09:00:00+10:00',
          location: { id: '200060', name: 'Central Station' },
          transportation: {
            id: 'SCHEDULED-2',
            number: 'T1',
            product: { name: 'Train' },
            properties: { RealtimeRouteId: 'NSN' },
          },
        },
      ],
    });

    const response = await service.getDepartures({
      name_dm: '200060',
      type_dm: 'stop',
    });

    expect(response[0].tripId).toBe('SCHEDULED-2');
    expect(response[0].serviceRef).toEqual(
      expect.objectContaining({
        scheduledTripId: 'SCHEDULED-2',
        routeId: 'NSN',
        mode: 'sydneytrains',
        startDate: '20260714',
        startTime: '09:00:00',
      }),
    );
  });
});

function journey(departure: string, arrival: string) {
  return {
    legs: [
      {
        origin: { departureTimePlanned: departure },
        destination: { arrivalTimePlanned: arrival },
        transportation: {},
      },
    ],
  };
}
