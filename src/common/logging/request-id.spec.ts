import type { NextFunction, Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import {
  AuditContextMiddleware,
  AuditContextService,
} from '../../audit/audit.context';
import { REQUEST_ID_PATTERN, resolveRequestId } from './request-id';

describe('request correlation', () => {
  it('preserves valid IDs and replaces invalid IDs', () => {
    expect(resolveRequestId('client-request-123')).toBe('client-request-123');
    const generated = resolveRequestId('bad id');
    expect(generated).toMatch(REQUEST_ID_PATTERN);
    expect(generated).not.toBe('bad id');
  });

  it('shares Pino request IDs with the audit context and response', () => {
    const context = new AuditContextService();
    const middleware = new AuditContextMiddleware(context, {
      get: jest.fn(() => 'fingerprint-secret'),
    } as unknown as ConfigService);
    const req = {
      id: 'shared-request-123',
      headers: { 'user-agent': 'test-client' },
      ip: '192.168.1.42',
      socket: {},
      path: '/api/v1/stations',
      method: 'GET',
    } as unknown as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;
    let currentRequestId: string | undefined;

    middleware.use(req, res, (() => {
      currentRequestId = context.current()?.requestId;
    }) as NextFunction);

    expect(currentRequestId).toBe('shared-request-123');
    expect(req.id).toBe('shared-request-123');
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Request-ID',
      'shared-request-123',
    );
  });
});
