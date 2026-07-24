import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AuditContextService } from '../../audit/audit.context';
import type { AuditRequestContext } from '../../audit/audit.types';
import type { DrizzleDB } from '../../database/database.module';
import { RequestLogInterceptor } from './request-log.interceptor';

const auditRequest: AuditRequestContext = {
  requestId: 'request-123',
  source: 'rest',
  method: 'GET',
  route: '/api/v1/stations',
  ipNetwork: '192.168.1.0/24',
  ipFingerprint: 'fingerprint',
  userAgent: 'test-client',
  actor: { type: 'user', id: 'user-123' },
};

function restContext(statusCode = 200): ExecutionContext {
  const req = {
    id: auditRequest.requestId,
    method: 'GET',
    path: '/api/v1/stations',
    ip: '192.168.1.42',
    headers: {
      authorization: 'Bearer secret',
      'x-api-key': 'secret',
      'user-agent': 'test-client',
    },
    user: { userId: 'user-123', keyId: 'key-123' },
  } as unknown as Request;
  const res = { statusCode } as Response;
  return {
    getType: () => 'http',
    switchToHttp: () =>
      ({
        getRequest: () => req,
        getResponse: () => res,
      }) as ReturnType<ExecutionContext['switchToHttp']>,
  } as ExecutionContext;
}

async function settleFireAndForget(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('RequestLogInterceptor', () => {
  let values: jest.Mock;
  let db: DrizzleDB;
  let auditContext: AuditContextService;
  let interceptor: RequestLogInterceptor;

  beforeEach(() => {
    values = jest.fn().mockResolvedValue(undefined);
    db = {
      insert: jest.fn(() => ({ values })),
    } as unknown as DrizzleDB;
    auditContext = new AuditContextService();
    interceptor = new RequestLogInterceptor(db, auditContext, {
      get: jest.fn(() => 60_000),
    } as unknown as ConfigService);
  });

  it('persists privacy-safe successful request telemetry', async () => {
    await auditContext.run(auditRequest, () =>
      lastValueFrom(
        interceptor.intercept(restContext(201), {
          handle: () => of({ ok: true }),
        } as CallHandler),
      ),
    );
    await settleFireAndForget();

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-123',
        method: 'GET',
        path: '/api/v1/stations',
        statusCode: 201,
        userId: 'user-123',
        keyId: 'key-123',
        ipAddress: null,
        ipNetwork: '192.168.1.0/24',
        ipFingerprint: 'fingerprint',
        userAgent: 'test-client',
        error: null,
        errorCode: null,
      }),
    );
    expect(JSON.stringify(values.mock.calls)).not.toContain('Bearer secret');
    expect(JSON.stringify(values.mock.calls)).not.toContain('192.168.1.42');
  });

  it('persists a structured error without emitting a duplicate console error', async () => {
    const failure = Object.assign(new Error('upstream unavailable'), {
      status: 503,
      code: 'UPSTREAM_UNAVAILABLE',
    });
    const errorSpy = jest.spyOn(
      (interceptor as unknown as { logger: { error: () => void } }).logger,
      'error',
    );

    await expect(
      auditContext.run(auditRequest, () =>
        lastValueFrom(
          interceptor.intercept(restContext(), {
            handle: () => throwError(() => failure),
          } as CallHandler),
        ),
      ),
    ).rejects.toBe(failure);
    await settleFireAndForget();

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-123',
        statusCode: 503,
        error: 'upstream unavailable',
        errorCode: 'UPSTREAM_UNAVAILABLE',
      }),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
