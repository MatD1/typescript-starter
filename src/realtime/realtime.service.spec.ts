import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeService } from './realtime.service';
import { GtfsRealtimeService } from '../transport/gtfs-realtime.service';
import { CacheService } from '../cache/cache.service';
import type { VehiclePosition, TripUpdate } from '../transport/nsw-gtfs-rt.types';

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

/** Passthrough cache — always calls the factory and returns its value */
const mockCacheService = {
  getOrSet: jest.fn(async (_key: string, factory: () => unknown) => factory()),
};

describe('RealtimeService', () => {
  let service: RealtimeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeService,
        { provide: GtfsRealtimeService, useValue: mockGtfsRt },
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

    it('passes NSW extension fields (consist, trackDirection) through unchanged', async () => {
      const vehicleWithExtensions: VehiclePosition = {
        ...baseVehicle,
        trackDirection: 'UP',
        vehicleModel: 'Waratah A',
        airConditioned: true,
        consist: [{ positionInConsist: 1, occupancyStatus: 'EMPTY', quietCarriage: true }],
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
});
