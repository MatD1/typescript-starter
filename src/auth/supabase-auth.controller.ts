import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthService } from './supabase-auth.service';
import { Public } from '../common/decorators/public.decorator';
import { IsString } from 'class-validator';

class SupabaseExchangeDto {
  @IsString()
  token!: string;
}

@Public()
@ApiTags('auth')
@Controller('auth/supabase')
export class SupabaseAuthController {
  constructor(private readonly supabaseAuthService: SupabaseAuthService) {}

  @Post('exchange')
  @ApiOperation({
    summary: 'Exchange a Supabase JWT for session tokens',
    description:
      'Verifies the Supabase JWT, upserts the user in our database, and returns sessionToken, refreshToken, and expiresAt. Use sessionToken for API calls; use refreshToken with POST /auth/refresh to obtain new tokens before expiry.',
  })
  async exchange(@Body() dto: SupabaseExchangeDto) {
    if (!dto.token) throw new BadRequestException('token is required');
    try {
      return await this.supabaseAuthService.exchangeSupabaseToken(dto.token);
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      throw new UnauthorizedException(
        err instanceof Error ? err.message : 'Invalid Supabase token',
      );
    }
  }
}
