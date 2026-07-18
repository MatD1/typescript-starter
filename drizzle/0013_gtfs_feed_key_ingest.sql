ALTER TABLE "gtfs_stops" ADD COLUMN IF NOT EXISTS "feed_key" text;
ALTER TABLE "gtfs_routes" ADD COLUMN IF NOT EXISTS "feed_key" text;
ALTER TABLE "gtfs_trips" ADD COLUMN IF NOT EXISTS "feed_key" text;
ALTER TABLE "gtfs_calendar" ADD COLUMN IF NOT EXISTS "feed_key" text;
ALTER TABLE "gtfs_calendar_dates" ADD COLUMN IF NOT EXISTS "feed_key" text;
ALTER TABLE "gtfs_stop_times" ADD COLUMN IF NOT EXISTS "feed_key" text;
ALTER TABLE "gtfs_stop_routes" ADD COLUMN IF NOT EXISTS "feed_key" text;

CREATE INDEX IF NOT EXISTS "gtfs_stops_feed_key_idx" ON "gtfs_stops" ("feed_key");
CREATE INDEX IF NOT EXISTS "gtfs_routes_feed_key_idx" ON "gtfs_routes" ("feed_key");
CREATE INDEX IF NOT EXISTS "gtfs_trips_feed_key_idx" ON "gtfs_trips" ("feed_key");
CREATE INDEX IF NOT EXISTS "gtfs_calendar_feed_key_idx" ON "gtfs_calendar" ("feed_key");
CREATE INDEX IF NOT EXISTS "gtfs_calendar_dates_feed_key_idx" ON "gtfs_calendar_dates" ("feed_key");
CREATE INDEX IF NOT EXISTS "gtfs_stop_times_feed_key_idx" ON "gtfs_stop_times" ("feed_key");
CREATE INDEX IF NOT EXISTS "gtfs_stop_routes_feed_key_idx" ON "gtfs_stop_routes" ("feed_key");

CREATE TABLE IF NOT EXISTS "gtfs_ingest_feed_runs" (
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

CREATE INDEX IF NOT EXISTS "gtfs_ingest_feed_runs_feed_key_idx" ON "gtfs_ingest_feed_runs" ("feed_key");
CREATE INDEX IF NOT EXISTS "gtfs_ingest_feed_runs_started_idx" ON "gtfs_ingest_feed_runs" ("started_at");
