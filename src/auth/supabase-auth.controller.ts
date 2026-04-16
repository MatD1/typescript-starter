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
  constructor(private readonly supabaseAuthService: SupabaseAuthService) { }

  @Post('exchange')
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @ApiOperation({
    summary: 'Exchange a Supabase JWT for API session tokens',
    description:
      'Verifies the Supabase JWT, upserts the corresponding user record in the local database, ' +
      'and returns a `sessionToken` + `refreshToken` pair that can be used with all authenticated API endpoints. ' +
      '**Flow**: `Supabase sign-in → POST /auth/supabase/exchange → receive sessionToken → use Bearer token for API calls`',
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
      return await this.supabaseAuthService.exchangeSupabaseToken(dto.token);
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid Supabase token');
    }
  }
}
