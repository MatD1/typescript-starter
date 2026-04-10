import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { user } from '../../database/schema/auth.schema';
import { ApiKeyService } from '../api-key.service';
import { Inject } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = this.getRequest(context);

    // Extract session token from Authorization Bearer header OR cookie
    const authHeader = req.headers['authorization'] as string | undefined;
    let token: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      const raw = authHeader.slice(7);
      // Only treat as session token if it doesn't start with the API key prefix
      if (!raw.startsWith('nsw_')) {
        token = raw;
      }
    }

    // Fallback to session cookie
    if (!token) {
      const cookies = (req as Request & { cookies?: Record<string, string> })
        .cookies;
      token = cookies?.['better-auth.session_token'];
    }

    if (!token) {
      throw new ForbiddenException(
        'Admin session token required. Provide Authorization: Bearer <session_token> or better-auth.session_token cookie.',
      );
    }

    const sessionInfo = await this.apiKeyService.getUserFromSession(token);
    if (!sessionInfo || sessionInfo.role !== 'admin') {
      throw new ForbiddenException(
        sessionInfo
          ? 'Admin privileges required. Your account does not have the admin role.'
          : 'Invalid or expired session token.'
      );
    }

    // Set adminUser on the request for downstream use
    (req as unknown as Record<string, unknown>)['adminUser'] = {
      userId: sessionInfo.userId,
      role: sessionInfo.role,
    };

    return true;
  }

  private getRequest(context: ExecutionContext): Request {
    if (context.getType<string>() === 'graphql') {
      return GqlExecutionContext.create(context).getContext<{ req: Request }>()
        .req;
    }
    return context.switchToHttp().getRequest<Request>();
  }
}
