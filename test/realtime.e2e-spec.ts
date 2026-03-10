/**
 * Realtime & Disruptions endpoint integration tests.
 *
 * Uses isolated NestJS test modules (no real DB / Redis) with mocked service
 * dependencies so tests are fast and hermetic. The real ApiKeyGuard is wired
 * in so authentication behaviour is exercised against our mock ApiKeyService.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { RealtimeController } from '../src/realtime/realtime.controller';
import { RealtimeService } from '../src/realtime/realtime.service';
import { DisruptionsController } from '../src/disruptions/disruptions.controller';
import { DisruptionsService } from '../src/disruptions/disruptions.service';
import { ApiKeyGuard } from '../src/auth/guards/api-key.guard';
import { ApiKeyService } from '../src/auth/api-key.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';

const TEST_KEY = 'nsw_testkey0000000000000000000000000000000000000000000000000000';

// ─── Mock data ───────────────────────────────────────────────────────────────

const mockVehicles = [
  {
    vehicleId: 'V001',
    latitude: -33.865,
    longitude: 151.209,
    bearing: 270,
    speed: 20,
    tripId: 'TRIP-001',
    routeId: 'T1',
    directionId: 0,
    currentStatus: 'IN_TRANSIT_TO',
    occupancyStatus: 'MANY_SEATS_AVAILABLE',
    timestamp: 1700000000,
    mode: 'sydneytrains',
    trackDirection: 'DOWN',
    vehicleModel: 'Waratah A',
    airConditioned: true,
    wheelchairAccessible: 1,
    consist: [
      { positionInConsist: 1, occupancyStatus: 'MANY_SEATS_AVAILABLE', quietCarriage: false },
      { positionInConsist: 2, occupancyStatus: 'FEW_SEATS_AVAILABLE', quietCarriage: true },
    ],
  },
];

const mockTripUpdates = [
  {
    tripId: 'TRIP-001',
    routeId: 'T1',
    vehicleId: 'V001',
    vehicleLabel: 'Set 42',
    directionId: 0,
    delay: 120,
    timestamp: 1700000000,
    mode: 'sydneytrains',
    stopTimeUpdates: [
      {
        stopSequence: 1,
        stopId: 'Central',
        arrivalDelay: 120,
        departureDelay: 90,
        departureOccupancyStatus: 'MANY_SEATS_AVAILABLE',
        carriagePredictiveOccupancy: [
          { positionInConsist: 1, occupancyStatus: 'MANY_SEATS_AVAILABLE' },
        ],
      },
    ],
  },
];

const mockAlerts = [
  {
    id: 'A001',
    headerText: 'Track work on T1',
    descriptionText: 'Bus replacement in effect between Central and Parramatta',
    ttsHeaderText: 'Track work on T1 line',
    ttsDescriptionText: 'Buses are replacing trains between Central and Parramatta',
    url: 'https://transportnsw.info/alerts/1',
    cause: 'MAINTENANCE',
    effect: 'REDUCED_SERVICE',
    severityLevel: 'WARNING',
    activePeriods: [{ start: 1700000000, end: 1700007200 }],
    informedEntities: [{ routeId: 'T1', directionId: 0, routeType: 2 }],
    mode: 'sydneytrains',
  },
];

// ─── Test helpers ────────────────────────────────────────────────────────────

function buildMockApiKeyService() {
  return {
    verifyApiKey: jest.fn(async (key: string) =>
      key === TEST_KEY
        ? { valid: true, userId: 'user-test', keyId: 'key-test' }
        : { valid: false },
    ),
  };
}

// ─── Realtime endpoints ───────────────────────────────────────────────────────

describe('Realtime endpoints (e2e)', () => {
  let app: INestApplication;

  const mockRealtimeService = {
    getVehiclePositions: jest.fn().mockResolvedValue(mockVehicles),
    getTripUpdates: jest.fn().mockResolvedValue(mockTripUpdates),
    trackTrip: jest.fn().mockImplementation(async (tripId: string) => {
      if (tripId === 'TRIP-001') {
        return {
          tripId: 'TRIP-001',
          routeId: 'T1',
          vehicleId: 'V001',
          vehicleLabel: 'Set 42',
          mode: 'sydneytrains',
          scheduleRelationship: 'SCHEDULED',
          delay: 120,
          position: {
            latitude: -33.865,
            longitude: 151.209,
            bearing: 270,
            speed: 20,
            currentStatus: 'IN_TRANSIT_TO',
            currentStopId: 'Central',
            occupancyStatus: 'MANY_SEATS_AVAILABLE',
            trackDirection: 'DOWN',
          },
          stopTimeUpdates: [
            {
              stopSequence: 1,
              stopId: 'Central',
              arrivalDelay: 120,
              departureDelay: 90,
              departureOccupancyStatus: 'MANY_SEATS_AVAILABLE',
            },
          ],
          vehicleModel: 'Waratah A',
          airConditioned: true,
          wheelchairAccessible: 1,
        };
      }
      return null;
    }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [RealtimeController],
      providers: [
        { provide: RealtimeService, useValue: mockRealtimeService },
        { provide: ApiKeyService, useValue: buildMockApiKeyService() },
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

  // ── Auth enforcement ────────────────────────────────────────────────────────

  it('GET /api/v1/realtime/vehicles → 401 without API key', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/realtime/vehicles')
      .expect(401);
    expect(res.body.statusCode).toBe(401);
    expect(res.body.message).toMatch(/API-Key|Bearer|Provide/);
  });

  it('GET /api/v1/realtime/vehicles → 401 with invalid API key', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/realtime/vehicles')
      .set('X-API-Key', 'nsw_wrong')
      .expect(401);
  });

  // ── Vehicle positions ───────────────────────────────────────────────────────

  it('GET /api/v1/realtime/vehicles → 200 with valid key, returns array', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/realtime/vehicles')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });

  it('GET /api/v1/realtime/vehicles → response includes standard fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/realtime/vehicles')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    const v = res.body[0];
    expect(v.vehicleId).toBe('V001');
    expect(v.latitude).toBeCloseTo(-33.865, 2);
    expect(v.longitude).toBeCloseTo(151.209, 2);
    expect(v.tripId).toBe('TRIP-001');
    expect(v.routeId).toBe('T1');
    expect(v.mode).toBe('sydneytrains');
  });

  it('GET /api/v1/realtime/vehicles → response includes TfNSW extension fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/realtime/vehicles')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    const v = res.body[0];
    // NSW extension: trackDirection, vehicleModel, airConditioned, consist
    expect(v.trackDirection).toBe('DOWN');
    expect(v.vehicleModel).toBe('Waratah A');
    expect(v.airConditioned).toBe(true);
    expect(v.wheelchairAccessible).toBe(1);
    expect(Array.isArray(v.consist)).toBe(true);
    expect(v.consist).toHaveLength(2);
    expect(v.consist[0].positionInConsist).toBe(1);
    expect(v.consist[0].occupancyStatus).toBe('MANY_SEATS_AVAILABLE');
    expect(v.consist[1].quietCarriage).toBe(true);
  });

  it('GET /api/v1/realtime/vehicles?mode=buses → passes mode to service', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/realtime/vehicles?mode=buses')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(mockRealtimeService.getVehiclePositions).toHaveBeenCalledWith('buses');
  });

  // ── Track trip ──────────────────────────────────────────────────────────────

  it('GET /api/v1/realtime/track-trip → 401 without API key', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/realtime/track-trip?tripId=TRIP-001')
      .expect(401);
  });

  it('GET /api/v1/realtime/track-trip → 200 with known tripId', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/realtime/track-trip?tripId=TRIP-001')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(res.body.tripId).toBe('TRIP-001');
    expect(res.body.routeId).toBe('T1');
    expect(res.body.mode).toBe('sydneytrains');
    expect(res.body.delay).toBe(120);
  });

  it('GET /api/v1/realtime/track-trip → 200 includes live position', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/realtime/track-trip?tripId=TRIP-001')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(res.body.position.latitude).toBeCloseTo(-33.865, 2);
    expect(res.body.position.longitude).toBeCloseTo(151.209, 2);
    expect(res.body.position.bearing).toBe(270);
    expect(res.body.position.currentStatus).toBe('IN_TRANSIT_TO');
    expect(res.body.position.trackDirection).toBe('DOWN');
  });

  it('GET /api/v1/realtime/track-trip → 200 includes NSW vehicle amenity info', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/realtime/track-trip?tripId=TRIP-001')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(res.body.vehicleModel).toBe('Waratah A');
    expect(res.body.airConditioned).toBe(true);
    expect(res.body.wheelchairAccessible).toBe(1);
  });

  it('GET /api/v1/realtime/track-trip → 200 includes stopTimeUpdates', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/realtime/track-trip?tripId=TRIP-001')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(Array.isArray(res.body.stopTimeUpdates)).toBe(true);
    const stu = res.body.stopTimeUpdates[0];
    expect(stu.stopId).toBe('Central');
    expect(stu.arrivalDelay).toBe(120);
    expect(stu.departureOccupancyStatus).toBe('MANY_SEATS_AVAILABLE');
  });

  it('GET /api/v1/realtime/track-trip → 404 for unknown tripId', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/realtime/track-trip?tripId=UNKNOWN-TRIP')
      .set('X-API-Key', TEST_KEY)
      .expect(404);

    expect(res.body.message).toContain('UNKNOWN-TRIP');
  });

  it('GET /api/v1/realtime/track-trip?mode=sydneytrains → passes mode hint to service', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/realtime/track-trip?tripId=TRIP-001&mode=sydneytrains')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(mockRealtimeService.trackTrip).toHaveBeenCalledWith(
      'TRIP-001',
      'sydneytrains',
    );
  });

  // ── Trip updates ────────────────────────────────────────────────────────────

  it('GET /api/v1/realtime/trip-updates → 401 without API key', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/realtime/trip-updates')
      .expect(401);
  });

  it('GET /api/v1/realtime/trip-updates → 200, returns trip update array', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/realtime/trip-updates')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const tu = res.body[0];
    expect(tu.tripId).toBe('TRIP-001');
    expect(tu.delay).toBe(120);
    expect(Array.isArray(tu.stopTimeUpdates)).toBe(true);
  });

  it('GET /api/v1/realtime/trip-updates → includes NSW extension fields in STUs', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/realtime/trip-updates')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    const stu = res.body[0].stopTimeUpdates[0];
    expect(stu.departureOccupancyStatus).toBe('MANY_SEATS_AVAILABLE');
    expect(Array.isArray(stu.carriagePredictiveOccupancy)).toBe(true);
    expect(stu.carriagePredictiveOccupancy[0].positionInConsist).toBe(1);
  });
});

// ─── Disruptions endpoints ────────────────────────────────────────────────────

describe('Disruptions endpoints (e2e)', () => {
  let app: INestApplication;

  const mockDisruptionsService = {
    getDisruptions: jest.fn().mockResolvedValue(mockAlerts),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DisruptionsController],
      providers: [
        { provide: DisruptionsService, useValue: mockDisruptionsService },
        { provide: ApiKeyService, useValue: buildMockApiKeyService() },
        { provide: APP_GUARD, useClass: ApiKeyGuard },
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
        Reflector,
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /api/v1/disruptions → 401 without API key', async () => {
    await request(app.getHttpServer()).get('/api/v1/disruptions').expect(401);
  });

  it('GET /api/v1/disruptions → 200, returns alert array', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/disruptions')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });

  it('GET /api/v1/disruptions → response includes standard alert fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/disruptions')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    const a = res.body[0];
    expect(a.id).toBe('A001');
    expect(a.headerText).toBe('Track work on T1');
    expect(a.cause).toBe('MAINTENANCE');
    expect(a.effect).toBe('REDUCED_SERVICE');
    expect(Array.isArray(a.activePeriods)).toBe(true);
    expect(a.activePeriods[0].start).toBe(1700000000);
    expect(a.informedEntities[0].routeId).toBe('T1');
    expect(a.informedEntities[0].directionId).toBe(0);
  });

  it('GET /api/v1/disruptions → response includes TfNSW extension fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/disruptions')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    const a = res.body[0];
    expect(a.severityLevel).toBe('WARNING');
    expect(a.ttsHeaderText).toBe('Track work on T1 line');
    expect(a.ttsDescriptionText).toContain('Buses are replacing');
    expect(a.url).toBe('https://transportnsw.info/alerts/1');
  });

  it('GET /api/v1/disruptions?mode=sydneytrains → passes mode to service', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/disruptions?mode=sydneytrains')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(mockDisruptionsService.getDisruptions).toHaveBeenCalledWith(
      'sydneytrains',
      undefined,
    );
  });

  it('GET /api/v1/disruptions?effect=NO_SERVICE → passes effect filter to service', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/disruptions?effect=NO_SERVICE')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(mockDisruptionsService.getDisruptions).toHaveBeenCalledWith(
      undefined,
      'NO_SERVICE',
    );
  });
});
