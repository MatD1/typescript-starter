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

  it.each(['buses', 'ferries', 'nswtrains', 'intercity'] as const)(
    'tripupdates/%s → v1/gtfs/realtime/{mode} path',
    (mode) => {
      const url = service.buildGtfsRtUrl('tripupdates', mode);
      expect(url).toBe(
        `https://api.transport.nsw.gov.au/v1/gtfs/realtime/${mode}`,
      );
    },
  );

  // ── Vehicle positions: always v2, no realtime/ segment ────────────────────

  it.each(['sydneytrains', 'buses', 'metro', 'ferries'] as const)(
    'vehiclepos/%s → v2/gtfs/vehiclepos path (no version split)',
    (mode) => {
      const url = service.buildGtfsRtUrl('vehiclepos', mode);
      expect(url).toBe(
        `https://api.transport.nsw.gov.au/v2/gtfs/vehiclepos/${mode}`,
      );
    },
  );

  // ── Alerts: always v2, no realtime/ segment ───────────────────────────────

  it.each(['sydneytrains', 'buses'] as const)(
    'alerts/%s → v2/gtfs/alerts path',
    (mode) => {
      const url = service.buildGtfsRtUrl('alerts', mode);
      expect(url).toBe(
        `https://api.transport.nsw.gov.au/v2/gtfs/alerts/${mode}`,
      );
    },
  );
});
