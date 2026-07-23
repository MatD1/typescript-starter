import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const auditEvent = pgTable(
  'audit_event',
  {
    sequence: bigserial('sequence', { mode: 'number' }).primaryKey(),
    id: text('id').notNull(),
    version: integer('version').notNull().default(1),
    occurredAt: timestamp('occurred_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    recordedAt: timestamp('recorded_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    category: text('category').notNull(),
    action: text('action').notNull(),
    severity: text('severity').notNull(),
    outcome: text('outcome').notNull(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    actorRole: text('actor_role'),
    impersonatorUserId: text('impersonator_user_id'),
    targetType: text('target_type'),
    targetId: text('target_id'),
    reason: text('reason'),
    before: jsonb('before').$type<Record<string, unknown> | null>(),
    after: jsonb('after').$type<Record<string, unknown> | null>(),
    changedFields: jsonb('changed_fields').$type<string[] | null>(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    error: jsonb('error').$type<Record<string, unknown> | null>(),
    requestId: text('request_id'),
    correlationId: text('correlation_id'),
    source: text('source').notNull(),
    method: text('method'),
    route: text('route'),
    graphqlOperation: text('graphql_operation'),
    ipNetwork: text('ip_network'),
    ipFingerprint: text('ip_fingerprint'),
    userAgent: text('user_agent'),
    archiveId: text('archive_id'),
  },
  (table) => [
    uniqueIndex('audit_event_id_uidx').on(table.id),
    index('audit_event_occurred_seq_idx').on(
      table.occurredAt,
      table.sequence,
    ),
    index('audit_event_actor_idx').on(table.actorId, table.occurredAt),
    index('audit_event_target_idx').on(
      table.targetType,
      table.targetId,
      table.occurredAt,
    ),
    index('audit_event_action_idx').on(table.action, table.occurredAt),
    index('audit_event_category_idx').on(table.category, table.occurredAt),
    index('audit_event_outcome_idx').on(table.outcome, table.occurredAt),
    index('audit_event_severity_idx').on(table.severity, table.occurredAt),
    index('audit_event_request_idx').on(table.requestId),
    index('audit_event_correlation_idx').on(table.correlationId),
  ],
);

export const auditArchive = pgTable(
  'audit_archive',
  {
    id: text('id').primaryKey(),
    windowStart: timestamp('window_start', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    windowEnd: timestamp('window_end', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    dataObjectKey: text('data_object_key').notNull(),
    manifestObjectKey: text('manifest_object_key').notNull(),
    rowCount: integer('row_count').notNull().default(0),
    firstSequence: text('first_sequence'),
    lastSequence: text('last_sequence'),
    checksumSha256: text('checksum_sha256'),
    manifestChecksumSha256: text('manifest_checksum_sha256'),
    previousManifestChecksum: text('previous_manifest_checksum'),
    signature: text('signature'),
    retentionUntil: timestamp('retention_until', {
      withTimezone: true,
      mode: 'date',
    }),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    verifiedAt: timestamp('verified_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('audit_archive_window_uidx').on(
      table.windowStart,
      table.windowEnd,
    ),
    index('audit_archive_status_idx').on(table.status, table.windowStart),
  ],
);

export const auditExport = pgTable(
  'audit_export',
  {
    id: text('id').primaryKey(),
    requestedBy: text('requested_by').notNull(),
    format: text('format').notNull(),
    filters: jsonb('filters').$type<Record<string, unknown>>().notNull(),
    status: text('status').notNull().default('pending'),
    objectKey: text('object_key'),
    rowCount: integer('row_count'),
    checksumSha256: text('checksum_sha256'),
    error: text('error'),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (table) => [
    index('audit_export_requester_idx').on(
      table.requestedBy,
      table.createdAt,
    ),
  ],
);
