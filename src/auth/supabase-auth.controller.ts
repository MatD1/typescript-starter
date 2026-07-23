import {
  BadRequestException,
  Body,
  Controller,
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
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { SupabaseAuthService } from './supabase-auth.service';
import { Public } from '../common/decorators/public.decorator';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { SessionTokenResponseSwagger } from './dto/auth.swagger-schemas';
import { AuditService } from '../audit/audit.service';
import { AuditContextService } from '../audit/audit.context';
import { AUDIT_ACTIONS } from '../audit/audit.types';

class SupabaseExchangeDto {
  @ApiProperty({
    description:
      'A valid Supabase access token (JWT). Obtain this from the Supabase SDK after the user signs in.',
    example: 'eyJhbGciOiJIUzI1NiIs...',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000, { message: 'Token exceeds maximum length' })
  token!: string;
}

@Public()
@ApiTags('auth')
@Controller('auth/supabase')
export class SupabaseAuthController {
  constructor(
    private readonly supabaseAuthService: SupabaseAuthService,
    private readonly audit: AuditService,
    private readonly auditContext: AuditContextService,
  ) { }

  @Post('exchange')
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @ApiOperation({
    summary: '[DEPRECATED] Exchange a Supabase JWT for API session tokens',
    description:
      '**Deprecated** — the API now accepts a Supabase access token directly as the ' +
      '`Authorization: Bearer` credential on every request; there is no need to exchange it ' +
      'for a first-party session token first. This endpoint is kept only so already-installed ' +
      'app versions keep working during rollout, and will be removed in a future release. ' +
      'New clients should skip this call entirely.\n\n' +
      'Verifies the Supabase JWT, upserts the corresponding user record in the local database, ' +
      'and returns a `sessionToken` + `refreshToken` pair that can be used with all authenticated API endpoints.',
    deprecated: true,
  })
  @ApiBody({ type: SupabaseExchangeDto })
  @ApiOkResponse({
    type: SessionTokenResponseSwagger,
    description: 'Session token pair for the authenticated user',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired Supabase token' })
  @ApiBadRequestResponse({ description: 'Missing or malformed token field' })
  async exchange(@Body() dto: SupabaseExchangeDto) {
    if (!dto.token) throw new BadRequestException('token is required');
    try {
      const result =
        await this.supabaseAuthService.exchangeSupabaseToken(dto.token);
      this.auditContext.setActor({
        type: 'user',
        id: result.userId,
        role: result.role,
      });
      await this.audit.recordBestEffort({
        category: 'authentication',
        action: AUDIT_ACTIONS.AUTH_TOKEN_EXCHANGED,
        outcome: 'succeeded',
        source: 'auth',
        targetType: 'user',
        targetId: result.userId,
      });
      return result;
    } catch (err) {
      await this.audit.recordBestEffort({
        category: 'authentication',
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        outcome: 'failed',
        severity: 'warning',
        source: 'auth',
        error: {
          code: 'TOKEN_EXCHANGE_FAILED',
          message: err instanceof Error ? err.message : 'Exchange failed',
        },
      });
      if (err instanceof HttpException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid Supabase token');
    }
  }
}
