import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { createHash, randomInt, randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../database/database.module';
import { deviceTokens } from '../database/schema/push.schema';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';
import { CacheService } from '../cache/cache.service';

/** FCM error codes that mean the token is dead and safe to delete. */
const UNREGISTERED_FCM_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * FCM push, two ways:
 *  - Topic broadcast: clients subscribe to `line-<CODE>` topics (T1, CCN…)
 *    when they favourite a line; the commute alert cron (and admin-triggered
 *    service alerts) publish to those topics.
 *  - Per-user send: looks up the user's registered device tokens in
 *    `device_tokens` (this is the backend's own table — replaces an earlier
 *    Supabase-only `user_devices` table so the backend is the single source
 *    of truth for who to push to) and sends directly to each device.
 *
 * Requires FIREBASE_SERVICE_ACCOUNT (base64-encoded service-account JSON).
 * When unset, pushes are logged and dropped so the rest of the app is
 * unaffected in dev.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly cache: CacheService,
    @Optional() private readonly audit?: AuditService,
  ) {}

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
    const correlationId = randomUUID();
    await this.audit?.recordBestEffort({
      category: 'notification',
      action: AUDIT_ACTIONS.PUSH_NOTIFICATION_ATTEMPTED,
      outcome: 'attempted',
      targetType: 'line',
      targetId: line,
      correlationId,
      metadata: { delivery: 'topic', enabled: this.enabled },
    });
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
      await this.audit?.recordBestEffort({
        category: 'notification',
        action: AUDIT_ACTIONS.PUSH_NOTIFICATION_SENT,
        outcome: 'succeeded',
        targetType: 'line',
        targetId: line,
        correlationId,
        metadata: { delivery: 'topic' },
      });
    } catch (error) {
      this.logger.error(
        `Push to ${topic} failed: ${error instanceof Error ? error.message : error}`,
      );
      await this.audit?.recordBestEffort({
        category: 'notification',
        action: AUDIT_ACTIONS.PUSH_NOTIFICATION_FAILED,
        outcome: 'failed',
        severity: 'warning',
        targetType: 'line',
        targetId: line,
        correlationId,
        error: {
          code: 'FCM_SEND_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /** Upserts a device's FCM token — one row per physical device, reassignable across users (sign-out/sign-in on the same device). */
  async registerDeviceToken(
    userId: string,
    fcmToken: string,
    platform?: string,
  ): Promise<void> {
    const now = new Date();
    await this.db
      .insert(deviceTokens)
      .values({
        id: randomUUID(),
        userId,
        fcmToken,
        platform,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: deviceTokens.fcmToken,
        set: { userId, platform, updatedAt: now },
      });
    await this.audit?.recordBestEffort({
      category: 'push',
      action: AUDIT_ACTIONS.PUSH_DEVICE_REGISTERED,
      outcome: 'succeeded',
      targetType: 'user',
      targetId: userId,
      metadata: {
        platform,
        tokenFingerprint: createHash('sha256')
          .update(fcmToken)
          .digest('hex')
          .slice(0, 16),
      },
    });
  }

  /**
   * Sends directly to every device registered to a user (admin test
   * notifications, future per-user alerts). Prunes tokens FCM reports as
   * dead so `device_tokens` doesn't accumulate stale entries.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<{ sent: number; pruned: number }> {
    const correlationId = randomUUID();
    await this.audit?.recordBestEffort({
      category: 'notification',
      action: AUDIT_ACTIONS.PUSH_NOTIFICATION_ATTEMPTED,
      outcome: 'attempted',
      targetType: 'user',
      targetId: userId,
      correlationId,
      metadata: { delivery: 'multicast', enabled: this.enabled },
    });
    const rows = await this.db
      .select({ fcmToken: deviceTokens.fcmToken })
      .from(deviceTokens)
      .where(eq(deviceTokens.userId, userId));

    if (rows.length === 0) {
      this.logger.warn(`sendToUser: no registered devices for userId=${userId}`);
      return { sent: 0, pruned: 0 };
    }

    const tokens = rows.map((r) => r.fcmToken);
    if (!this.enabled) {
      this.logger.debug(
        `[push disabled] user ${userId} (${tokens.length} device(s)): ${title} — ${body}`,
      );
      return { sent: 0, pruned: 0 };
    }

    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data,
      apns: {
        payload: { aps: { sound: 'default', 'interruption-level': 'time-sensitive' } },
      },
      android: { priority: 'high' },
    });

    const deadTokens = response.responses
      .map((r, i) => ({ r, token: tokens[i] }))
      .filter(({ r }) => !r.success && UNREGISTERED_FCM_ERROR_CODES.has(r.error?.code ?? ''))
      .map(({ token }) => token);

    for (const token of deadTokens) {
      await this.db.delete(deviceTokens).where(eq(deviceTokens.fcmToken, token));
    }

    this.logger.log(
      `sendToUser ${userId}: ${response.successCount}/${tokens.length} sent` +
        (deadTokens.length ? `, pruned ${deadTokens.length} dead token(s)` : ''),
    );
    await this.audit?.recordBestEffort({
      category: 'notification',
      action: AUDIT_ACTIONS.PUSH_NOTIFICATION_SENT,
      outcome: 'succeeded',
      targetType: 'user',
      targetId: userId,
      correlationId,
      metadata: {
        delivery: 'multicast',
        attempted: tokens.length,
        sent: response.successCount,
        failed: response.failureCount,
        pruned: deadTokens.length,
      },
    });
    return { sent: response.successCount, pruned: deadTokens.length };
  }

  private static readonly LINK_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L — avoids misreads when typed by hand
  private static readonly LINK_CODE_LENGTH = 8;
  private static readonly LINK_CODE_TTL_SECONDS = 300;
  private static linkCodeKey(code: string): string {
    return `push:link-code:${code}`;
  }

  /**
   * Generates a short-lived, single-use pairing code so an admin whose
   * portal login (e.g. GitHub) has no matching mobile sign-in provider can
   * still register a personal device against their admin userId — enter
   * the code once in the app and that device's FCM token is linked to this
   * admin account, without requiring the two logins to share an identity.
   */
  async createDeviceLinkCode(
    adminUserId: string,
  ): Promise<{ code: string; expiresInSeconds: number }> {
    const alphabet = PushService.LINK_CODE_ALPHABET;
    let code = '';
    for (let i = 0; i < PushService.LINK_CODE_LENGTH; i++) {
      code += alphabet[randomInt(alphabet.length)];
    }
    await this.cache.set(
      PushService.linkCodeKey(code),
      { userId: adminUserId },
      PushService.LINK_CODE_TTL_SECONDS,
    );
    return { code, expiresInSeconds: PushService.LINK_CODE_TTL_SECONDS };
  }

  /**
   * Redeems a pairing code from `createDeviceLinkCode`, registering the
   * caller's device against the code's target userId. Codes are consumed
   * atomically (never usable twice) via `CacheService.consumeOnce`.
   */
  async redeemDeviceLinkCode(
    code: string,
    fcmToken: string,
    platform?: string,
  ): Promise<{ userId: string }> {
    const normalized = code.trim().toUpperCase();
    const claim = await this.cache.consumeOnce<{ userId: string }>(
      PushService.linkCodeKey(normalized),
    );
    if (!claim) {
      await this.audit?.recordBestEffort({
        category: 'push',
        action: AUDIT_ACTIONS.PUSH_DEVICE_LINK_FAILED,
        outcome: 'failed',
        severity: 'warning',
        error: { code: 'INVALID_OR_EXPIRED_CODE', message: 'Device link code was invalid, expired, or already used' },
      });
      throw new BadRequestException('Invalid or expired code');
    }

    await this.registerDeviceToken(claim.userId, fcmToken, platform);
    await this.audit?.recordBestEffort({
      category: 'push',
      action: AUDIT_ACTIONS.PUSH_DEVICE_LINKED,
      outcome: 'succeeded',
      targetType: 'user',
      targetId: claim.userId,
      metadata: { platform },
    });
    return { userId: claim.userId };
  }
}
