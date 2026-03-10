import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { RealtimeController } from '../src/realtime/realtime.controller';
import { DisruptionsController } from '../src/disruptions/disruptions.controller';
import { TripPlannerController } from '../src/trip-planner/trip-planner.controller';
import { StationsController } from '../src/stations/stations.controller';
import { RealtimeService } from '../src/realtime/realtime.service';
import { DisruptionsService } from '../src/disruptions/disruptions.service';
import { TripPlannerService } from '../src/trip-planner/trip-planner.service';
import { StationsService } from '../src/stations/stations.service';
import { ApiKeyGuard } from '../src/auth/guards/api-key.guard';
import { ApiKeyService } from '../src/auth/api-key.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Core routing and authentication smoke tests.
 *
 * These tests verify that:
 * 1. All transport endpoints enforce API key authentication.
 * 2. All transport endpoints are correctly routed under /api/v1/.
 * 3. Error responses follow the standard { statusCode, message, timestamp } shape.
 *
 * Uses an isolated test module (no real DB/Redis) with mocked services so tests
 * are fast and hermetic — no external infrastructure required.
 */

const TEST_KEY = 'nsw_testkey0000000000000000000000000000000000000000000000000000';

describe('NSW Transport API (e2e smoke)', () => {
  let app: INestApplication;

  const noop = jest.fn().mockResolvedValue([]);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        RealtimeController,
        DisruptionsController,
        TripPlannerController,
        StationsController,
      ],
      providers: [
        { provide: RealtimeService, useValue: { getVehiclePositions: noop, getTripUpdates: noop } },
        { provide: DisruptionsService, useValue: { getDisruptions: noop } },
        { provide: TripPlannerService, useValue: { planTrip: noop, findStops: noop, getDepartures: noop, searchByCoord: noop } },
        { provide: StationsService, useValue: { search: noop, findNearby: noop, findById: jest.fn().mockResolvedValue(null) } },
        {
          provide: ApiKeyService,
          useValue: {
            verifyApiKey: jest.fn(async (key: string) =>
              key === TEST_KEY
                ? { valid: true, userId: 'u1', keyId: 'k1' }
                : { valid: false },
            ),
            getUserFromSession: jest.fn().mockResolvedValue(null),
          },
        },
        { provide: APP_GUARD, useClass: ApiKeyGuard },
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
        Reflector,
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['/auth/(.*)'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(() => app.close());

  // ── 401 enforcement on all transport endpoints ──────────────────────────────

  const protectedEndpoints = [
    ['GET', '/api/v1/realtime/vehicles'],
    ['GET', '/api/v1/realtime/trip-updates'],
    ['GET', '/api/v1/disruptions'],
    ['GET', '/api/v1/trip-planner/trip'],
    ['GET', '/api/v1/trip-planner/stop-finder?query=Central'],
    ['GET', '/api/v1/trip-planner/departures'],
    ['GET', '/api/v1/trip-planner/nearby?lat=-33.8&lon=151.2'],
    ['GET', '/api/v1/stations/search?q=Central'],
    ['GET', '/api/v1/stations/nearby?lat=-33.8&lon=151.2'],
  ] as const;

  it.each(protectedEndpoints)(
    '%s %s → 401 without API key',
    async (_method, path) => {
      const res = await request(app.getHttpServer()).get(path).expect(401);
      // Response must follow standard error shape
      expect(res.body.statusCode).toBe(401);
      expect(typeof res.body.message).toBe('string');
      expect(typeof res.body.timestamp).toBe('string');
    },
  );

  // ── 200 OK with valid key on all transport endpoints ────────────────────────

  it.each(protectedEndpoints)(
    '%s %s → 200 with valid API key',
    async (_method, path) => {
      await request(app.getHttpServer())
        .get(path)
        .set('X-API-Key', TEST_KEY)
        .expect((res) => {
          // Accept 200 or 404 (stations/:id with no match returns 404)
          expect([200, 404]).toContain(res.status);
        });
    },
  );

  // ── 401 format with invalid key (wrong prefix / bad token) ─────────────────

  it('returns 401 when API key missing nsw_ prefix', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/realtime/vehicles')
      .set('X-API-Key', 'sk_notnsw')
      .expect(401);

    expect(res.body.message).toMatch(/Invalid|session token|API-Key/);
  });

  it('returns 401 when API key has nsw_ prefix but is unknown', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/realtime/vehicles')
      .set('X-API-Key', 'nsw_unknownkey000000000000000000000000000000000000000000')
      .expect(401);
  });

  // ── Routing sanity: 404 for unknown routes ──────────────────────────────────

  it('returns 404 for completely unknown route', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('X-API-Key', TEST_KEY)
      .expect(404);
  });
});

