CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_enabled" boolean DEFAULT false NOT NULL,
	"rate_limit_time_window" integer,
	"rate_limit_max" integer,
	"request_count" integer DEFAULT 0 NOT NULL,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"permissions" text,
	"metadata" text,
	CONSTRAINT "apikey_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gtfs_calendar" (
	"service_id" text PRIMARY KEY NOT NULL,
	"monday" integer NOT NULL,
	"tuesday" integer NOT NULL,
	"wednesday" integer NOT NULL,
	"thursday" integer NOT NULL,
	"friday" integer NOT NULL,
	"saturday" integer NOT NULL,
	"sunday" integer NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"mode" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gtfs_calendar_dates" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"date" text NOT NULL,
	"exception_type" integer NOT NULL,
	"mode" text
);
--> statement-breakpoint
CREATE TABLE "gtfs_routes" (
	"route_id" text PRIMARY KEY NOT NULL,
	"agency_id" text,
	"route_short_name" text,
	"route_long_name" text,
	"route_type" integer,
	"route_color" text,
	"route_text_color" text,
	"mode" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gtfs_stops" (
	"stop_id" text PRIMARY KEY NOT NULL,
	"stop_code" text,
	"stop_name" text NOT NULL,
	"stop_lat" double precision,
	"stop_lon" double precision,
	"location_type" integer,
	"parent_station" text,
	"wheelchair_boarding" integer,
	"platform_code" text,
	"mode" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gtfs_stop_times" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"arrival_time" text,
	"departure_time" text,
	"stop_id" text NOT NULL,
	"stop_sequence" integer NOT NULL,
	"pickup_type" integer,
	"drop_off_type" integer,
	"mode" text
);
--> statement-breakpoint
CREATE TABLE "gtfs_trips" (
	"trip_id" text PRIMARY KEY NOT NULL,
	"route_id" text,
	"service_id" text,
	"trip_headsign" text,
	"trip_short_name" text,
	"direction_id" integer,
	"shape_id" text,
	"wheelchair_accessible" integer,
	"mode" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gtfs_stops_name_idx" ON "gtfs_stops" USING btree ("stop_name");--> statement-breakpoint
CREATE INDEX "gtfs_stop_times_trip_idx" ON "gtfs_stop_times" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "gtfs_stop_times_stop_idx" ON "gtfs_stop_times" USING btree ("stop_id");--> statement-breakpoint
CREATE INDEX "gtfs_trips_route_idx" ON "gtfs_trips" USING btree ("route_id");