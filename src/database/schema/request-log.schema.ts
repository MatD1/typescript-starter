import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

export const requestLog = pgTable(
  'request_log',
  {
    id: text('id').primaryKey(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    statusCode: integer('status_code').notNull(),
    userId: text('user_id'),
    keyId: text('key_id'),
    responseTimeMs: integer('response_time_ms').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('request_log_created_at_idx').on(table.createdAt),
    index('request_log_user_id_idx').on(table.userId),
  ],
);
