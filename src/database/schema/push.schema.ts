import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

/**
 * FCM device tokens, one row per device a user has signed in on. Replaces
 * the earlier Supabase-only `user_devices` table — the backend is now the
 * single source of truth for who to push to, whether that's a per-user send
 * (admin test notification) or a per-line topic broadcast (commute alerts).
 */
export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    fcmToken: text('fcm_token').notNull().unique(),
    platform: text('platform'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('device_tokens_user_idx').on(table.userId)],
);
