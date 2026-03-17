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
  ) {}

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

    const userId = await this.apiKeyService.getUserFromSession(token);
    if (!userId) {
      throw new ForbiddenException('Invalid or expired session token.');
    }

    // Check role === 'admin' in the user table
    const rows = await this.db
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!rows.length || rows[0].role !== 'admin') {
      throw new ForbiddenException(
        'Admin privileges required. Your account does not have the admin role.',
      );
    }

    // Set adminUser on the request for downstream use
    (req as unknown as Record<string, unknown>)['adminUser'] = {
      userId,
      role: rows[0].role,
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
