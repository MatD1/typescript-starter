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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthService } from './supabase-auth.service';
import { Public } from '../common/decorators/public.decorator';
import { IsOptional, IsString } from 'class-validator';

class RefreshDto {
  @IsString()
  @IsOptional()
  refreshToken?: string;
}

@Public()
@ApiTags('auth')
@Controller('auth')
export class SessionController {
  constructor(private readonly supabaseAuthService: SupabaseAuthService) {}

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 900_000 } }) // 10 req per 15 min
  @ApiOperation({
    summary: 'Refresh session tokens',
    description:
      'Exchange a valid refresh token for new session and refresh tokens. Uses token rotation: old refresh token is invalidated.',
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
      return await this.supabaseAuthService.refreshSession(refreshToken);
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
