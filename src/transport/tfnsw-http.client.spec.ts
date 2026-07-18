import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { of } from 'rxjs';
import { TfnswHttpClient } from './tfnsw-http.client';

describe('TfnswHttpClient', () => {
  let client: TfnswHttpClient;
  let http: { get: jest.Mock; head: jest.Mock };

  beforeEach(async () => {
    http = {
      get: jest.fn(),
      head: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TfnswHttpClient,
        { provide: HttpService, useValue: http },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'transport.baseUrl') {
                return 'https://api.transport.nsw.gov.au';
              }
              if (key === 'transport.apiKey') return 'realtime-key';
              if (key === 'transport.staticApiKey') return 'static-key';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    client = module.get(TfnswHttpClient);
  });

  it('uses dedicated static key for schedule HEAD', async () => {
    http.head.mockReturnValue(
      of({
        status: 200,
        headers: { 'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT' },
        data: '',
      }),
    );

    const result = await client.head(
      'https://api.transport.nsw.gov.au/v1/gtfs/schedule/sydneytrains',
      'static',
    );

    expect(result.lastModified).toBe('Wed, 01 Jan 2025 00:00:00 GMT');
    expect(http.head).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Authorization: 'apikey static-key' },
      }),
    );
  });

  it('uses realtime key for getRealtime', async () => {
    http.get.mockReturnValue(
      of({ status: 200, headers: {}, data: Buffer.from('ok') }),
    );

    await client.getRealtime('https://api.transport.nsw.gov.au/v2/gtfs/alerts/metro', {
      responseType: 'arraybuffer',
    });

    expect(http.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'apikey realtime-key',
        }),
      }),
    );
  });

  it('retries on 403 over rate limit then succeeds', async () => {
    http.get
      .mockReturnValueOnce(
        of({
          status: 403,
          headers: { 'x-error-detail': 'Account Over Rate Limit' },
          data: { message: 'Account over rate limit' },
        }),
      )
      .mockReturnValueOnce(
        of({
          status: 200,
          headers: {},
          data: Buffer.from('zip'),
        }),
      );

    const result = await client.getScheduleZip(
      'https://api.transport.nsw.gov.au/v1/gtfs/schedule/sydneytrains',
    );

    expect(result.data.toString()).toBe('zip');
    expect(http.get).toHaveBeenCalledTimes(2);
  }, 15_000);

  it('fails fast on quota exhausted', async () => {
    http.get.mockReturnValue(
      of({
        status: 403,
        headers: { 'x-error-detail': 'Account Over Quota Limit' },
        data: { message: 'Account over quota limit' },
      }),
    );

    await expect(
      client.getScheduleZip(
        'https://api.transport.nsw.gov.au/v1/gtfs/schedule/sydneytrains',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('normalizes apikey-prefixed env values', () => {
    expect(client.normalizeApiKey('  apikey abc123  ')).toBe('abc123');
    expect(client.normalizeApiKey('"quoted-key"')).toBe('quoted-key');
  });
});
