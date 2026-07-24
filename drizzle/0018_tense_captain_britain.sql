ALTER TABLE "request_log" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "request_log" ADD COLUMN "ip_network" text;--> statement-breakpoint
ALTER TABLE "request_log" ADD COLUMN "ip_fingerprint" text;--> statement-breakpoint
ALTER TABLE "request_log" ADD COLUMN "error_code" text;--> statement-breakpoint
UPDATE "request_log" SET "ip_address" = NULL WHERE "ip_address" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "request_log_created_at_id_idx" ON "request_log" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "request_log_request_id_idx" ON "request_log" USING btree ("request_id");
