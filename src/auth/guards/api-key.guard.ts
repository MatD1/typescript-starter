import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ApiKeyService } from '../api-key.service';
import { GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = this.getRequest(context);
    const apiKeyValue = req.headers['x-api-key'] as string | undefined;
    const bearerValue = req.headers['authorization']?.startsWith('Bearer ')
      ? req.headers['authorization'].slice(7).trim()
      : undefined;

    const credential = apiKeyValue ?? bearerValue;

    if (!credential) {
      throw new UnauthorizedException(
        'Provide X-API-Key: nsw_xxx or Authorization: Bearer <session-token>',
      );
    }

    if (credential.startsWith('nsw_')) {
      const result = await this.apiKeyService.verifyApiKey(credential);
      if (!result.valid) {
        throw new UnauthorizedException('Invalid or expired API key');
      }
      (req as unknown as Record<string, unknown>)['user'] = {
        userId: result.userId,
        keyId: result.keyId,
      };
      return true;
    }

    const userId = await this.apiKeyService.getUserFromSession(credential);
    if (!userId) {
      throw new UnauthorizedException('Invalid or expired session token');
    }
    (req as unknown as Record<string, unknown>)['user'] = {
      userId,
      keyId: undefined,
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
