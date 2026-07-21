import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeService } from './realtime.service';
import { GtfsRealtimeService } from '../transport/gtfs-realtime.service';
import { GtfsStaticService } from '../gtfs-static/gtfs-static.service';
import { CacheService } from '../cache/cache.service';
import type {
  VehiclePosition,
  TripUpdate,
} from '../transport/nsw-gtfs-rt.types';

const baseVehicle: VehiclePosition = {
  vehicleId: 'V1',
  latitude: -33.865,
  longitude: 151.21,
};

const baseTrip: TripUpdate = {
  tripId: 'TRIP1',
  stopTimeUpdates: [],
};

const mockGtfsRt = {
  getVehiclePositions: jest.fn(),
  getTripUpdates: jest.fn(),
};

const mockGtfsStatic = {
  getIntercityRouteIds: jest.fn().mockResolvedValue(new Set<string>()),
  getRouteMetadataMap: jest
    .fn()
    .mockResolvedValue(
      new Map<string, { lineCode: string; routeColour?: string }>(),
    ),
  getStopTimes: jest
    .fn()
    .mockResolvedValue({ data: [], total: 0, limit: 1000, offset: 0, hasNextPage: false }),
};

/** Passthrough cache — always calls the factory and returns its value */
const mockCacheService = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  getOrSet: jest.fn(async (_key: string, factory: () => unknown) => factory()),
};

describe('RealtimeService', () => {
  let service: RealtimeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeService,
        { provide: GtfsRealtimeService, useValue: mockGtfsRt },
        { provide: GtfsStaticService, useValue: mockGtfsStatic },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<RealtimeService>(RealtimeService);
    jest.clearAllMocks();
  });

  describe('getVehiclePositions', () => {
    it('returns vehicles with mode field attached', async () => {
      mockGtfsRt.getVehiclePositions.mockResolvedValue([baseVehicle]);

      const results = await service.getVehiclePositions('sydneytrains');
      expect(results).toHaveLength(1);
      expect(results[0].mode).toBe('sydneytrains');
      expect(results[0].vehicleId).toBe('V1');
    });

    it('adds lineCode and routeColour when route matches gtfs_routes', async () => {
      mockGtfsStatic.getRouteMetadataMap.mockResolvedValue(
        new Map([['T1', { lineCode: 'T1', routeColour: '009B77' }]]),
      );
      mockGtfsRt.getVehiclePositions.mockResolvedValue([
        { ...baseVehicle, routeId: 'T1', vehicleId: 'V1' },
      ]);

      const results = await service.getVehiclePositions('sydneytrains');

      expect(results[0].lineCode).toBe('T1');
      expect(results[0].routeColour).toBe('009B77');
    });

    it('aggregates results across all modes when no mode specified', async () => {
      mockGtfsRt.getVehiclePositions.mockResolvedValue([baseVehicle]);

      const results = await service.getVehiclePositions();
      // Should have one result per transport mode (7 modes), each with a mode field
      expect(results.length).toBeGreaterThan(1);
      const modes = new Set(results.map((r) => r.mode));
      expect(modes.size).toBeGreaterThan(1);
    });

    it('skips modes that fail and returns the rest', async () => {
      mockGtfsRt.getVehiclePositions
        .mockResolvedValueOnce([baseVehicle]) // sydneytrains succeeds
        .mockRejectedValue(new Error('API unavailable')); // all others fail

      const results = await service.getVehiclePositions();
      // Should still return the one that succeeded
      expect(results.length).toBe(1);
      expect(results[0].mode).toBe('sydneytrains');
    });

    it('filters sydneytrains by intercity routes when mode=intercity', async () => {
      mockGtfsStatic.getIntercityRouteIds.mockResolvedValue(
        new Set(['BMT_1', 'CCN_1']),
      );
      mockGtfsStatic.getRouteMetadataMap.mockResolvedValue(
        new Map([['BMT_1', { lineCode: 'BMT', routeColour: 'FF6600' }]]),
      );
      mockGtfsRt.getVehiclePositions.mockResolvedValue([
        { ...baseVehicle, routeId: 'BMT_1', vehicleId: 'V-IC' },
        { ...baseVehicle, routeId: 'T1', vehicleId: 'V-SYD' },
      ]);

      const results = await service.getVehiclePositions('intercity');

      expect(mockGtfsRt.getVehiclePositions).toHaveBeenCalledWith(
        'sydneytrains',
      );
      expect(results).toHaveLength(1);
      expect(results[0].routeId).toBe('BMT_1');
      expect(results[0].mode).toBe('intercity');
      expect(results[0].lineCode).toBe('BMT');
      expect(results[0].routeColour).toBe('FF6600');
    });

    it('passes NSW extension fields (consist, trackDirection) through unchanged', async () => {
      const vehicleWithExtensions: VehiclePosition = {
        ...baseVehicle,
        trackDirection: 'UP',
        vehicleModel: 'Waratah A',
        airConditioned: true,
        consist: [
          {
            positionInConsist: 1,
            occupancyStatus: 'EMPTY',
            quietCarriage: true,
          },
        ],
      };
      mockGtfsRt.getVehiclePositions.mockResolvedValue([vehicleWithExtensions]);

      const results = await service.getVehiclePositions('sydneytrains');
      const v = results[0];
      expect(v.trackDirection).toBe('UP');
      expect(v.vehicleModel).toBe('Waratah A');
      expect(v.airConditioned).toBe(true);
      expect(v.consist).toHaveLength(1);
      expect(v.consist![0].quietCarriage).toBe(true);
    });
  });

  describe('getTripUpdates', () => {
    it('returns trip updates with mode field attached', async () => {
      mockGtfsRt.getTripUpdates.mockResolvedValue([baseTrip]);

      const results = await service.getTripUpdates('metro');
      expect(results).toHaveLength(1);
      expect(results[0].mode).toBe('metro');
      expect(results[0].tripId).toBe('TRIP1');
    });

    it('passes NSW delay field through unchanged', async () => {
      const tripWithDelay: TripUpdate = { ...baseTrip, delay: 180 };
      mockGtfsRt.getTripUpdates.mockResolvedValue([tripWithDelay]);

      const results = await service.getTripUpdates('sydneytrains');
      expect(results[0].delay).toBe(180);
    });

    it('filters sydneytrains by intercity routes when mode=intercity', async () => {
      mockGtfsStatic.getIntercityRouteIds.mockResolvedValue(
        new Set(['BMT_1', 'CCN_1']),
      );
      mockGtfsStatic.getRouteMetadataMap.mockResolvedValue(
        new Map([['BMT_1', { lineCode: 'BMT', routeColour: 'FF6600' }]]),
      );
      mockGtfsRt.getTripUpdates.mockResolvedValue([
        { ...baseTrip, tripId: 'T1', routeId: 'BMT_1' },
        { ...baseTrip, tripId: 'T2', routeId: 'T1' },
      ]);

      const results = await service.getTripUpdates('intercity');

      expect(mockGtfsRt.getTripUpdates).toHaveBeenCalledWith('sydneytrains');
      expect(results).toHaveLength(1);
      expect(results[0].routeId).toBe('BMT_1');
      expect(results[0].mode).toBe('intercity');
      expect(results[0].lineCode).toBe('BMT');
      expect(results[0].routeColour).toBe('FF6600');
    });

    it('passes carriagePredictiveOccupancy through unchanged', async () => {
      const tripWithCarriages: TripUpdate = {
        ...baseTrip,
        stopTimeUpdates: [
          {
            stopId: 'S1',
            carriagePredictiveOccupancy: [
              { positionInConsist: 1, occupancyStatus: 'FEW_SEATS_AVAILABLE' },
            ],
          },
        ],
      };
      mockGtfsRt.getTripUpdates.mockResolvedValue([tripWithCarriages]);

      const results = await service.getTripUpdates('sydneytrains');
      const stu = results[0].stopTimeUpdates[0];
      expect(stu.carriagePredictiveOccupancy).toHaveLength(1);
      expect(stu.carriagePredictiveOccupancy![0].occupancyStatus).toBe(
        'FEW_SEATS_AVAILABLE',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────

  describe('trackTrip', () => {
    const vehicleForTrip: VehiclePosition = {
      ...baseVehicle,
      tripId: 'TRIP-LIVE',
      routeId: 'T1',
      vehicleId: 'V42',
      vehicleLabel: 'Set 42',
      bearing: 270,
      speed: 22,
      currentStatus: 'IN_TRANSIT_TO',
      currentStopId: 'Central',
      occupancyStatus: 'MANY_SEATS_AVAILABLE',
      trackDirection: 'DOWN',
      vehicleModel: 'Waratah A',
      airConditioned: true,
      wheelchairAccessible: 1,
      consist: [
        {
          positionInConsist: 1,
          occupancyStatus: 'EMPTY',
          quietCarriage: false,
        },
      ],
    };

    const tripUpdateForTrip: TripUpdate = {
      tripId: 'TRIP-LIVE',
      routeId: 'T1',
      vehicleId: 'V42',
      vehicleLabel: 'Set 42',
      delay: 90,
      scheduleRelationship: 'SCHEDULED',
      stopTimeUpdates: [
        {
          stopId: 'Central',
          stopSequence: 1,
          arrivalDelay: 90,
          departureDelay: 60,
          departureOccupancyStatus: 'MANY_SEATS_AVAILABLE',
        },
      ],
    };

    it('returns null when tripId is not found in any mode', async () => {
      mockGtfsRt.getVehiclePositions.mockResolvedValue([]);
      mockGtfsRt.getTripUpdates.mockResolvedValue([]);

      const result = await service.trackTrip('UNKNOWN-TRIP');
      expect(result).toBeNull();
    });

    it('returns null when tripId is not found with mode hint', async () => {
      mockGtfsRt.getVehiclePositions.mockResolvedValue([]);
      mockGtfsRt.getTripUpdates.mockResolvedValue([]);

      const result = await service.trackTrip('UNKNOWN-TRIP', 'sydneytrains');
      expect(result).toBeNull();
    });

    it('returns TrackedTripObject when vehicle is found by tripId', async () => {
      mockGtfsStatic.getRouteMetadataMap.mockResolvedValue(
        new Map([['T1', { lineCode: 'T1', routeColour: '009B77' }]]),
      );
      mockGtfsRt.getVehiclePositions.mockResolvedValue([vehicleForTrip]);
      mockGtfsRt.getTripUpdates.mockResolvedValue([tripUpdateForTrip]);

      const result = await service.trackTrip('TRIP-LIVE', 'sydneytrains');
      expect(result).not.toBeNull();
      expect(result!.tripId).toBe('TRIP-LIVE');
      expect(result!.mode).toBe('sydneytrains');
      expect(result!.lineCode).toBe('T1');
      expect(result!.routeColour).toBe('009B77');
    });

    it('joins vehicle position data into result', async () => {
      mockGtfsRt.getVehiclePositions.mockResolvedValue([vehicleForTrip]);
      mockGtfsRt.getTripUpdates.mockResolvedValue([tripUpdateForTrip]);

      const result = await service.trackTrip('TRIP-LIVE', 'sydneytrains');
      expect(result!.position).toBeDefined();
      expect(result!.position!.latitude).toBeCloseTo(-33.865, 2);
      expect(result!.position!.bearing).toBe(270);
      expect(result!.position!.currentStatus).toBe('IN_TRANSIT_TO');
      expect(result!.position!.trackDirection).toBe('DOWN');
    });

    it('joins trip update delay + stopTimeUpdates into result', async () => {
      mockGtfsRt.getVehiclePositions.mockResolvedValue([vehicleForTrip]);
      mockGtfsRt.getTripUpdates.mockResolvedValue([tripUpdateForTrip]);

      const result = await service.trackTrip('TRIP-LIVE', 'sydneytrains');
      expect(result!.delay).toBe(90);
      expect(result!.scheduleRelationship).toBe('SCHEDULED');
      expect(result!.stopTimeUpdates).toHaveLength(1);
      expect(result!.stopTimeUpdates![0].stopId).toBe('Central');
      expect(result!.stopTimeUpdates![0].arrivalDelay).toBe(90);
    });

    it('backfills stops the realtime feed has already dropped from the static schedule', async () => {
      mockGtfsRt.getVehiclePositions.mockResolvedValue([vehicleForTrip]);
      mockGtfsRt.getTripUpdates.mockResolvedValue([tripUpdateForTrip]);
      mockGtfsStatic.getStopTimes.mockResolvedValueOnce({
        data: [
          { stopSequence: 1, stopId: 'Central', arrivalTime: '08:00:00', departureTime: '08:01:00' },
          { stopSequence: 2, stopId: 'Redfern', arrivalTime: '08:05:00', departureTime: '08:05:30' },
          { stopSequence: 3, stopId: 'Sydenham', arrivalTime: '08:10:00', departureTime: '08:10:30' },
        ],
        total: 3,
        limit: 1000,
        offset: 0,
        hasNextPage: false,
      });

      const result = await service.trackTrip('TRIP-LIVE', 'sydneytrains', {
        startDate: '20260101',
      });

      // The live feed only reported stop_sequence 1 (Central) — sequences 2
      // and 3 must be backfilled from the static schedule, in order.
      expect(result!.stopTimeUpdates).toHaveLength(3);
      expect(result!.stopTimeUpdates!.map((s) => s.stopId)).toEqual([
        'Central',
        'Redfern',
        'Sydenham',
      ]);
      // The live entry is passed through untouched (still carries its delay).
      expect(result!.stopTimeUpdates![0].arrivalDelay).toBe(90);
      // Backfilled entries are marked SCHEDULED with a real epoch time, no
      // fabricated delay.
      expect(result!.stopTimeUpdates![1].scheduleRelationship).toBe(
        'SCHEDULED',
      );
      expect(result!.stopTimeUpdates![1].arrivalDelay).toBeUndefined();
      expect(result!.stopTimeUpdates![1].departureTime).toEqual(
        expect.any(Number),
      );
    });

    it('falls back to the live-only list if the static schedule lookup fails', async () => {
      mockGtfsRt.getVehiclePositions.mockResolvedValue([vehicleForTrip]);
      mockGtfsRt.getTripUpdates.mockResolvedValue([tripUpdateForTrip]);
      mockGtfsStatic.getStopTimes.mockRejectedValueOnce(new Error('db down'));

      const result = await service.trackTrip('TRIP-LIVE', 'sydneytrains');
      expect(result!.stopTimeUpdates).toHaveLength(1);
      expect(result!.stopTimeUpdates![0].stopId).toBe('Central');
    });

    it('populates NSW vehicle amenity fields', async () => {
      mockGtfsRt.getVehiclePositions.mockResolvedValue([vehicleForTrip]);
      mockGtfsRt.getTripUpdates.mockResolvedValue([tripUpdateForTrip]);

      const result = await service.trackTrip('TRIP-LIVE', 'sydneytrains');
      expect(result!.vehicleModel).toBe('Waratah A');
      expect(result!.airConditioned).toBe(true);
      expect(result!.wheelchairAccessible).toBe(1);
    });

    it('returns result when only vehicle position data is present (no tripUpdate yet)', async () => {
      mockGtfsRt.getVehiclePositions.mockResolvedValue([vehicleForTrip]);
      mockGtfsRt.getTripUpdates.mockResolvedValue([]); // no trip update yet

      const result = await service.trackTrip('TRIP-LIVE', 'sydneytrains');
      expect(result).not.toBeNull();
      expect(result!.tripId).toBe('TRIP-LIVE');
      expect(result!.position).toBeDefined();
      expect(result!.delay).toBeUndefined();
    });

    it('returns result when only tripUpdate is present (vehicle position not broadcasting yet)', async () => {
      mockGtfsRt.getVehiclePositions.mockResolvedValue([]); // no position yet
      mockGtfsRt.getTripUpdates.mockResolvedValue([tripUpdateForTrip]);

      const result = await service.trackTrip('TRIP-LIVE', 'sydneytrains');
      expect(result).not.toBeNull();
      expect(result!.tripId).toBe('TRIP-LIVE');
      expect(result!.position).toBeUndefined();
      expect(result!.delay).toBe(90);
    });

    it('matches the scheduled trip ID when the planner realtime ID differs', async () => {
      mockGtfsRt.getVehiclePositions.mockResolvedValue([
        { ...vehicleForTrip, tripId: 'SCHEDULED-1' },
      ]);
      mockGtfsRt.getTripUpdates.mockResolvedValue([]);

      const result = await service.trackTrip('REALTIME-1', 'sydneytrains', {
        scheduledTripId: 'SCHEDULED-1',
      });

      expect(result?.tripId).toBe('SCHEDULED-1');
      expect(result?.position).toBeDefined();
    });

    it('matches a service by route and start fields when IDs differ', async () => {
      mockGtfsRt.getVehiclePositions.mockResolvedValue([
        {
          ...vehicleForTrip,
          tripId: 'FEED-ID',
          routeId: 'CCN_1',
          startDate: '20260714',
          startTime: '09:00:00',
        },
      ]);
      mockGtfsRt.getTripUpdates.mockResolvedValue([]);

      const result = await service.trackTrip('PLANNER-ID', 'sydneytrains', {
        routeId: 'CCN_1',
        startDate: '20260714',
        startTime: '09:00:00',
      });

      expect(result?.tripId).toBe('FEED-ID');
    });

    it('uses mode and reference fields in the tracking cache key', async () => {
      mockGtfsRt.getVehiclePositions.mockResolvedValue([]);
      mockGtfsRt.getTripUpdates.mockResolvedValue([]);

      await service.trackTrip('TRIP', 'metro', {
        scheduledTripId: 'SCHEDULED',
      });

      expect(mockCacheService.get).toHaveBeenCalledWith(
        expect.stringContaining('realtime:track:metro:TRIP:SCHEDULED'),
      );
    });

    it('searches all modes when no mode hint is provided', async () => {
      // Return data only for metro, not sydneytrains (the first mode)
      mockGtfsRt.getVehiclePositions.mockImplementation(async (m: string) =>
        m === 'metro' ? [{ ...vehicleForTrip, tripId: 'TRIP-LIVE' }] : [],
      );
      mockGtfsRt.getTripUpdates.mockImplementation(async (m: string) =>
        m === 'metro' ? [tripUpdateForTrip] : [],
      );

      const result = await service.trackTrip('TRIP-LIVE');
      expect(result).not.toBeNull();
      expect(result!.mode).toBe('metro');
    });
  });
});
