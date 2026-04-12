import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeService } from './realtime.service';
import { GtfsRealtimeService } from '../transport/gtfs-realtime.service';
import { GtfsStaticService } from '../gtfs-static/gtfs-static.service';
import { CacheService } from '../cache/cache.service';
import { HeadwayStatus } from './dto/headway.object';

describe('RealtimeService (Headway)', () => {
    let service: RealtimeService;

    const mockGtfsRt = {
        getVehiclePositions: jest.fn(),
    };

    const mockGtfsStatic = {
        getIntercityRouteIds: jest.fn().mockResolvedValue(new Set()),
        getRouteMetadataMap: jest.fn().mockResolvedValue(new Map()),
    };

    const mockCacheService = {
        getOrSet: jest.fn(async (_key, factory) => factory()),
    };

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
    });

    describe('getHeadwayGroups', () => {
        it('groups vehicles by routeId and directionId', async () => {
            mockGtfsRt.getVehiclePositions.mockResolvedValue([
                { vehicleId: 'V1', routeId: 'R1', directionId: 0, timestamp: 1000, latitude: 0, longitude: 0 },
                { vehicleId: 'V2', routeId: 'R1', directionId: 1, timestamp: 1000, latitude: 0, longitude: 0 },
                { vehicleId: 'V3', routeId: 'R2', directionId: 0, timestamp: 1000, latitude: 0, longitude: 0 },
            ]);

            const result = await service.getHeadwayGroups('sydneytrains');
            expect(result).toHaveLength(3);
            expect(result.find(r => r.routeId === 'R1' && r.directionId === 0)).toBeDefined();
            expect(result.find(r => r.routeId === 'R1' && r.directionId === 1)).toBeDefined();
            expect(result.find(r => r.routeId === 'R2' && r.directionId === 0)).toBeDefined();
        });

        it('calculates bunched status (< 3m)', async () => {
            mockGtfsRt.getVehiclePositions.mockResolvedValue([
                { vehicleId: 'V1', routeId: 'R1', directionId: 0, timestamp: 1000, latitude: 0, longitude: 0 },
                { vehicleId: 'V2', routeId: 'R1', directionId: 0, timestamp: 1100, latitude: 0, longitude: 0 }, // 100s gap
            ]);

            const result = await service.getHeadwayGroups('sydneytrains');
            const group = result.find(r => r.routeId === 'R1');
            expect(group?.vehicles[1].status).toBe(HeadwayStatus.BUNCHED);
            expect(group?.vehicles[1].gapSeconds).toBe(100);
        });

        it('calculates healthy status (7-15m)', async () => {
            mockGtfsRt.getVehiclePositions.mockResolvedValue([
                { vehicleId: 'V1', routeId: 'R1', directionId: 0, timestamp: 1000, latitude: 0, longitude: 0 },
                { vehicleId: 'V2', routeId: 'R1', directionId: 0, timestamp: 1600, latitude: 0, longitude: 0 }, // 600s gap
            ]);

            const result = await service.getHeadwayGroups('sydneytrains');
            const group = result.find(r => r.routeId === 'R1');
            expect(group?.vehicles[1].status).toBe(HeadwayStatus.HEALTHY);
            expect(group?.vehicles[1].gapSeconds).toBe(600);
        });

        it('uses haversine fallback when timestamps are missing', async () => {
            mockGtfsRt.getVehiclePositions.mockResolvedValue([
                { vehicleId: 'V1', routeId: 'R1', directionId: 0, latitude: -33.865, longitude: 151.21 }, // Central
                { vehicleId: 'V2', routeId: 'R1', directionId: 0, latitude: -33.882, longitude: 151.20 }, // Redfern (~2km away)
            ]);

            const result = await service.getHeadwayGroups('sydneytrains');
            const group = result.find(r => r.routeId === 'R1');
            // 2km @ 40km/h = 2/40 = 0.05 hours = 180 seconds
            expect(group?.vehicles[1].gapSeconds).toBeGreaterThan(150);
            expect(group?.vehicles[1].gapSeconds).toBeLessThan(300);
        });

        it('sorts vehicles by timestamp to identify leading/trailing correctly', async () => {
            mockGtfsRt.getVehiclePositions.mockResolvedValue([
                { vehicleId: 'V2', routeId: 'R1', directionId: 0, timestamp: 1500, latitude: 0, longitude: 0 },
                { vehicleId: 'V1', routeId: 'R1', directionId: 0, timestamp: 1000, latitude: 0, longitude: 0 },
            ]);

            const result = await service.getHeadwayGroups('sydneytrains');
            const group = result.find(r => r.routeId === 'R1');
            expect(group?.vehicles[0].vehicleId).toBe('V1'); // Oldest first
            expect(group?.vehicles[1].vehicleId).toBe('V2');
            expect(group?.vehicles[1].gapSeconds).toBe(500);
        });
    });
});
