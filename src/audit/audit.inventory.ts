import { AUDIT_ACTIONS, type AuditAction } from './audit.types';

/**
 * Security-sensitive mutation inventory. CI compares this registry with every
 * REST mutating handler and GraphQL mutation. Adding a new mutation therefore
 * requires an explicit audit classification or the inventory test fails.
 */
export const AUDITED_MUTATION_INVENTORY: Readonly<Record<string, AuditAction>> = {
  'admin/admin.controller.ts:PATCH:users/:id':
    AUDIT_ACTIONS.ADMIN_USER_ROLE_CHANGED,
  'admin/admin.controller.ts:POST:users/:id/impersonate':
    AUDIT_ACTIONS.ADMIN_IMPERSONATION_STARTED,
  'admin/admin.controller.ts:POST:users/stop-impersonating':
    AUDIT_ACTIONS.ADMIN_IMPERSONATION_STOPPED,
  'admin/admin.controller.ts:DELETE:users/:id':
    AUDIT_ACTIONS.ADMIN_USER_DELETED,
  'admin/admin.controller.ts:POST:api-keys': AUDIT_ACTIONS.API_KEY_CREATED,
  'admin/admin.controller.ts:PATCH:api-keys/:id':
    AUDIT_ACTIONS.API_KEY_UPDATED,
  'admin/admin.controller.ts:DELETE:api-keys/:id':
    AUDIT_ACTIONS.API_KEY_REVOKED,
  'admin/admin.controller.ts:POST:api-keys/:id/reset-usage':
    AUDIT_ACTIONS.API_KEY_USAGE_RESET,
  'admin/admin.controller.ts:POST:gtfs/ingest':
    AUDIT_ACTIONS.GTFS_INGEST_ATTEMPTED,
  'admin/admin.controller.ts:DELETE:gtfs/cache':
    AUDIT_ACTIONS.CACHE_FLUSH_ATTEMPTED,
  'admin/admin.controller.ts:POST:notifications/test':
    AUDIT_ACTIONS.ADMIN_NOTIFICATION_TEST,
  'admin/admin.controller.ts:POST:notifications/service-alert':
    AUDIT_ACTIONS.ADMIN_SERVICE_ALERT,
  'admin/admin.controller.ts:POST:notifications/active-alerts/:line/resolve':
    AUDIT_ACTIONS.ADMIN_LINE_ALERT_RESOLVED,
  'admin/admin.controller.ts:POST:notifications/link-device-code':
    AUDIT_ACTIONS.ADMIN_DEVICE_LINK_CODE_CREATED,
  'audit/audit.controller.ts:POST:audit-events/exports':
    AUDIT_ACTIONS.AUDIT_EXPORT_REQUESTED,
  'audit/audit.controller.ts:POST:audit-archives/:id/verify':
    AUDIT_ACTIONS.AUDIT_ARCHIVE_VERIFIED,
  'auth/api-key.controller.ts:POST:': AUDIT_ACTIONS.API_KEY_CREATED,
  'auth/api-key.controller.ts:DELETE::id': AUDIT_ACTIONS.API_KEY_REVOKED,
  'auth/auth.controller.ts:ALL:*path': AUDIT_ACTIONS.AUTH_LOGIN_SUCCEEDED,
  'auth/session.controller.ts:POST:refresh':
    AUDIT_ACTIONS.AUTH_TOKEN_REFRESHED,
  'auth/supabase-auth.controller.ts:POST:exchange':
    AUDIT_ACTIONS.AUTH_TOKEN_EXCHANGED,
  'gtfs-static/gtfs-static.controller.ts:POST:ingest':
    AUDIT_ACTIONS.GTFS_INGEST_ATTEMPTED,
  'history/history.controller.ts:POST:backfill':
    AUDIT_ACTIONS.HISTORY_BACKFILL_ATTEMPTED,
  'history/history.controller.ts:POST:purge':
    AUDIT_ACTIONS.HISTORY_PURGE_ATTEMPTED,
  'push/push.controller.ts:POST:devices':
    AUDIT_ACTIONS.PUSH_DEVICE_REGISTERED,
  'push/push.controller.ts:POST:link-device':
    AUDIT_ACTIONS.PUSH_DEVICE_LINKED,
  'admin/admin.resolver.ts:GRAPHQL:adminUpdateUser':
    AUDIT_ACTIONS.ADMIN_USER_ROLE_CHANGED,
  'admin/admin.resolver.ts:GRAPHQL:adminDeleteUser':
    AUDIT_ACTIONS.ADMIN_USER_DELETED,
  'admin/admin.resolver.ts:GRAPHQL:adminImpersonateUser':
    AUDIT_ACTIONS.ADMIN_IMPERSONATION_STARTED,
  'admin/admin.resolver.ts:GRAPHQL:adminStopImpersonating':
    AUDIT_ACTIONS.ADMIN_IMPERSONATION_STOPPED,
  'admin/admin.resolver.ts:GRAPHQL:adminUpdateApiKey':
    AUDIT_ACTIONS.API_KEY_UPDATED,
  'admin/admin.resolver.ts:GRAPHQL:adminDeleteApiKey':
    AUDIT_ACTIONS.API_KEY_REVOKED,
  'admin/admin.resolver.ts:GRAPHQL:adminResetApiKeyUsage':
    AUDIT_ACTIONS.API_KEY_USAGE_RESET,
  'admin/admin.resolver.ts:GRAPHQL:adminTriggerGtfsIngest':
    AUDIT_ACTIONS.GTFS_INGEST_ATTEMPTED,
  'admin/admin.resolver.ts:GRAPHQL:adminFlushCache':
    AUDIT_ACTIONS.CACHE_FLUSH_ATTEMPTED,
  'audit/audit.resolver.ts:GRAPHQL:adminCreateAuditExport':
    AUDIT_ACTIONS.AUDIT_EXPORT_REQUESTED,
  'audit/audit.resolver.ts:GRAPHQL:adminVerifyAuditArchive':
    AUDIT_ACTIONS.AUDIT_ARCHIVE_VERIFIED,
};
