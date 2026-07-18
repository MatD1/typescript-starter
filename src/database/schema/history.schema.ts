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
  jsonb,
} from 'drizzle-orm/pg-core';
import { SNAPSHOT_RETENTION_DAYS } from '../../history/history.constants';

/**
 * Historic network performance (NextThere-style).
 *
 * `networkSnapshots` — one row per (mode, line) per sampler run (5 min),
 * pruned after {@link SNAPSHOT_RETENTION_DAYS} days. `linePerformanceDaily` —
 * permanent per-day rollup. Because trips are sampled, totals are
 * snapshot-weighted: a train that is late for 30 minutes appears in ~6
 * samples, so on-time percentages are time-weighted punctuality measures.
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
    skippedTrips: integer('skipped_trips').notNull().default(0),
    earlyTrips: integer('early_trips').notNull().default(0),
    avgDelaySeconds: integer('avg_delay_seconds').notNull().default(0),
    maxDelaySeconds: integer('max_delay_seconds').notNull().default(0),
    delayP50Seconds: integer('delay_p50_seconds').notNull().default(0),
    delayP90Seconds: integer('delay_p90_seconds').notNull().default(0),
    avgOccupancy: integer('avg_occupancy').notNull().default(0),
    crowdedVehicles: integer('crowded_vehicles').notNull().default(0),
    activeDisruptions: integer('active_disruptions').notNull().default(0),
    scheduledTrips: integer('scheduled_trips').notNull().default(0),
  },
  (table) => [
    index('network_snapshots_line_time_idx').on(table.line, table.capturedAt),
    index('network_snapshots_time_idx').on(table.capturedAt),
    index('network_snapshots_mode_line_time_idx').on(
      table.mode,
      table.line,
      table.capturedAt,
    ),
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
    skippedTrips: integer('skipped_trips').notNull().default(0),
    earlyTrips: integer('early_trips').notNull().default(0),
    /** sum(avg_delay × tracked) per sample, for weighted means */
    delaySecondsSum: bigint('delay_seconds_sum', { mode: 'number' })
      .notNull()
      .default(0),
    maxDelaySeconds: integer('max_delay_seconds').notNull().default(0),
    delayP50Sum: bigint('delay_p50_sum', { mode: 'number' })
      .notNull()
      .default(0),
    delayP90Sum: bigint('delay_p90_sum', { mode: 'number' })
      .notNull()
      .default(0),
    /** Weighted occupancy score sum (0–4 scale) for averaging */
    occupancyScoreSum: bigint('occupancy_score_sum', { mode: 'number' })
      .notNull()
      .default(0),
    occupancySamples: integer('occupancy_samples').notNull().default(0),
    crowdedVehicleSamples: integer('crowded_vehicle_samples')
      .notNull()
      .default(0),
    peakTrackedTrips: integer('peak_tracked_trips').notNull().default(0),
    peakDelayedTrips: integer('peak_delayed_trips').notNull().default(0),
    offPeakTrackedTrips: integer('off_peak_tracked_trips')
      .notNull()
      .default(0),
    offPeakDelayedTrips: integer('off_peak_delayed_trips')
      .notNull()
      .default(0),
    /** Effect-weighted disruption minutes */
    disruptionMinutes: integer('disruption_minutes').notNull().default(0),
    disruptionCountByEffect: jsonb('disruption_count_by_effect')
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    scheduledTrips: integer('scheduled_trips').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.mode, table.line] })],
);

/** Per-sample disruption drill-down (optional detail, not rolled into daily counters). */
export const disruptionEvents = pgTable(
  'disruption_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    mode: text('mode').notNull(),
    line: text('line').notNull(),
    alertId: text('alert_id').notNull(),
    effect: text('effect'),
    cause: text('cause'),
  },
  (table) => [
    index('disruption_events_line_time_idx').on(table.line, table.capturedAt),
    index('disruption_events_captured_at_idx').on(table.capturedAt),
  ],
);
