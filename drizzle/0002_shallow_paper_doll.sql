CREATE TABLE "request_log" (
	"id" text PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status_code" integer NOT NULL,
	"user_id" text,
	"key_id" text,
	"response_time_ms" integer NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "request_log_created_at_idx" ON "request_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "request_log_user_id_idx" ON "request_log" USING btree ("user_id");