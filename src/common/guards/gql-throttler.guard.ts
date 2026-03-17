import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerRequest } from '@nestjs/throttler';

/**
 * ThrottlerGuard that supports both HTTP and GraphQL contexts.
 * Implements tiered rate limiting based on authentication level.
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected override async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { context, limit } = requestProps;
    const { req } = this.getRequestResponse(context) as { req: any };
    const user = req.user;

    // Check for admin status or explicit 'admin' permission
    const permissions = user?.permissions || [];
    const isAdmin =
      user?.role === 'admin' ||
      (Array.isArray(permissions) && permissions.includes('admin'));

    if (isAdmin) {
      // Admins bypass rate limits for safety and unhindered management.
      return true;
    }

    // Check for 'app-authorised' permission
    const isAppAuth =
      Array.isArray(permissions) && permissions.includes('app-authorised');

    if (isAppAuth) {
      // app-authorised keys get a much higher limit (e.g., 10x default)
      requestProps.limit = limit * 10;
    }

    // Standard 'user' role or unauthenticated IP use the default limit (120 req/min)
    return super.handleRequest(requestProps);
  }

  protected override async getTracker(
    req: Record<string, any>,
  ): Promise<string> {
    // Priority: API Key ID > User ID > Client IP
    return (req.user?.keyId || req.user?.userId || req.ip) as string;
  }

  getRequestResponse(context: ExecutionContext): { req: unknown; res: unknown } {
    if (context.getType<string>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      const ctx = gqlCtx.getContext<{
        req?: { ip?: string; res?: unknown };
        res?: unknown;
      }>();
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
