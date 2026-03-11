import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard that supports both HTTP and GraphQL contexts.
 * The default ThrottlerGuard uses switchToHttp() which does not provide
 * req/res for GraphQL requests, causing "Cannot read properties of undefined (reading 'ip')".
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext): { req: unknown; res: unknown } {
    if (context.getType<string>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      const ctx = gqlCtx.getContext<{ req?: { ip?: string; res?: unknown }; res?: unknown }>();
      const req = ctx?.req;
      const res = ctx?.res ?? req?.res;
      if (!req || !res) {
        throw new Error(
          'GraphQL context must include req and res. Ensure context: ({ req, res }) => ({ req, res }) in GraphQL config.',
        );
      }
      return { req, res };
    }
    const http = context.switchToHttp();
    return { req: http.getRequest(), res: http.getResponse() };
  }
}
