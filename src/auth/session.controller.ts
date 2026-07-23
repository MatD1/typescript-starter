import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { SupabaseAuthService } from './supabase-auth.service';
import { Public } from '../common/decorators/public.decorator';
import { IsOptional, IsString } from 'class-validator';
import { SessionTokenResponseSwagger } from './dto/auth.swagger-schemas';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';

class RefreshDto {
  @ApiPropertyOptional({
    description:
      'Refresh token. May also be supplied via `Authorization: Bearer <refresh-token>` header instead.',
    example: 'eyJ...',
  })
  @IsString()
  @IsOptional()
  refreshToken?: string;
}

@Public()
@ApiTags('auth')
@Controller('auth')
export class SessionController {
  constructor(
    private readonly supabaseAuthService: SupabaseAuthService,
    private readonly audit: AuditService,
  ) { }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @ApiOperation({
    summary: '[DEPRECATED] Refresh session tokens',
    description:
      '**Deprecated** — only relevant to clients still using the first-party session-token ' +
      'flow from `/auth/supabase/exchange`. New clients authenticate with a Supabase access ' +
      'token directly and rely on the Supabase SDK for refresh; they never call this endpoint. ' +
      'Kept only for already-installed app versions during rollout.\n\n' +
      'Exchanges a valid refresh token for new session and refresh tokens. ' +
      'Token rotation is applied — the old refresh token is immediately invalidated. ' +
      'Supply the token via `Authorization: Bearer <refresh-token>` **or** in the request body. ' +
      'Use the returned `sessionToken` for all authenticated API calls.',
    deprecated: true,
  })
  @ApiBody({ type: RefreshDto, required: false })
  @ApiOkResponse({
    type: SessionTokenResponseSwagger,
    description: 'New session and refresh tokens',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token' })
  @ApiBadRequestResponse({
    description: 'No refresh token provided in header or body',
  })
  async refresh(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: RefreshDto,
  ) {
    let refreshToken: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      refreshToken = authHeader.slice(7);
    }
    if (!refreshToken && dto.refreshToken) {
      refreshToken = dto.refreshToken;
    }

    if (!refreshToken) {
      throw new BadRequestException(
        'refreshToken required. Provide Authorization: Bearer <refresh-token> or { "refreshToken": "..." }',
      );
    }

    try {
      const result = await this.supabaseAuthService.refreshSession(refreshToken);
      await this.audit.recordBestEffort({
        category: 'authentication',
        action: AUDIT_ACTIONS.AUTH_TOKEN_REFRESHED,
        outcome: 'succeeded',
        source: 'auth',
        metadata: { role: result.role },
      });
      return result;
    } catch (err) {
      await this.audit.recordBestEffort({
        category: 'authentication',
        action:
          err instanceof Error && err.message.toLowerCase().includes('reuse')
            ? AUDIT_ACTIONS.AUTH_REFRESH_REUSE_DETECTED
            : AUDIT_ACTIONS.AUTH_TOKEN_REFRESH_FAILED,
        outcome: 'failed',
        severity:
          err instanceof Error && err.message.toLowerCase().includes('reuse')
            ? 'critical'
            : 'warning',
        source: 'auth',
        error: {
          code: 'TOKEN_REFRESH_FAILED',
          message: err instanceof Error ? err.message : 'Refresh failed',
        },
      });
      if (err instanceof HttpException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
