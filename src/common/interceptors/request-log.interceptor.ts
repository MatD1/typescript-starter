import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, tap } from 'rxjs';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { requestLog } from '../../database/schema/request-log.schema';
import { AuditContextService } from '../../audit/audit.context';
import { sanitizeAuditText } from '../../audit/audit.redaction';

/** Paths that should never be persisted to the request_log table. */
const SKIP_PATHS = new Set(['/admin/health']);

function shouldSkip(path: string): boolean {
  if (SKIP_PATHS.has(path) || path.endsWith('/admin/health')) return true;
  // Skip GraphQL introspection queries
  if (path.includes('__schema') || path.includes('__type')) return true;
  return false;
}

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  private readonly slowRequestMs: number;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly auditContext: AuditContextService,
    config: ConfigService,
  ) {
    const configured = config.get<number>('logging.slowRequestMs') ?? 2000;
    this.slowRequestMs =
      Number.isFinite(configured) && configured >= 0 ? configured : 2000;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    let label: string;
    let method: string;
    let path: string;
    let userId: string | undefined;
    let keyId: string | undefined;
    let isGraphql = false;

    if (context.getType<string>() === 'graphql') {
      isGraphql = true;
      const gqlCtx = GqlExecutionContext.create(context);
      const info = gqlCtx.getInfo<GraphQLResolveInfo>();
      const ctx = gqlCtx.getContext<{ req?: Request }>();
      const req = ctx?.req;
      method = 'GRAPHQL';
      path = `${String(info.parentType)}.${info.fieldName}`;
      label = `[GraphQL] ${path}`;
      userId = req
        ? (req as unknown as Record<string, unknown>)['user']
          ? (
              (req as unknown as Record<string, unknown>)['user'] as {
                userId?: string;
              }
            ).userId
          : undefined
        : undefined;
      keyId = req
        ? (req as unknown as Record<string, unknown>)['user']
          ? (
              (req as unknown as Record<string, unknown>)['user'] as {
                keyId?: string;
              }
            ).keyId
          : undefined
        : undefined;
    } else {
      const req = context.switchToHttp().getRequest<Request>();
      method = req.method;
      path = req.path;
      label = `[REST] ${method} ${path}`;
      userId = (req as unknown as Record<string, unknown>)['user']
        ? (
            (req as unknown as Record<string, unknown>)['user'] as {
              userId?: string;
            }
          ).userId
        : undefined;
      keyId = (req as unknown as Record<string, unknown>)['user']
        ? (
            (req as unknown as Record<string, unknown>)['user'] as {
              keyId?: string;
            }
          ).keyId
        : undefined;
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const responseTimeMs = Date.now() - start;
          // Every successful request is already persisted to request_log
          // below for admin querying — echoing it to the console too just
          // adds volume (this is the main driver of steady-state log rate
          // under normal traffic). Only surface slow requests here.
          const requestContext = this.auditContext.current();
          if (responseTimeMs > this.slowRequestMs) {
            this.logger.warn(
              {
                requestId: requestContext?.requestId,
                method,
                path,
                responseTimeMs,
              },
              `${label} completed slowly`,
            );
          }

          if (shouldSkip(path)) return;

          // Fire-and-forget DB insert — never throw into the request pipeline
          void this.persistLog({
            method,
            path,
            requestId: requestContext?.requestId ?? null,
            statusCode: isGraphql
              ? 200
              : context.switchToHttp().getResponse<Response>().statusCode,
            userId: userId ?? null,
            keyId: keyId ?? null,
            responseTimeMs,
            ipAddress: null,
            ipNetwork: requestContext?.ipNetwork ?? null,
            ipFingerprint: requestContext?.ipFingerprint ?? null,
            userAgent: requestContext?.userAgent ?? null,
            error: null,
            errorCode: null,
          });
        },
        error: (err: unknown) => {
          const responseTimeMs = Date.now() - start;
          const statusCode = this.statusCodeFor(err);
          const requestContext = this.auditContext.current();
          const errorMsg = sanitizeAuditText(
            err instanceof Error ? err.message : 'Unknown error',
            1000,
          );
          const errorCode = this.errorCodeFor(err);

          if (shouldSkip(path)) return;

          void this.persistLog({
            method,
            path,
            requestId: requestContext?.requestId ?? null,
            statusCode,
            userId: userId ?? null,
            keyId: keyId ?? null,
            responseTimeMs,
            ipAddress: null,
            ipNetwork: requestContext?.ipNetwork ?? null,
            ipFingerprint: requestContext?.ipFingerprint ?? null,
            userAgent: requestContext?.userAgent ?? null,
            error: errorMsg ?? 'Unknown error',
            errorCode,
          });
        },
      }),
    );
  }

  private statusCodeFor(err: unknown): number {
    let rawStatus: unknown = 500;
    if (err instanceof Object) {
      if ('status' in err) rawStatus = (err as { status: unknown }).status;
      else if ('statusCode' in err) {
        rawStatus = (err as { statusCode: unknown }).statusCode;
      } else if ('extensions' in err) {
        const extensions = (err as { extensions?: Record<string, unknown> })
          .extensions;
        rawStatus =
          (extensions?.http as { status?: unknown } | undefined)?.status ??
          extensions?.code;
      }
    }

    if (typeof rawStatus === 'number') return rawStatus;
    if (typeof rawStatus !== 'string') return 500;

    const parsed = parseInt(rawStatus, 10);
    if (!Number.isNaN(parsed)) return parsed;
    return (
      {
        UNAUTHENTICATED: 401,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        BAD_REQUEST: 400,
        BAD_USER_INPUT: 400,
      }[rawStatus.toUpperCase()] ?? 500
    );
  }

  private errorCodeFor(err: unknown): string | null {
    if (!(err instanceof Object)) return null;
    if ('extensions' in err) {
      const code = (err as { extensions?: { code?: unknown } }).extensions
        ?.code;
      if (typeof code === 'string') return sanitizeAuditText(code, 100) ?? null;
    }
    if ('code' in err && typeof (err as { code?: unknown }).code === 'string') {
      return sanitizeAuditText((err as { code: string }).code, 100) ?? null;
    }
    return err instanceof Error ? err.name : null;
  }

  private async persistLog(
    entry: Omit<typeof requestLog.$inferInsert, 'id' | 'createdAt'>,
  ): Promise<void> {
    try {
      await this.db.insert(requestLog).values({
        id: randomBytes(16).toString('hex'),
        ...entry,
      });
    } catch (err) {
      this.logger.warn(
        { err, requestId: entry.requestId },
        'Failed to persist request log',
      );
    }
  }
}
