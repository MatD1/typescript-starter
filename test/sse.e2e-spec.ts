import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { EventEmitter } from 'events';
import { of } from 'rxjs';

import { RealtimeController } from '../src/realtime/realtime.controller';
import { RealtimeService } from '../src/realtime/realtime.service';
import { VehicleStreamService } from '../src/realtime/vehicle-stream.service';
import { ApiKeyGuard } from '../src/auth/guards/api-key.guard';
import { ApiKeyService } from '../src/auth/api-key.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';

const TEST_KEY = 'nsw_testkey0000000000000000000000000000000000000000000000000000';

describe('SSE endpoints (e2e)', () => {
    let app: INestApplication;
    let mockEmitter: EventEmitter;

    const mockRealtimeService = {
        getVehiclePositions: jest.fn().mockResolvedValue([{ vehicleId: 'V1', mode: 'sydneytrains' }]),
    };

    const mockVehicleStreamService = {
        getEmitter: jest.fn(),
    };

    const mockApiKeyService = {
        verifyApiKey: jest.fn(async (key: string) =>
            key === TEST_KEY
                ? { valid: true, userId: 'user-test', keyId: 'key-test' }
                : { valid: false },
        ),
    };

    beforeAll(async () => {
        mockEmitter = new EventEmitter();
        mockVehicleStreamService.getEmitter.mockReturnValue(mockEmitter);

        const module = await Test.createTestingModule({
            controllers: [RealtimeController],
            providers: [
                { provide: RealtimeService, useValue: mockRealtimeService },
                { provide: VehicleStreamService, useValue: mockVehicleStreamService },
                { provide: ApiKeyService, useValue: mockApiKeyService },
                { provide: APP_GUARD, useClass: ApiKeyGuard },
                { provide: APP_FILTER, useClass: GlobalExceptionFilter },
                Reflector,
            ],
        }).compile();

        app = module.createNestApplication();
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
        await app.init();
    });

    afterAll(() => app.close());

    it('GET /api/v1/realtime/vehicles/stream → returns text/event-stream and initial snapshot', (done) => {
        request(app.getHttpServer())
            .get('/api/v1/realtime/vehicles/stream')
            .set('X-API-Key', TEST_KEY)
            .expect('Content-Type', /text\/event-stream/)
            .expect('Cache-Control', 'no-cache')
            .expect('X-Accel-Buffering', 'no')
            .end((err, res) => {
                if (err) return done(err);
                // The response body in supertest for SSE is a bit weird, 
                // but we can check the text for the initial snapshot.
                expect(res.text).toContain('data: [{"vehicleId":"V1","mode":"sydneytrains"}]');
                done();
            });
    });

    it('GET /api/v1/realtime/vehicles/:mode/stream → returns initial snapshot for mode', (done) => {
        request(app.getHttpServer())
            .get('/api/v1/realtime/vehicles/sydneytrains/stream')
            .set('X-API-Key', TEST_KEY)
            .expect(200)
            .end((err, res) => {
                if (err) return done(err);
                expect(res.text).toContain('data: [{"vehicleId":"V1","mode":"sydneytrains"}]');
                expect(mockRealtimeService.getVehiclePositions).toHaveBeenCalledWith('sydneytrains');
                done();
            });
    });
});
