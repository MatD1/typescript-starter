import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { IsDate, IsOptional, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiKeyService } from './api-key.service';
import { Public } from '../common/decorators/public.decorator';

class CreateApiKeyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  expiresAt?: Date;

  @IsString()
  @IsOptional()
  @IsIn(['user', 'admin', 'app-authorised'])
  permissionLevel?: string;
}

@Public()
@ApiTags('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create a new API key (requires valid session token in Authorization: Bearer header)',
  })
  @ApiBody({ type: CreateApiKeyDto })
  async create(@Req() req: Request, @Body() dto: CreateApiKeyDto) {
    const sessionToken = this.extractSessionToken(req);
    const sessionInfo = await this.apiKeyService.getUserFromSession(sessionToken);
    if (!sessionInfo)
      throw new UnauthorizedException('Invalid or expired session token');

    // Security: Only admins can assign 'admin' or 'app-authorised' permissions.
    // If a standard user attempts to set them, force back to 'user'.
    let targetPermission = dto.permissionLevel || 'user';
    if (sessionInfo.role !== 'admin' && targetPermission !== 'user') {
      targetPermission = 'user';
    }

    return this.apiKeyService.createApiKey(
      sessionInfo.userId,
      dto.name,
      targetPermission,
      dto.expiresAt,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List API keys for the authenticated user' })
  async list(@Req() req: Request) {
    const sessionToken = this.extractSessionToken(req);
    const sessionInfo = await this.apiKeyService.getUserFromSession(sessionToken);
    if (!sessionInfo)
      throw new UnauthorizedException('Invalid or expired session token');
    return this.apiKeyService.listApiKeys(sessionInfo.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  async revoke(@Req() req: Request, @Param('id') id: string) {
    const sessionToken = this.extractSessionToken(req);
    const sessionInfo = await this.apiKeyService.getUserFromSession(sessionToken);
    if (!sessionInfo)
      throw new UnauthorizedException('Invalid or expired session token');
    await this.apiKeyService.revokeApiKey(id, sessionInfo.userId);
    return { success: true };
  }

  private extractSessionToken(req: Request): string {
    const auth = req.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Authorization: Bearer <session-token> required',
      );
    }
    return auth.replace('Bearer ', '');
  }
}
