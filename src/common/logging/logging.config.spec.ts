import type { IncomingMessage, ServerResponse } from 'http';
import pino, { type LoggerOptions } from 'pino';
import type { Options } from 'pino-http';
import { createLoggerParams, resolveLogLevel } from './logging.config';

describe('logging configuration', () => {
  it('uses safe environment defaults and accepts Nest level aliases', () => {
    expect(resolveLogLevel({ NODE_ENV: 'production' })).toBe('info');
    expect(resolveLogLevel({ NODE_ENV: 'development' })).toBe('debug');
    expect(resolveLogLevel({ LOG_LEVEL: 'log' })).toBe('info');
    expect(resolveLogLevel({ LOG_LEVEL: 'verbose' })).toBe('trace');
    expect(
      resolveLogLevel({ LOG_LEVEL: 'invalid', NODE_ENV: 'production' }),
    ).toBe('info');
  });

  it('emits Railway-compatible production fields without auto request logs', () => {
    const options = createLoggerParams({
      NODE_ENV: 'production',
      RAILWAY_SERVICE_NAME: 'api',
      RAILWAY_ENVIRONMENT_NAME: 'prod',
      RAILWAY_GIT_COMMIT_SHA: 'abc123',
    }).pinoHttp as Options;

    expect(options).toEqual(
      expect.objectContaining({
        level: 'info',
        autoLogging: false,
        messageKey: 'message',
        base: {
          service: 'api',
          environment: 'prod',
          version: 'abc123',
        },
      }),
    );
    expect(options.transport).toBeUndefined();
    expect(options.formatters?.level?.('warn', 40)).toEqual({
      level: 'warn',
    });

    let output = '';
    const logger = pino(options as LoggerOptions, {
      write: (value: string) => {
        output += value;
      },
    });
    logger.info({ requestId: 'request-123' }, 'Ready');
    expect(JSON.parse(output)).toEqual(
      expect.objectContaining({
        level: 'info',
        message: 'Ready',
        requestId: 'request-123',
        service: 'api',
      }),
    );
  });

  it('serializes only minimal request metadata and propagates request IDs', () => {
    const options = createLoggerParams({ NODE_ENV: 'production' })
      .pinoHttp as Options;
    const req = {
      id: 'request-123',
      method: 'GET',
      url: '/trips?token=secret',
      headers: {
        'x-request-id': 'request-123',
        authorization: 'Bearer secret',
        cookie: 'session=secret',
      },
    } as unknown as IncomingMessage;
    const serialized = options.serializers?.req?.(req);

    expect(serialized).toEqual({
      id: 'request-123',
      method: 'GET',
      route: '/trips',
    });
    expect(JSON.stringify(serialized)).not.toContain('secret');

    const res = {
      setHeader: jest.fn(),
    } as unknown as ServerResponse<IncomingMessage>;
    expect(options.genReqId?.(req, res)).toBe('request-123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'request-123');
  });
});
