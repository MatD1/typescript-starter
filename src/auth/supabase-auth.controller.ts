import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthService } from './supabase-auth.service';
import { Public } from '../common/decorators/public.decorator';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

class SupabaseExchangeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000, { message: 'Token exceeds maximum length' })
  token!: string;
}

@Public()
@ApiTags('auth')
@Controller('auth/supabase')
export class SupabaseAuthController {
  constructor(private readonly supabaseAuthService: SupabaseAuthService) {}

  @Post('exchange')
  @Throttle({ default: { limit: 10, ttl: 900_000 } }) // 10 req per 15 min
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
      throw new UnauthorizedException('Invalid Supabase token');
    }
  }
}
