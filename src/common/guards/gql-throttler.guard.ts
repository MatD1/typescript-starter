import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import type { ThrottlerRequest } from '@nestjs/throttler';

/**
 * ThrottlerGuard that supports both HTTP and GraphQL contexts.
 * Implements tiered rate limiting based on authentication level.
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(GqlThrottlerGuard.name);
  private skipIps: Set<string> | null = null;

  protected override async shouldSkip(
    context: ExecutionContext,
  ): Promise<boolean> {
    // Lazy-initialize the skip list from process.env
    if (this.skipIps === null) {
      const raw = process.env.THROTTLE_SKIP_IPS ?? '';
      this.skipIps = new Set(
        raw
          .split(',')
          .map((ip) => ip.trim())
          .filter(Boolean),
      );
      if (this.skipIps.size > 0) {
        this.logger.warn(
          `Rate limiting BYPASSED for IPs: ${[...this.skipIps].join(
            ', ',
          )} — do not use THROTTLE_SKIP_IPS in production`,
        );
      }
    }

    if (this.skipIps.size === 0) return false;

    const { req } = this.getRequestResponse(context) as { req: any };
    const ip: string = (req.ip as string) ?? '';

    return this.skipIps.has(ip);
  }

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
      permissions.includes('admin') ||
      permissions.includes('throttler:bypass');

    if (isAdmin) {
      // Admins and users with throttler:bypass bypass rate limits
      return true;
    }

    // Check for 'app-authorised' or 'throttler:high' permission
    const isHighTier =
      permissions.includes('app-authorised') ||
      permissions.includes('throttler:high');

    if (isHighTier) {
      // High-tier keys get a much higher limit (e.g., 10x default)
      requestProps.limit = limit * 10;
    }

    // Standard 'user' role or unauthenticated IP use the default limit (120 req/min)
    return super.handleRequest(requestProps);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: Parameters<
      ThrottlerGuard['throwThrottlingException']
    >[1],
  ): Promise<void> {
    const { req } = this.getRequestResponse(context) as { req: any };
    const path: string =
      (req.path as string | undefined) ??
      (req.body?.operationName as string | undefined) ??
      'unknown';
    this.logger.warn(
      `Rate limit exceeded — tracker=${throttlerLimitDetail.tracker} totalHits=${throttlerLimitDetail.totalHits}/${throttlerLimitDetail.limit} path=${path}`,
    );
    return super.throwThrottlingException(context, throttlerLimitDetail);
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
