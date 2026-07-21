CREATE TABLE "gtfs_ingest_feed_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"feed_key" text NOT NULL,
	"logical_mode" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"success" boolean,
	"skipped_unchanged" boolean DEFAULT false,
	"head_last_modified" text,
	"s3_key" text,
	"bytes" integer,
	"http_status" integer,
	"routes_count" integer,
	"trips_count" integer,
	"stops_count" integer,
	"stop_times_count" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "disruption_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"mode" text NOT NULL,
	"line" text NOT NULL,
	"alert_id" text NOT NULL,
	"effect" text,
	"cause" text
);
--> statement-breakpoint
CREATE TABLE "line_health_alerts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"line" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gtfs_calendar" ADD COLUMN "feed_key" text;--> statement-breakpoint
ALTER TABLE "gtfs_calendar_dates" ADD COLUMN "feed_key" text;--> statement-breakpoint
ALTER TABLE "gtfs_routes" ADD COLUMN "feed_key" text;--> statement-breakpoint
ALTER TABLE "gtfs_stops" ADD COLUMN "feed_key" text;--> statement-breakpoint
ALTER TABLE "gtfs_stop_routes" ADD COLUMN "feed_key" text;--> statement-breakpoint
ALTER TABLE "gtfs_stop_times" ADD COLUMN "feed_key" text;--> statement-breakpoint
ALTER TABLE "gtfs_trips" ADD COLUMN "feed_key" text;--> statement-breakpoint
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
ALTER TABLE "network_snapshots" ADD COLUMN "skipped_trips" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "network_snapshots" ADD COLUMN "early_trips" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "network_snapshots" ADD COLUMN "delay_p50_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "network_snapshots" ADD COLUMN "delay_p90_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "network_snapshots" ADD COLUMN "avg_occupancy" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "network_snapshots" ADD COLUMN "crowded_vehicles" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "network_snapshots" ADD COLUMN "scheduled_trips" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "gtfs_ingest_feed_runs_feed_key_idx" ON "gtfs_ingest_feed_runs" USING btree ("feed_key");--> statement-breakpoint
CREATE INDEX "gtfs_ingest_feed_runs_started_idx" ON "gtfs_ingest_feed_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "disruption_events_line_time_idx" ON "disruption_events" USING btree ("line","captured_at");--> statement-breakpoint
CREATE INDEX "disruption_events_captured_at_idx" ON "disruption_events" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "line_health_alerts_line_idx" ON "line_health_alerts" USING btree ("line");--> statement-breakpoint
CREATE INDEX "line_health_alerts_active_idx" ON "line_health_alerts" USING btree ("line","resolved_at");--> statement-breakpoint
CREATE INDEX "gtfs_calendar_feed_key_idx" ON "gtfs_calendar" USING btree ("feed_key");--> statement-breakpoint
CREATE INDEX "gtfs_calendar_dates_feed_key_idx" ON "gtfs_calendar_dates" USING btree ("feed_key");--> statement-breakpoint
CREATE INDEX "gtfs_routes_feed_key_idx" ON "gtfs_routes" USING btree ("feed_key");--> statement-breakpoint
CREATE INDEX "gtfs_stops_feed_key_idx" ON "gtfs_stops" USING btree ("feed_key");--> statement-breakpoint
CREATE INDEX "gtfs_stop_routes_feed_key_idx" ON "gtfs_stop_routes" USING btree ("feed_key");--> statement-breakpoint
CREATE INDEX "gtfs_stop_times_feed_key_idx" ON "gtfs_stop_times" USING btree ("feed_key");--> statement-breakpoint
CREATE INDEX "gtfs_trips_feed_key_idx" ON "gtfs_trips" USING btree ("feed_key");--> statement-breakpoint
CREATE INDEX "network_snapshots_mode_line_time_idx" ON "network_snapshots" USING btree ("mode","line","captured_at");