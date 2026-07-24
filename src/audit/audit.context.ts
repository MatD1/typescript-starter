import { AsyncLocalStorage } from 'async_hooks';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuditActor, AuditRequestContext, AuditSource } from './audit.types';
import {
  fingerprintIp,
  networkPrefix,
  sanitizeAuditText,
} from './audit.redaction';
import { resolveRequestId } from '../common/logging/request-id';

const storage = new AsyncLocalStorage<AuditRequestContext>();

@Injectable()
export class AuditContextService {
  current(): AuditRequestContext | undefined {
    return storage.getStore();
  }

  setActor(actor: AuditActor): void {
    const current = storage.getStore();
    if (current) current.actor = actor;
  }

  setSource(source: AuditSource, graphqlOperation?: string): void {
    const current = storage.getStore();
    if (!current) return;
    current.source = source;
    current.graphqlOperation = sanitizeAuditText(graphqlOperation, 200);
  }

  run<T>(context: AuditRequestContext, callback: () => T): T {
    return storage.run(context, callback);
  }
}

@Injectable()
export class AuditContextMiddleware implements NestMiddleware {
  private readonly ipSecret: string;

  constructor(
    private readonly context: AuditContextService,
    config: ConfigService,
  ) {
    this.ipSecret =
      config.get<string>('audit.ipHashSecret') ??
      config.get<string>('auth.secret') ??
      'development-only-audit-secret';
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      typeof req.id === 'string'
        ? resolveRequestId(req.id)
        : resolveRequestId(req.headers['x-request-id']);
    req.id = requestId;
    res.setHeader('X-Request-ID', requestId);

    const ip = (req.ip ?? req.socket.remoteAddress ?? 'unknown').slice(0, 100);
    const context: AuditRequestContext = {
      requestId,
      source: req.path === '/graphql' ? 'graphql' : 'rest',
      method: sanitizeAuditText(req.method, 16),
      route: sanitizeAuditText(req.path, 500),
      ipNetwork: networkPrefix(ip),
      ipFingerprint: fingerprintIp(ip, this.ipSecret),
      userAgent: sanitizeAuditText(req.headers['user-agent'], 512),
      actor: { type: 'anonymous' },
    };

    this.context.run(context, next);
  }
}
