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
    const auditArchiveDisabled =
      this.config.get<boolean>('audit.archive.disabled') ?? false;
    const production = this.config.get<string>('nodeEnv') === 'production';
    const auditArchiveConfigured =
      (!production && auditArchiveDisabled) ||
      Boolean(
        this.config.get<string>('audit.archive.endpoint') &&
          this.config.get<string>('audit.archive.bucket') &&
          this.config.get<string>('audit.archive.accessKeyId') &&
          this.config.get<string>('audit.archive.secretAccessKey') &&
          this.config.get<string>('audit.ipHashSecret') &&
          this.config.get<string>('audit.signingSecret'),
      );

    if (!configured || !auditArchiveConfigured) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks: {
          tfnswApiKeyConfigured: configured,
          auditArchiveConfigured,
        },
      });
    }

    return {
      status: 'ready',
      checks: {
        tfnswApiKeyConfigured: true,
        auditArchiveConfigured: true,
      },
    };
  }
}
