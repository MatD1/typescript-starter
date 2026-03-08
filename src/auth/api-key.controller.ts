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
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { IsDate, IsOptional, IsString } from 'class-validator';
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
}

@Public()
@ApiTags('auth')
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
    const userId = await this.apiKeyService.getUserFromSession(sessionToken);
    if (!userId)
      throw new UnauthorizedException('Invalid or expired session token');
    return this.apiKeyService.createApiKey(userId, dto.name, dto.expiresAt);
  }

  @Get()
  @ApiOperation({ summary: 'List API keys for the authenticated user' })
  async list(@Req() req: Request) {
    const sessionToken = this.extractSessionToken(req);
    const userId = await this.apiKeyService.getUserFromSession(sessionToken);
    if (!userId)
      throw new UnauthorizedException('Invalid or expired session token');
    return this.apiKeyService.listApiKeys(userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  async revoke(@Req() req: Request, @Param('id') id: string) {
    const sessionToken = this.extractSessionToken(req);
    const userId = await this.apiKeyService.getUserFromSession(sessionToken);
    if (!userId)
      throw new UnauthorizedException('Invalid or expired session token');
    await this.apiKeyService.revokeApiKey(id, userId);
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
