-- One-time cleanup: these tables have accumulated rows with a NULL feed_key
-- from before feed-scoped ingestion existed. The nightly ingest replaces
-- rows scoped to `WHERE feed_key = <key>` (see GtfsStaticService.replaceFeedData),
-- so a NULL feed_key row can never be matched or refreshed by that logic —
-- it's permanently orphaned and unreachable by any current trip/stop lookup
-- (every currently-ingested row is guaranteed a non-null feed_key). Confirmed
-- via production query: ~15M orphaned rows total, ~70% of gtfs_stop_times.
-- Safe to delete unconditionally; re-running this DELETE is a no-op once done.
DELETE FROM "gtfs_stop_times" WHERE "feed_key" IS NULL;--> statement-breakpoint
DELETE FROM "gtfs_stop_routes" WHERE "feed_key" IS NULL;--> statement-breakpoint
DELETE FROM "gtfs_trips" WHERE "feed_key" IS NULL;--> statement-breakpoint
DELETE FROM "gtfs_calendar_dates" WHERE "feed_key" IS NULL;--> statement-breakpoint
DELETE FROM "gtfs_calendar" WHERE "feed_key" IS NULL;--> statement-breakpoint
DELETE FROM "gtfs_routes" WHERE "feed_key" IS NULL;--> statement-breakpoint
DELETE FROM "gtfs_stops" WHERE "feed_key" IS NULL;--> statement-breakpoint

-- Enforce going forward — every current ingest path always sets feed_key, so
-- this should never fail; it's here purely to stop this class of orphaned
-- data from silently reaccumulating if a future code path forgets to set it.
ALTER TABLE "gtfs_calendar" ALTER COLUMN "feed_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "gtfs_calendar_dates" ALTER COLUMN "feed_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "gtfs_routes" ALTER COLUMN "feed_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "gtfs_stops" ALTER COLUMN "feed_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "gtfs_stop_routes" ALTER COLUMN "feed_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "gtfs_stop_times" ALTER COLUMN "feed_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "gtfs_trips" ALTER COLUMN "feed_key" SET NOT NULL;
