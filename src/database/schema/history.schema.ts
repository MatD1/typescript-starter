import {
  pgTable,
  text,
  integer,
  bigint,
  timestamp,
  date,
  index,
  primaryKey,
  bigserial,
} from 'drizzle-orm/pg-core';

/**
 * Historic network performance (NextThere-style).
 *
 * `networkSnapshots` — one row per (mode, line) per sampler run (5 min),
 * pruned after 14 days. `linePerformanceDaily` — permanent per-day rollup.
 * Because trips are sampled, totals are snapshot-weighted: a train that is
 * late for 30 minutes appears in ~6 samples, so on-time percentages are
 * time-weighted punctuality measures.
 */
export const networkSnapshots = pgTable(
  'network_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    capturedAt: timestamp('captured_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    mode: text('mode').notNull(),
    line: text('line').notNull(),
    vehicles: integer('vehicles').notNull().default(0),
    trackedTrips: integer('tracked_trips').notNull().default(0),
    /** delay > 5 min — TfNSW punctuality threshold */
    delayedTrips: integer('delayed_trips').notNull().default(0),
    cancelledTrips: integer('cancelled_trips').notNull().default(0),
    avgDelaySeconds: integer('avg_delay_seconds').notNull().default(0),
    maxDelaySeconds: integer('max_delay_seconds').notNull().default(0),
    activeDisruptions: integer('active_disruptions').notNull().default(0),
  },
  (table) => [
    index('network_snapshots_line_time_idx').on(table.line, table.capturedAt),
    index('network_snapshots_time_idx').on(table.capturedAt),
  ],
);

export const linePerformanceDaily = pgTable(
  'line_performance_daily',
  {
    day: date('day').notNull(),
    mode: text('mode').notNull(),
    line: text('line').notNull(),
    samples: integer('samples').notNull().default(0),
    trackedTrips: integer('tracked_trips').notNull().default(0),
    delayedTrips: integer('delayed_trips').notNull().default(0),
    cancelledTrips: integer('cancelled_trips').notNull().default(0),
    /** sum(avg_delay × tracked) per sample, for weighted means */
    delaySecondsSum: bigint('delay_seconds_sum', { mode: 'number' })
      .notNull()
      .default(0),
    maxDelaySeconds: integer('max_delay_seconds').notNull().default(0),
    /** active disruptions × sampler interval */
    disruptionMinutes: integer('disruption_minutes').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.mode, table.line] })],
);
