export const AUDIT_ACTOR_TYPES = [
  'user',
  'api_key',
  'system',
  'anonymous',
] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_OUTCOMES = [
  'attempted',
  'succeeded',
  'failed',
  'denied',
] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const AUDIT_SEVERITIES = [
  'info',
  'warning',
  'high',
  'critical',
] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export const AUDIT_SOURCES = ['rest', 'graphql', 'auth', 'job'] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

export interface AuditActor {
  type: AuditActorType;
  id?: string;
  role?: string;
  impersonatorUserId?: string;
}

export interface AuditRequestContext {
  requestId: string;
  correlationId?: string;
  source: AuditSource;
  method?: string;
  route?: string;
  graphqlOperation?: string;
  ipNetwork?: string;
  ipFingerprint?: string;
  userAgent?: string;
  actor: AuditActor;
}

export interface AuditEventInput {
  id?: string;
  occurredAt?: Date;
  category: string;
  action: AuditAction;
  severity?: AuditSeverity;
  outcome: AuditOutcome;
  actor?: AuditActor;
  targetType?: string;
  targetId?: string;
  reason?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  changedFields?: string[];
  metadata?: Record<string, unknown>;
  error?: { code?: string; message: string };
  correlationId?: string;
  source?: AuditSource;
}

export interface AuditEventQuery {
  cursor?: string;
  limit?: number;
  from?: string;
  to?: string;
  eventId?: string;
  category?: string;
  action?: string;
  actorType?: AuditActorType;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  outcome?: AuditOutcome;
  severity?: AuditSeverity;
  requestId?: string;
  correlationId?: string;
  source?: AuditSource;
}

export interface AuditPage<T> {
  data: T[];
  nextCursor?: string;
}

export const AUDIT_ACTIONS = {
  ADMIN_USER_ROLE_CHANGED: 'admin.user.role_changed',
  ADMIN_USER_BAN_CHANGED: 'admin.user.ban_changed',
  ADMIN_USER_DELETED: 'admin.user.deleted',
  ADMIN_IMPERSONATION_STARTED: 'admin.user.impersonation_started',
  ADMIN_IMPERSONATION_STOPPED: 'admin.user.impersonation_stopped',
  API_KEY_CREATED: 'api_key.created',
  API_KEY_UPDATED: 'api_key.updated',
  API_KEY_REVOKED: 'api_key.revoked',
  API_KEY_USAGE_RESET: 'api_key.usage_reset',
  API_KEY_ELEVATED_PERMISSION_CHANGED:
    'api_key.elevated_permission_changed',
  AUTH_SIGNUP_SUCCEEDED: 'auth.signup.succeeded',
  AUTH_LOGIN_SUCCEEDED: 'auth.login.succeeded',
  AUTH_LOGIN_FAILED: 'auth.login.failed',
  AUTH_LOGOUT_SUCCEEDED: 'auth.logout.succeeded',
  AUTH_TOKEN_EXCHANGED: 'auth.token.exchanged',
  AUTH_TOKEN_REFRESHED: 'auth.token.refreshed',
  AUTH_TOKEN_REFRESH_FAILED: 'auth.token.refresh_failed',
  AUTH_BANNED_USER_DENIED: 'auth.banned_user.denied',
  AUTH_SESSION_REVOKED: 'auth.session.revoked',
  AUTH_REFRESH_REUSE_DETECTED: 'auth.refresh_token.reuse_detected',
  PUSH_DEVICE_REGISTERED: 'push.device.registered',
  PUSH_DEVICE_REMOVED: 'push.device.removed',
  PUSH_NOTIFICATION_ATTEMPTED: 'push.notification.attempted',
  PUSH_NOTIFICATION_SENT: 'push.notification.sent',
  PUSH_NOTIFICATION_FAILED: 'push.notification.failed',
  GTFS_INGEST_ATTEMPTED: 'gtfs.ingest.attempted',
  GTFS_INGEST_COMPLETED: 'gtfs.ingest.completed',
  GTFS_INGEST_FAILED: 'gtfs.ingest.failed',
  HISTORY_BACKFILL_ATTEMPTED: 'history.backfill.attempted',
  HISTORY_BACKFILL_COMPLETED: 'history.backfill.completed',
  HISTORY_BACKFILL_FAILED: 'history.backfill.failed',
  HISTORY_SAMPLE_COMPLETED: 'history.sample.completed',
  HISTORY_SAMPLE_FAILED: 'history.sample.failed',
  LINE_ALERT_CREATED: 'history.line_alert.created',
  LINE_ALERT_UPDATED: 'history.line_alert.updated',
  LINE_ALERT_RESOLVED: 'history.line_alert.resolved',
  HISTORY_PURGE_ATTEMPTED: 'history.purge.attempted',
  HISTORY_PURGE_COMPLETED: 'history.purge.completed',
  HISTORY_PURGE_FAILED: 'history.purge.failed',
  CACHE_FLUSH_ATTEMPTED: 'cache.flush.attempted',
  CACHE_FLUSH_COMPLETED: 'cache.flush.completed',
  CACHE_FLUSH_FAILED: 'cache.flush.failed',
  AUDIT_SEARCHED: 'audit.events.searched',
  AUDIT_VIEWED: 'audit.event.viewed',
  AUDIT_EXPORT_REQUESTED: 'audit.export.requested',
  AUDIT_EXPORT_COMPLETED: 'audit.export.completed',
  AUDIT_EXPORT_FAILED: 'audit.export.failed',
  AUDIT_ARCHIVE_CREATED: 'audit.archive.created',
  AUDIT_ARCHIVE_VERIFIED: 'audit.archive.verified',
  AUDIT_ARCHIVE_FAILED: 'audit.archive.failed',
  AUDIT_ARCHIVE_DOWNLOADED: 'audit.archive.downloaded',
  AUDIT_RETENTION_PURGED: 'audit.retention.purged',
  ADMIN_NOTIFICATION_TEST: 'admin.notification.test',
  ADMIN_SERVICE_ALERT: 'admin.notification.service_alert',
  ADMIN_LINE_ALERT_RESOLVED: 'admin.notification.line_alert_resolved',
  ADMIN_DEVICE_LINK_CODE_CREATED: 'admin.notification.device_link_code_created',
  PUSH_DEVICE_LINKED: 'push.device.linked',
  PUSH_DEVICE_LINK_FAILED: 'push.device.link_failed',
} as const;

export type AuditAction =
  (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const HIGH_RISK_REASON_ACTIONS = new Set<AuditAction>([
  AUDIT_ACTIONS.ADMIN_USER_ROLE_CHANGED,
  AUDIT_ACTIONS.ADMIN_USER_BAN_CHANGED,
  AUDIT_ACTIONS.ADMIN_USER_DELETED,
  AUDIT_ACTIONS.ADMIN_IMPERSONATION_STARTED,
  AUDIT_ACTIONS.API_KEY_ELEVATED_PERMISSION_CHANGED,
  AUDIT_ACTIONS.GTFS_INGEST_ATTEMPTED,
  AUDIT_ACTIONS.HISTORY_BACKFILL_ATTEMPTED,
  AUDIT_ACTIONS.HISTORY_PURGE_ATTEMPTED,
  AUDIT_ACTIONS.CACHE_FLUSH_ATTEMPTED,
  AUDIT_ACTIONS.ADMIN_NOTIFICATION_TEST,
  AUDIT_ACTIONS.ADMIN_SERVICE_ALERT,
  AUDIT_ACTIONS.ADMIN_LINE_ALERT_RESOLVED,
  AUDIT_ACTIONS.ADMIN_DEVICE_LINK_CODE_CREATED,
]);
