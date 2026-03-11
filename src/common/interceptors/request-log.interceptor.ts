import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { requestLog } from '../../database/schema/request-log.schema';

/** Paths that should never be persisted to the request_log table. */
const SKIP_PATHS = new Set(['/admin/health']);

function shouldSkip(path: string): boolean {
  if (SKIP_PATHS.has(path)) return true;
  // Skip GraphQL introspection queries
  if (path.includes('__schema') || path.includes('__type')) return true;
  return false;
}

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    let label: string;
    let method: string;
    let path: string;
    let userId: string | undefined;
    let keyId: string | undefined;
    let ipAddress: string | undefined;
    let userAgent: string | undefined;
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
          ? ((req as unknown as Record<string, unknown>)['user'] as { userId?: string })
              .userId
          : undefined
        : undefined;
      keyId = req
        ? (req as unknown as Record<string, unknown>)['user']
          ? ((req as unknown as Record<string, unknown>)['user'] as { keyId?: string }).keyId
          : undefined
        : undefined;
      ipAddress = req ? (req.ip ?? req.socket?.remoteAddress) : undefined;
      userAgent = req?.headers?.['user-agent'];
    } else {
      const req = context.switchToHttp().getRequest<Request>();
      method = req.method;
      path = req.path;
      label = `[REST] ${method} ${path}`;
      userId = (req as unknown as Record<string, unknown>)['user']
        ? ((req as unknown as Record<string, unknown>)['user'] as { userId?: string })
            .userId
        : undefined;
      keyId = (req as unknown as Record<string, unknown>)['user']
        ? ((req as unknown as Record<string, unknown>)['user'] as { keyId?: string }).keyId
        : undefined;
      ipAddress = req.ip ?? req.socket?.remoteAddress;
      userAgent = req.headers['user-agent'];
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const responseTimeMs = Date.now() - start;
          this.logger.log(`${label} — ${responseTimeMs}ms`);

          if (shouldSkip(path)) return;

          // Fire-and-forget DB insert — never throw into the request pipeline
          void this.persistLog({
            method,
            path,
            statusCode: isGraphql
              ? 200
              : context
                  .switchToHttp()
                  .getResponse<Response>()
                  .statusCode,
            userId: userId ?? null,
            keyId: keyId ?? null,
            responseTimeMs,
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
            error: null,
          });
        },
        error: (err: unknown) => {
          const responseTimeMs = Date.now() - start;
          const statusCode =
            err instanceof Object && 'status' in err
              ? (err as { status: number }).status
              : 500;
          const errorMsg =
            err instanceof Error ? err.message : 'Unknown error';
          this.logger.error(`${label} — ${responseTimeMs}ms — ERROR: ${errorMsg}`);

          if (shouldSkip(path)) return;

          void this.persistLog({
            method,
            path,
            statusCode,
            userId: userId ?? null,
            keyId: keyId ?? null,
            responseTimeMs,
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
            error: errorMsg,
          });
        },
      }),
    );
  }

  private async persistLog(entry: {
    method: string;
    path: string;
    statusCode: number;
    userId: string | null;
    keyId: string | null;
    responseTimeMs: number;
    ipAddress: string | null;
    userAgent: string | null;
    error: string | null;
  }): Promise<void> {
    try {
      await this.db.insert(requestLog).values({
        id: randomBytes(16).toString('hex'),
        ...entry,
      });
    } catch (err) {
      this.logger.warn(
        `RequestLogInterceptor: failed to persist log — ${String(err)}`,
      );
    }
  }
}
