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
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express'
import { IsDate, IsOptional, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiKeyService } from './api-key.service';
import { Public } from '../common/decorators/public.decorator';
import {
  ApiKeyResponseSwagger,
  ApiKeyListItemSwagger,
  RevokeSuccessSwagger,
} from './dto/auth.swagger-schemas';
import { AuditService } from '../audit/audit.service';
import { AuditContextService } from '../audit/audit.context';
import { AUDIT_ACTIONS } from '../audit/audit.types';

class CreateApiKeyDto {
  @ApiPropertyOptional({
    description: 'A descriptive name for the API key (e.g. "Mobile App Production")',
    example: 'Mobile App Production',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Optional expiration date in ISO 8601 format. Omit for a non-expiring key.',
    example: '2027-01-01T00:00:00Z',
  })
  @IsDate()
  @IsOptional()
  @Type(() => Date)
  expiresAt?: Date;

  @ApiPropertyOptional({
    description:
      'Permission level for the key. Only admins can set `admin` or `app-authorised`; non-admin requests for elevated permissions are silently downgraded to `user`.',
    enum: ['user', 'admin', 'app-authorised'],
    default: 'user',
  })
  @IsString()
  @IsOptional()
  @IsIn(['user', 'admin', 'app-authorised'])
  permissionLevel?: string;
}

@Public()
@ApiTags('api-keys')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Requires a valid session token in the Authorization: Bearer header',
})
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('api-keys')
@ApiExtraModels(ApiKeyResponseSwagger, ApiKeyListItemSwagger, RevokeSuccessSwagger)
export class ApiKeyController {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly audit: AuditService,
    private readonly auditContext: AuditContextService,
  ) { }

  @Post()
  @ApiOperation({
    summary: 'Create a new API key',
    description:
      'Creates a new API key for the currently authenticated user. ' +
      '**The full key is only returned once** — store it immediately as it cannot be retrieved again. ' +
      'Requires a valid session token in `Authorization: Bearer <session-token>`. ' +
      'Non-admin users cannot grant themselves elevated permissions.',
  })
  @ApiBody({ type: CreateApiKeyDto })
  @ApiCreatedResponse({
    type: ApiKeyResponseSwagger,
    description: 'Newly created API key. The `key` field is only returned here — store it securely.',
  })
  async create(@Req() req: Request, @Body() dto: CreateApiKeyDto) {
    const sessionToken = this.extractSessionToken(req);
    const sessionInfo = await this.apiKeyService.getUserFromSession(sessionToken);
    if (!sessionInfo)
      throw new UnauthorizedException('Invalid or expired session token');
    this.auditContext.setActor({
      type: 'user',
      id: sessionInfo.userId,
      role: sessionInfo.role,
    });

    let targetPermission = dto.permissionLevel || 'user';
    if (sessionInfo.role !== 'admin' && targetPermission !== 'user') {
      targetPermission = 'user';
    }

    const created = await this.apiKeyService.createApiKey(
      sessionInfo.userId,
      dto.name,
      targetPermission,
      dto.expiresAt,
    );
    await this.audit.record({
      category: 'api_key',
      action: AUDIT_ACTIONS.API_KEY_CREATED,
      outcome: 'succeeded',
      targetType: 'api_key',
      targetId: created.id,
      after: {
        id: created.id,
        name: dto.name,
        start: created.start,
        permissions: targetPermission,
        expiresAt: dto.expiresAt,
      },
    });
    return created;
  }

  @Get()
  @ApiOperation({
    summary: 'List API keys for the authenticated user',
    description:
      'Returns all API keys belonging to the currently authenticated user. ' +
      'The `key` field is not included in list responses for security. ' +
      'Requires a valid session token in `Authorization: Bearer <session-token>`.',
  })
  @ApiOkResponse({
    type: [ApiKeyListItemSwagger],
    description: 'Array of API keys owned by the authenticated user',
  })
  async list(@Req() req: Request) {
    const sessionToken = this.extractSessionToken(req);
    const sessionInfo = await this.apiKeyService.getUserFromSession(sessionToken);
    if (!sessionInfo)
      throw new UnauthorizedException('Invalid or expired session token');
    this.auditContext.setActor({
      type: 'user',
      id: sessionInfo.userId,
      role: sessionInfo.role,
    });
    return this.apiKeyService.listApiKeys(sessionInfo.userId);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Revoke an API key',
    description:
      'Permanently revokes and deletes the specified API key. ' +
      'A user can only revoke their own keys. Requires a valid session token.',
  })
  @ApiParam({ name: 'id', description: 'API key ID to revoke' })
  @ApiOkResponse({ type: RevokeSuccessSwagger, description: 'Key successfully revoked' })
  async revoke(@Req() req: Request, @Param('id') id: string) {
    const sessionToken = this.extractSessionToken(req);
    const sessionInfo = await this.apiKeyService.getUserFromSession(sessionToken);
    if (!sessionInfo)
      throw new UnauthorizedException('Invalid or expired session token');
    this.auditContext.setActor({
      type: 'user',
      id: sessionInfo.userId,
      role: sessionInfo.role,
    });
    await this.apiKeyService.revokeApiKey(id, sessionInfo.userId);
    await this.audit.record({
      category: 'api_key',
      action: AUDIT_ACTIONS.API_KEY_REVOKED,
      outcome: 'succeeded',
      severity: 'high',
      targetType: 'api_key',
      targetId: id,
    });
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
