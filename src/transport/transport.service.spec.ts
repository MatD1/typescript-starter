import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { TransportService } from './transport.service';

describe('TransportService.buildGtfsRtUrl', () => {
  let service: TransportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransportService,
        { provide: HttpService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'transport.baseUrl'
                ? 'https://api.transport.nsw.gov.au'
                : 'test-key',
          },
        },
      ],
    }).compile();

    service = module.get<TransportService>(TransportService);
  });

  // ── Trip updates: v2 modes ─────────────────────────────────────────────────

  it.each(['sydneytrains', 'metro', 'lightrail'] as const)(
    'tripupdates/%s → v2/gtfs/realtime/{mode} path',
    (mode) => {
      const url = service.buildGtfsRtUrl('tripupdates', mode);
      expect(url).toBe(
        `https://api.transport.nsw.gov.au/v2/gtfs/realtime/${mode}`,
      );
    },
  );

  // ── Trip updates: v1 modes ─────────────────────────────────────────────────

  it.each(['buses', 'ferries', 'nswtrains'] as const)(
    'tripupdates/%s → v1/gtfs/realtime/{mode} path',
    (mode) => {
      const url = service.buildGtfsRtUrl('tripupdates', mode);
      expect(url).toBe(
        `https://api.transport.nsw.gov.au/v1/gtfs/realtime/${mode}`,
      );
    },
  );

  it('tripupdates/intercity → v2/gtfs/realtime/sydneytrains (intercity merged into sydneytrains)',
    () => {
      const url = service.buildGtfsRtUrl('tripupdates', 'intercity');
      expect(url).toBe(
        'https://api.transport.nsw.gov.au/v2/gtfs/realtime/sydneytrains',
      );
    },
  );

  // ── Vehicle positions: v2 modes ───────────────────────────────────────────

  it.each(['sydneytrains', 'metro'] as const)(
    'vehiclepos/%s → v2/gtfs/vehiclepos/{mode} path',
    (mode) => {
      const url = service.buildGtfsRtUrl('vehiclepos', mode);
      expect(url).toBe(
        `https://api.transport.nsw.gov.au/v2/gtfs/vehiclepos/${mode}`,
      );
    },
  );

  it('vehiclepos/lightrail → v2/gtfs/vehiclepos/lightrail/innerwest path', () => {
    const url = service.buildGtfsRtUrl('vehiclepos', 'lightrail');
    expect(url).toBe(
      'https://api.transport.nsw.gov.au/v2/gtfs/vehiclepos/lightrail/innerwest',
    );
  });

  // ── Vehicle positions: v1 modes ───────────────────────────────────────────

  it.each(['buses', 'nswtrains'] as const)(
    'vehiclepos/%s → v1/gtfs/vehiclepos/{mode} path',
    (mode) => {
      const url = service.buildGtfsRtUrl('vehiclepos', mode);
      expect(url).toBe(
        `https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/${mode}`,
      );
    },
  );

  it('vehiclepos/intercity → v2/gtfs/vehiclepos/sydneytrains (intercity merged into sydneytrains)',
    () => {
      const url = service.buildGtfsRtUrl('vehiclepos', 'intercity');
      expect(url).toBe(
        'https://api.transport.nsw.gov.au/v2/gtfs/vehiclepos/sydneytrains',
      );
    },
  );

  it('vehiclepos/ferries → v1/gtfs/vehiclepos/ferries/sydneyferries path', () => {
    const url = service.buildGtfsRtUrl('vehiclepos', 'ferries');
    expect(url).toBe(
      'https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/ferries/sydneyferries',
    );
  });

  // ── Alerts: v2 modes ──────────────────────────────────────────────────────

  it.each(['sydneytrains', 'metro', 'lightrail'] as const)(
    'alerts/%s → v2/gtfs/alerts/{mode} path',
    (mode) => {
      const url = service.buildGtfsRtUrl('alerts', mode);
      expect(url).toBe(
        `https://api.transport.nsw.gov.au/v2/gtfs/alerts/${mode}`,
      );
    },
  );

  // ── Alerts: v1 modes ──────────────────────────────────────────────────────

  it.each(['buses', 'ferries', 'nswtrains'] as const)(
    'alerts/%s → v1/gtfs/alerts/{mode} path',
    (mode) => {
      const url = service.buildGtfsRtUrl('alerts', mode);
      expect(url).toBe(
        `https://api.transport.nsw.gov.au/v1/gtfs/alerts/${mode}`,
      );
    },
  );

  it('alerts/intercity → v2/gtfs/alerts/sydneytrains (intercity merged into sydneytrains)',
    () => {
      const url = service.buildGtfsRtUrl('alerts', 'intercity');
      expect(url).toBe(
        'https://api.transport.nsw.gov.au/v2/gtfs/alerts/sydneytrains',
      );
    },
  );
});
