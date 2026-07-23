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
import { Optional } from '@nestjs/common';
import { AuditContextService } from '../../audit/audit.context';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_ACTIONS } from '../../audit/audit.types';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Optional() private readonly auditContext?: AuditContextService,
    @Optional() private readonly audit?: AuditService,
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
      await this.audit?.recordBestEffort({
        category: 'authentication',
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        outcome: 'denied',
        severity: 'high',
        actor: { type: 'anonymous' },
        metadata: { reason: 'admin_session_required' },
      });
      throw new ForbiddenException(
        'Admin session token required. Provide Authorization: Bearer <session_token> or better-auth.session_token cookie.',
      );
    }

    const sessionInfo = await this.apiKeyService.resolveUserFromBearer(token);
    if (!sessionInfo || sessionInfo.role !== 'admin' || sessionInfo.banned) {
      await this.audit?.recordBestEffort({
        category: 'authentication',
        action: sessionInfo?.banned
          ? AUDIT_ACTIONS.AUTH_BANNED_USER_DENIED
          : AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        outcome: 'denied',
        severity: 'high',
        actor: sessionInfo
          ? {
              type: 'user',
              id: sessionInfo.userId,
              role: sessionInfo.role,
            }
          : { type: 'anonymous' },
        metadata: { reason: 'admin_privileges_required' },
      });
      throw new ForbiddenException(
        sessionInfo
          ? 'Admin privileges required. Your account does not have the admin role.'
          : 'Invalid or expired session token.'
      );
    }

    // Set user on the request for downstream use (unifying with ApiKeyGuard)
    (req as unknown as Record<string, unknown>)['user'] = {
      userId: sessionInfo.userId,
      role: sessionInfo.role,
    };
    this.auditContext?.setActor({
      type: 'user',
      id: sessionInfo.userId,
      role: sessionInfo.role,
      impersonatorUserId: sessionInfo.impersonatedBy,
    });
    if (context.getType<string>() === 'graphql') {
      const operationName = (
        req.body as { operationName?: unknown } | undefined
      )?.operationName;
      this.auditContext?.setSource(
        'graphql',
        typeof operationName === 'string' ? operationName : undefined,
      );
    }

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
