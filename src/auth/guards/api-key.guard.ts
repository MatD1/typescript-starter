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
    const apiKeyValue =
      (req.headers['x-api-key'] as string | undefined) ??
      req.headers['authorization']?.replace(/^Bearer\s+nsw_/i, 'nsw_');

    if (!apiKeyValue?.startsWith('nsw_')) {
      throw new UnauthorizedException(
        'Missing API key. Provide X-API-Key: nsw_xxx header.',
      );
    }

    const result = await this.apiKeyService.verifyApiKey(apiKeyValue);
    if (!result.valid) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    (req as unknown as Record<string, unknown>)['user'] = {
      userId: result.userId,
      keyId: result.keyId,
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
