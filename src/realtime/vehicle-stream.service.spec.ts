import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter } from 'events';
import { VehicleStreamService } from './vehicle-stream.service';
import { RealtimeService } from './realtime.service';
import { TRANSPORT_MODES } from '../transport/transport.types';

describe('VehicleStreamService', () => {
    let service: VehicleStreamService;
    let mockRealtimeService: jest.Mocked<RealtimeService>;

    beforeEach(async () => {
        mockRealtimeService = {
            getVehiclePositions: jest.fn(),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                VehicleStreamService,
                { provide: RealtimeService, useValue: mockRealtimeService },
            ],
        }).compile();

        service = module.get<VehicleStreamService>(VehicleStreamService);
    });

    describe('emitter initialization', () => {
        it('sets max listeners to 500 for all emitters', () => {
            const keys = [...TRANSPORT_MODES, 'all'];
            for (const key of keys) {
                const emitter = service.getEmitter(key);
                expect(emitter.getMaxListeners()).toBe(500);
            }
        });

        it('returns the "all" emitter by default', () => {
            const emitter = service.getEmitter();
            expect(emitter).toBe(service.getEmitter('all'));
        });
    });

    describe('broadcastMode', () => {
        it('emits vehicle positions for a specific mode', async () => {
            const mockVehicles = [{ vehicleId: 'V1', mode: 'sydneytrains' }];
            mockRealtimeService.getVehiclePositions.mockResolvedValue(mockVehicles as any);

            const modeEmitter = service.getEmitter('sydneytrains');
            const allEmitter = service.getEmitter('all');

            const modeSpy = jest.spyOn(modeEmitter, 'emit');
            const allSpy = jest.spyOn(allEmitter, 'emit');

            // @ts-ignore - access private method for testing
            await service.broadcastMode('sydneytrains');

            const expectedPayload = JSON.stringify(mockVehicles);
            expect(modeSpy).toHaveBeenCalledWith('vehicles', expectedPayload);
            expect(allSpy).toHaveBeenCalledWith('vehicles', expectedPayload, 'sydneytrains');
        });

        it('logs error when broadcast fails', async () => {
            mockRealtimeService.getVehiclePositions.mockRejectedValue(new Error('API Error'));
            const loggerSpy = jest.spyOn((service as any).logger, 'error');

            // @ts-ignore
            await service.broadcastMode('sydneytrains');

            expect(loggerSpy).toHaveBeenCalledWith(
                expect.stringContaining('broadcastMode(sydneytrains) failed: Error: API Error'),
            );
        });
    });

    describe('broadcastAll', () => {
        it('calls broadcastMode for all transport modes', async () => {
            // @ts-ignore
            const broadcastSpy = jest.spyOn(service, 'broadcastMode').mockResolvedValue(undefined);

            await service.broadcastAll();

            expect(broadcastSpy).toHaveBeenCalledTimes(TRANSPORT_MODES.length);
            for (const mode of TRANSPORT_MODES) {
                expect(broadcastSpy).toHaveBeenCalledWith(mode);
            }
        });
    });
});
