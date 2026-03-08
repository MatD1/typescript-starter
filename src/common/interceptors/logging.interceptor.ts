import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    let label: string;

    if (context.getType<string>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      const info = gqlCtx.getInfo<GraphQLResolveInfo>();
      label = `[GraphQL] ${String(info.parentType)}.${info.fieldName}`;
    } else {
      const req = context.switchToHttp().getRequest<Request>();
      label = `[REST] ${req.method} ${req.path}`;
    }

    return next.handle().pipe(
      tap(() => {
        this.logger.log(`${label} — ${Date.now() - start}ms`);
      }),
    );
  }
}
