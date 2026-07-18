CREATE TABLE "line_performance_daily" (
	"day" date NOT NULL,
	"mode" text NOT NULL,
	"line" text NOT NULL,
	"samples" integer DEFAULT 0 NOT NULL,
	"tracked_trips" integer DEFAULT 0 NOT NULL,
	"delayed_trips" integer DEFAULT 0 NOT NULL,
	"cancelled_trips" integer DEFAULT 0 NOT NULL,
	"delay_seconds_sum" bigint DEFAULT 0 NOT NULL,
	"max_delay_seconds" integer DEFAULT 0 NOT NULL,
	"disruption_minutes" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "line_performance_daily_day_mode_line_pk" PRIMARY KEY("day","mode","line")
);
--> statement-breakpoint
CREATE TABLE "network_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mode" text NOT NULL,
	"line" text NOT NULL,
	"vehicles" integer DEFAULT 0 NOT NULL,
	"tracked_trips" integer DEFAULT 0 NOT NULL,
	"delayed_trips" integer DEFAULT 0 NOT NULL,
	"cancelled_trips" integer DEFAULT 0 NOT NULL,
	"avg_delay_seconds" integer DEFAULT 0 NOT NULL,
	"max_delay_seconds" integer DEFAULT 0 NOT NULL,
	"active_disruptions" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "network_snapshots_line_time_idx" ON "network_snapshots" USING btree ("line","captured_at");--> statement-breakpoint
CREATE INDEX "network_snapshots_time_idx" ON "network_snapshots" USING btree ("captured_at");