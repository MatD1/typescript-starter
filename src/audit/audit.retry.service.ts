import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AuditService } from './audit.service';

@Injectable()
export class AuditRetryService {
  private readonly logger = new Logger(AuditRetryService.name);
  private running = false;

  constructor(private readonly audit: AuditService) {}

  @Interval(30_000)
  async retry(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const completed = await this.audit.retryQueued();
      if (completed) this.logger.log(`Replayed ${completed} queued audit events`);
    } catch (error) {
      this.logger.warn(
        `Audit retry unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}
