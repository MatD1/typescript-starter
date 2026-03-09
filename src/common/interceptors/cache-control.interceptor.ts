import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Maps URL path fragments to Cache-Control max-age values (seconds).
 * Matches the first prefix that appears in `req.path`.
 */
const PATH_TTL_MAP: Array<[string, number]> = [
  ['/realtime/vehicles', 15],
  ['/realtime/trip-updates', 30],
  ['/disruptions', 300],
  ['/trip-planner/departures', 30],
  ['/trip-planner/trips', 300],
  ['/trip-planner/stops', 3600],
  ['/trip-planner/nearby', 3600],
  ['/stations', 3600],
  ['/gtfs-static', 86400],
];

@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Only apply to HTTP (REST) responses — not GraphQL.
    if (context.getType<string>() !== 'http') return next.handle();

    const res = context.switchToHttp().getResponse<Response>();
    const path = context.switchToHttp().getRequest<{ path: string }>().path;

    const match = PATH_TTL_MAP.find(([prefix]) => path.includes(prefix));
    if (!match) return next.handle();

    const [, maxAge] = match;
    return next.handle().pipe(
      tap(() => {
        if (res.headersSent) return;
        res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
        res.setHeader('Surrogate-Control', `max-age=${maxAge}`);
      }),
    );
  }
}
