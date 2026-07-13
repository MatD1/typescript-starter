import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('provides a dependency-free liveness response', () => {
    const controller = new HealthController({ get: jest.fn() } as any);
    expect(controller.live()).toEqual(
      expect.objectContaining({ status: 'ok' }),
    );
  });

  it('reports ready when the TfNSW key is configured', () => {
    const controller = new HealthController({
      get: jest.fn().mockReturnValue('configured-key'),
    } as unknown as ConfigService);
    expect(controller.ready()).toEqual({
      status: 'ready',
      checks: { tfnswApiKeyConfigured: true },
    });
  });

  it('rejects readiness when the TfNSW key is missing', () => {
    const controller = new HealthController({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);
    expect(() => controller.ready()).toThrow(ServiceUnavailableException);
  });
});
