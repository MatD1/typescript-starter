import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

/**
 * FCM topic push. Clients subscribe to `line-<CODE>` topics (T1, CCN…)
 * when they favourite a line; the commute alert cron publishes to those
 * topics when a line degrades. No token storage needed server-side.
 *
 * Requires FIREBASE_SERVICE_ACCOUNT (base64-encoded service-account JSON).
 * When unset, pushes are logged and dropped so the rest of the app is
 * unaffected in dev.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  onModuleInit(): void {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled',
      );
      return;
    }
    try {
      const json = JSON.parse(
        Buffer.from(raw, 'base64').toString('utf8'),
      ) as ServiceAccount;
      if (getApps().length === 0) {
        initializeApp({ credential: cert(json) });
      }
      this.enabled = true;
      this.logger.log('Firebase Admin initialised — push enabled');
    } catch (error) {
      this.logger.error(
        `Failed to initialise Firebase Admin: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /** Topic name for a rider-facing line code. */
  static lineTopic(line: string): string {
    return `line-${line.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
  }

  async sendToLine(
    line: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<void> {
    const topic = PushService.lineTopic(line);
    if (!this.enabled) {
      this.logger.debug(`[push disabled] ${topic}: ${title} — ${body}`);
      return;
    }
    try {
      await getMessaging().send({
        topic,
        notification: { title, body },
        data: { line, ...data },
        apns: {
          payload: { aps: { sound: 'default', 'interruption-level': 'time-sensitive' } },
        },
        android: { priority: 'high' },
      });
      this.logger.log(`Pushed to ${topic}: ${title}`);
    } catch (error) {
      this.logger.error(
        `Push to ${topic} failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
