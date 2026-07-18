ALTER TABLE "network_snapshots" ADD COLUMN "skipped_trips" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "network_snapshots" ADD COLUMN "early_trips" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "network_snapshots" ADD COLUMN "delay_p50_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "network_snapshots" ADD COLUMN "delay_p90_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "network_snapshots" ADD COLUMN "avg_occupancy" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "network_snapshots" ADD COLUMN "crowded_vehicles" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "network_snapshots" ADD COLUMN "scheduled_trips" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "line_performance_daily" ADD COLUMN "skipped_trips" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "line_performance_daily" ADD COLUMN "early_trips" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "line_performance_daily" ADD COLUMN "delay_p50_sum" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "line_performance_daily" ADD COLUMN "delay_p90_sum" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "line_performance_daily" ADD COLUMN "occupancy_score_sum" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "line_performance_daily" ADD COLUMN "occupancy_samples" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "line_performance_daily" ADD COLUMN "crowded_vehicle_samples" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "line_performance_daily" ADD COLUMN "peak_tracked_trips" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "line_performance_daily" ADD COLUMN "peak_delayed_trips" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "line_performance_daily" ADD COLUMN "off_peak_tracked_trips" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "line_performance_daily" ADD COLUMN "off_peak_delayed_trips" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "line_performance_daily" ADD COLUMN "disruption_count_by_effect" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "line_performance_daily" ADD COLUMN "scheduled_trips" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE "disruption_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"mode" text NOT NULL,
	"line" text NOT NULL,
	"alert_id" text NOT NULL,
	"effect" text,
	"cause" text
);--> statement-breakpoint
CREATE INDEX "disruption_events_line_time_idx" ON "disruption_events" USING btree ("line","captured_at");--> statement-breakpoint
CREATE INDEX "disruption_events_captured_at_idx" ON "disruption_events" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "network_snapshots_mode_line_time_idx" ON "network_snapshots" USING btree ("mode","line","captured_at");--> statement-breakpoint
CREATE MATERIALIZED VIEW "network_performance_daily_mv" AS
SELECT
  day,
  SUM(tracked_trips) AS total_tracked_trips,
  SUM(delayed_trips) AS total_delayed_trips,
  SUM(cancelled_trips) AS total_cancelled_trips,
  SUM(disruption_minutes) AS total_disruption_minutes,
  SUM(samples) AS total_samples,
  CASE
    WHEN SUM(tracked_trips) > 0
    THEN ROUND(1000.0 * (SUM(tracked_trips) - SUM(delayed_trips)) / SUM(tracked_trips)) / 10
    ELSE NULL
  END AS network_on_time_pct
FROM line_performance_daily
GROUP BY day;--> statement-breakpoint
CREATE UNIQUE INDEX "network_performance_daily_mv_day_idx" ON "network_performance_daily_mv" (day);
