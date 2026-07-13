import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get('live')
  @ApiOperation({ summary: 'Process liveness check with no external calls' })
  live() {
    return {
      status: 'ok',
      version:
        process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.npm_package_version,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Local configuration readiness check' })
  ready() {
    const rawKey = this.config.get<string>('transport.apiKey')?.trim();
    const configured = Boolean(
      rawKey &&
      rawKey !== 'undefined' &&
      rawKey !== 'null' &&
      !rawKey.toLowerCase().includes('replace_me'),
    );

    if (!configured) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks: { tfnswApiKeyConfigured: false },
      });
    }

    return {
      status: 'ready',
      checks: { tfnswApiKeyConfigured: true },
    };
  }
}
