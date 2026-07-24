import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

export const requestLog = pgTable(
  'request_log',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id'),
    method: text('method').notNull(),
    path: text('path').notNull(),
    statusCode: integer('status_code').notNull(),
    userId: text('user_id'),
    keyId: text('key_id'),
    responseTimeMs: integer('response_time_ms').notNull(),
    ipAddress: text('ip_address'),
    ipNetwork: text('ip_network'),
    ipFingerprint: text('ip_fingerprint'),
    userAgent: text('user_agent'),
    error: text('error'),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('request_log_created_at_idx').on(table.createdAt),
    index('request_log_created_at_id_idx').on(table.createdAt, table.id),
    index('request_log_request_id_idx').on(table.requestId),
    index('request_log_user_id_idx').on(table.userId),
  ],
);
