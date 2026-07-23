import {
  Global,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { AuditArchiveService } from './audit.archive.service';
import {
  AuditContextMiddleware,
  AuditContextService,
} from './audit.context';
import { AuditController } from './audit.controller';
import { AuditExportService } from './audit.export.service';
import { AuditResolver } from './audit.resolver';
import { AuditRetryService } from './audit.retry.service';
import { AuditService } from './audit.service';
import { AuditObjectStorage } from './audit.storage';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [
    AuditContextService,
    AuditContextMiddleware,
    AuditService,
    AuditObjectStorage,
    AuditArchiveService,
    AuditExportService,
    AuditRetryService,
    AuditResolver,
  ],
  exports: [
    AuditContextService,
    AuditService,
    AuditObjectStorage,
    AuditArchiveService,
    AuditExportService,
  ],
})
export class AuditModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuditContextMiddleware).forRoutes('*');
  }
}
