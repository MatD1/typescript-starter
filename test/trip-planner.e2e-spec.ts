/**
 * Trip Planner & Stations endpoint integration tests.
 *
 * Uses isolated NestJS test modules with mocked service dependencies.
 * The real ApiKeyGuard is wired so authentication behaviour is exercised.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { TripPlannerController } from '../src/trip-planner/trip-planner.controller';
import { TripPlannerService } from '../src/trip-planner/trip-planner.service';
import { StationsController } from '../src/stations/stations.controller';
import { StationsService } from '../src/stations/stations.service';
import { ApiKeyGuard } from '../src/auth/guards/api-key.guard';
import { ApiKeyService } from '../src/auth/api-key.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';

const TEST_KEY = 'nsw_testkey0000000000000000000000000000000000000000000000000000';

// ─── Mock data ───────────────────────────────────────────────────────────────

const mockTripPlan = {
  journeys: [
    {
      duration: 1800,
      legs: [
        {
          transportation: { name: 'T1 North Shore & Northern', number: 'T1' },
          origin: { name: 'Central Station', departureTimePlanned: '2024-01-15T08:00:00+11:00' },
          destination: { name: 'Town Hall Station', arrivalTimePlanned: '2024-01-15T08:05:00+11:00' },
        },
      ],
    },
  ],
};

const mockStops = [
  { id: '10101100', name: 'Central Station', lat: -33.8823, lon: 151.2063, type: 'stop' },
  { id: '10101200', name: 'Central Bus Station', lat: -33.8832, lon: 151.2068, type: 'stop' },
];

const mockDepartures = {
  stopEvents: [
    {
      departureTimePlanned: '2024-01-15T08:00:00+11:00',
      departureTimeEstimated: '2024-01-15T08:02:00+11:00',
      transportation: { name: 'T1 North Shore', number: 'T1' },
      location: { name: 'Central Station' },
    },
  ],
};

const mockNearby = {
  locations: [
    { id: '10101100', name: 'Central Station', lat: -33.8823, lon: 151.2063, distance: 120 },
  ],
};

const mockStation = {
  stopId: '10101100',
  name: 'Central Station',
  lat: -33.8823,
  lon: 151.2063,
  routes: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMockApiKeyService() {
  return {
    verifyApiKey: jest.fn(async (key: string) =>
      key === TEST_KEY
        ? { valid: true, userId: 'user-test', keyId: 'key-test' }
        : { valid: false },
    ),
  };
}

// ─── Trip Planner endpoints ───────────────────────────────────────────────────

describe('TripPlanner endpoints (e2e)', () => {
  let app: INestApplication;

  const mockTripPlannerService = {
    planTrip: jest.fn().mockResolvedValue(mockTripPlan),
    findStops: jest.fn().mockResolvedValue(mockStops),
    getDepartures: jest.fn().mockResolvedValue(mockDepartures),
    searchByCoord: jest.fn().mockResolvedValue(mockNearby),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TripPlannerController],
      providers: [
        { provide: TripPlannerService, useValue: mockTripPlannerService },
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

  it('GET /api/v1/trip-planner/trip → 401 without API key', async () => {
    await request(app.getHttpServer()).get('/api/v1/trip-planner/trip').expect(401);
  });

  it('GET /api/v1/trip-planner/stop-finder → 401 without API key', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/trip-planner/stop-finder?query=Central')
      .expect(401);
  });

  it('GET /api/v1/trip-planner/departures → 401 without API key', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/trip-planner/departures')
      .expect(401);
  });

  it('GET /api/v1/trip-planner/nearby → 401 without API key', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/trip-planner/nearby?lat=-33.8&lon=151.2')
      .expect(401);
  });

  // ── Trip planning ───────────────────────────────────────────────────────────

  it('GET /api/v1/trip-planner/trip → 200 with valid key', async () => {
    const res = await request(app.getHttpServer())
      .get(
        '/api/v1/trip-planner/trip' +
          '?originId=10101100&destId=10102100&itdDate=20240115&itdTime=0800',
      )
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(mockTripPlannerService.planTrip).toHaveBeenCalled();
    const callArgs = mockTripPlannerService.planTrip.mock.calls[0][0];
    expect(callArgs.originId).toBe('10101100');
    expect(callArgs.destId).toBe('10102100');
    expect(callArgs.itdDate).toBe('20240115');
  });

  // ── Stop finder ─────────────────────────────────────────────────────────────

  it('GET /api/v1/trip-planner/stop-finder → 200 returns stops', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/trip-planner/stop-finder?query=Central')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(mockTripPlannerService.findStops).toHaveBeenCalledWith(
      expect.objectContaining({ name_sf: 'Central' }),
    );
  });

  it('GET /api/v1/trip-planner/stop-finder → passes type param when query is valid stop ID', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/trip-planner/stop-finder?query=200060&type=stop')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(mockTripPlannerService.findStops).toHaveBeenCalledWith(
      expect.objectContaining({ name_sf: '200060', type_sf: 'stop' }),
    );
  });

  // ── Departures ──────────────────────────────────────────────────────────────

  it('GET /api/v1/trip-planner/departures → 200 with stop id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/trip-planner/departures?stopId=10101100')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(mockTripPlannerService.getDepartures).toHaveBeenCalledWith(
      expect.objectContaining({ name_dm: '10101100', type_dm: 'stop' }),
    );
  });

  // ── Nearby ──────────────────────────────────────────────────────────────────

  it('GET /api/v1/trip-planner/nearby → 200 with lat/lon', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/trip-planner/nearby?lat=-33.865&lon=151.209')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(mockTripPlannerService.searchByCoord).toHaveBeenCalledWith(
      expect.objectContaining({ coord: '151.209:-33.865:EPSG:4326' }),
    );
  });

  it('GET /api/v1/trip-planner/nearby → passes custom radius to service', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/trip-planner/nearby?lat=-33.865&lon=151.209&radius=1000')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(mockTripPlannerService.searchByCoord).toHaveBeenCalledWith(
      expect.objectContaining({ radius_1: 1000 }),
    );
  });
});

// ─── Stations endpoints ───────────────────────────────────────────────────────

describe('Stations endpoints (e2e)', () => {
  let app: INestApplication;

  const mockStationsService = {
    search: jest.fn().mockResolvedValue(mockStops),
    findNearby: jest.fn().mockResolvedValue(mockStops),
    findById: jest.fn().mockImplementation(async (id: string) =>
      id === '10101100' ? mockStation : null,
    ),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [StationsController],
      providers: [
        { provide: StationsService, useValue: mockStationsService },
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

  it('GET /api/v1/stations/search → 401 without API key', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/stations/search?q=Central')
      .expect(401);
  });

  it('GET /api/v1/stations/nearby → 401 without API key', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/stations/nearby?lat=-33.8&lon=151.2')
      .expect(401);
  });

  it('GET /api/v1/stations/:stopId → 401 without API key', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/stations/10101100')
      .expect(401);
  });

  // ── Station search ──────────────────────────────────────────────────────────

  it('GET /api/v1/stations/search?q=Central → 200 returns array', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/stations/search?q=Central')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(mockStationsService.search).toHaveBeenCalledWith('Central', 20);
  });

  it('GET /api/v1/stations/search?q=Central&limit=5 → passes limit to service', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/stations/search?q=Central&limit=5')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(mockStationsService.search).toHaveBeenCalledWith('Central', 5);
  });

  // ── Nearby stations ─────────────────────────────────────────────────────────

  it('GET /api/v1/stations/nearby → 200 with lat/lon', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/stations/nearby?lat=-33.865&lon=151.209')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(mockStationsService.findNearby).toHaveBeenCalledWith(
      -33.865,
      151.209,
      500,
      20,
    );
  });

  it('GET /api/v1/stations/nearby → passes custom radius and limit', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/stations/nearby?lat=-33.865&lon=151.209&radius=1000&limit=10')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(mockStationsService.findNearby).toHaveBeenCalledWith(
      -33.865,
      151.209,
      1000,
      10,
    );
  });

  // ── Station by ID ───────────────────────────────────────────────────────────

  it('GET /api/v1/stations/10101100 → 200 returns station', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/stations/10101100')
      .set('X-API-Key', TEST_KEY)
      .expect(200);

    expect(res.body.stopId).toBe('10101100');
    expect(res.body.name).toBe('Central Station');
  });

  it('GET /api/v1/stations/UNKNOWN → 404 for missing station', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/stations/UNKNOWN')
      .set('X-API-Key', TEST_KEY)
      .expect(404);

    expect(res.body.statusCode).toBe(404);
  });
});
