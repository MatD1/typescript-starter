import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TransportService } from './transport.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { TfnswHttpClient } from './tfnsw-http.client';

describe('TransportService.buildGtfsRtUrl', () => {
  let service: TransportService;
  let tfnsw: { getRealtime: jest.Mock; getApiKey: jest.Mock };

  beforeEach(async () => {
    tfnsw = {
      getRealtime: jest.fn().mockResolvedValue(Buffer.from('feed')),
      getApiKey: jest.fn().mockReturnValue('test-key'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransportService,
        { provide: TfnswHttpClient, useValue: tfnsw },
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

  it('tripupdates/intercity → v2/gtfs/realtime/sydneytrains (intercity merged into sydneytrains)', () => {
    const url = service.buildGtfsRtUrl('tripupdates', 'intercity');
    expect(url).toBe(
      'https://api.transport.nsw.gov.au/v2/gtfs/realtime/sydneytrains',
    );
  });

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

  it('vehiclepos/ferries → v1/gtfs/vehiclepos/ferries/sydneyferries path', () => {
    const url = service.buildGtfsRtUrl('vehiclepos', 'ferries');
    expect(url).toBe(
      'https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/ferries/sydneyferries',
    );
  });

  // ── Alerts ────────────────────────────────────────────────────────────────

  it.each(['buses', 'ferries', 'nswtrains'] as const)(
    'alerts/%s → v1/gtfs/alerts/{mode} path',
    (mode) => {
      const url = service.buildGtfsRtUrl('alerts', mode);
      expect(url).toBe(
        `https://api.transport.nsw.gov.au/v1/gtfs/alerts/${mode}`,
      );
    },
  );

  describe('mapTripParamsToV1', () => {
    it('maps arriveBy to arr depArrMacro', async () => {
      tfnsw.getRealtime.mockResolvedValue({});
      await service.getTripPlan({
        originId: '10101100',
        destId: '10102027',
        itdDate: '20260714',
        itdTime: '0900',
        arriveBy: true,
      });

      expect(tfnsw.getRealtime).toHaveBeenCalledWith(
        expect.stringContaining('/v1/tp/trip'),
        expect.objectContaining({
          params: expect.objectContaining({ depArrMacro: 'arr' }),
        }),
      );
    });
  });

  describe('TfNSW credential handling', () => {
    it('routes realtime requests through the realtime-key gate', async () => {
      await service.getGtfsRealtime('alerts', 'sydneytrains');

      expect(tfnsw.getRealtime).toHaveBeenCalledWith(
        expect.stringContaining('/gtfs/alerts/sydneytrains'),
        expect.objectContaining({ responseType: 'arraybuffer' }),
      );
    });

    it('does not call TfNSW when the key is missing', async () => {
      tfnsw.getApiKey.mockReturnValue('');
      tfnsw.getRealtime.mockRejectedValue(
        new ServiceUnavailableException(
          'TfNSW API credentials are not configured',
        ),
      );

      const unconfigured = new TransportService(
        {
          get: (key: string) =>
            key === 'transport.baseUrl'
              ? 'https://api.transport.nsw.gov.au'
              : undefined,
        } as ConfigService,
        tfnsw as unknown as TfnswHttpClient,
      );

      await expect(
        unconfigured.getGtfsRealtime('alerts', 'buses'),
      ).rejects.toThrow(/not configured/);
    });

    it('propagates ServiceUnavailableException from the gate', async () => {
      tfnsw.getRealtime.mockRejectedValue(
        new ServiceUnavailableException(
          'TfNSW authentication is currently unavailable',
        ),
      );

      await expect(
        service.getGtfsRealtime('alerts', 'buses'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
