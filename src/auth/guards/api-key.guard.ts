import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ApiKeyService } from '../api-key.service';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuditContextService } from '../../audit/audit.context';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_ACTIONS } from '../../audit/audit.types';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector,
    @Optional() private readonly auditContext?: AuditContextService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = this.getRequest(context);
    
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      const clientSecret = process.env.JRAIL_CLIENT_SECRET;
      if (!clientSecret || req.headers['x-jrail-client'] === clientSecret) {
        return true;
      }
    }
    const apiKeyHeader = req.headers['x-api-key'];
    const apiKeyValue = Array.isArray(apiKeyHeader)
      ? apiKeyHeader[0]?.trim()
      : apiKeyHeader?.trim();
    const authorization = req.headers['authorization'];
    const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
    const bearerValue = bearerMatch?.[1]?.trim();

    const credential = apiKeyValue ?? bearerValue;

    if (!credential) {
      const body = req.body as { operationName?: unknown } | undefined;
      const operation =
        typeof body?.operationName === 'string'
          ? body.operationName.slice(0, 80)
          : 'unknown';
      const userAgent = (req.headers['user-agent'] ?? 'unknown').slice(0, 120);
      const origin = (req.headers.origin ?? 'none').slice(0, 120);
      this.logger.warn(
        `Missing API credential operation=${operation} userAgent=${userAgent} origin=${origin}`,
      );
      await this.audit?.recordBestEffort({
        category: 'authentication',
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        outcome: 'denied',
        severity: 'warning',
        actor: { type: 'anonymous' },
        metadata: { reason: 'missing_credential', operation },
      });
      throw new UnauthorizedException(
        'Provide X-API-Key: nsw_xxx or Authorization: Bearer <session-token>',
      );
    }

    if (credential.startsWith('nsw_')) {
      const result = await this.apiKeyService.verifyApiKey(credential);
      if (!result.valid) {
        await this.audit?.recordBestEffort({
          category: 'authentication',
          action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
          outcome: 'denied',
          severity: 'warning',
          actor: { type: 'api_key' },
          metadata: { reason: 'invalid_or_expired_api_key' },
        });
        throw new UnauthorizedException('Invalid or expired API key');
      }
      (req as unknown as Record<string, unknown>)['user'] = {
        userId: result.userId,
        keyId: result.keyId,
        permissions: result.permissions,
      };
      this.auditContext?.setActor({
        type: 'api_key',
        id: result.keyId,
        role: result.permissions?.join(','),
      });
      return true;
    }

    const sessionInfo = await this.apiKeyService.resolveUserFromBearer(credential);
    if (!sessionInfo) {
      await this.audit?.recordBestEffort({
        category: 'authentication',
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        outcome: 'denied',
        severity: 'warning',
        actor: { type: 'anonymous' },
        metadata: { reason: 'invalid_or_expired_session' },
      });
      throw new UnauthorizedException('Invalid or expired session token');
    }
    if (sessionInfo.banned) {
      await this.audit?.recordBestEffort({
        category: 'authentication',
        action: AUDIT_ACTIONS.AUTH_BANNED_USER_DENIED,
        outcome: 'denied',
        severity: 'high',
        actor: {
          type: 'user',
          id: sessionInfo.userId,
          role: sessionInfo.role,
        },
        targetType: 'user',
        targetId: sessionInfo.userId,
      });
      throw new UnauthorizedException('This account has been suspended');
    }
    (req as unknown as Record<string, unknown>)['user'] = {
      userId: sessionInfo.userId,
      role: sessionInfo.role,
      keyId: undefined,
    };
    this.auditContext?.setActor({
      type: 'user',
      id: sessionInfo.userId,
      role: sessionInfo.role,
      impersonatorUserId: sessionInfo.impersonatedBy,
    });
    const operationName = (req.body as { operationName?: unknown } | undefined)
      ?.operationName;
    if (context.getType<string>() === 'graphql') {
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
