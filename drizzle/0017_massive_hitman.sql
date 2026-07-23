CREATE TABLE "audit_archive" (
	"id" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"data_object_key" text NOT NULL,
	"manifest_object_key" text NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"first_sequence" text,
	"last_sequence" text,
	"checksum_sha256" text,
	"manifest_checksum_sha256" text,
	"previous_manifest_checksum" text,
	"signature" text,
	"retention_until" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"sequence" bigserial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" text NOT NULL,
	"action" text NOT NULL,
	"severity" text NOT NULL,
	"outcome" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"actor_role" text,
	"impersonator_user_id" text,
	"target_type" text,
	"target_id" text,
	"reason" text,
	"before" jsonb,
	"after" jsonb,
	"changed_fields" jsonb,
	"metadata" jsonb,
	"error" jsonb,
	"request_id" text,
	"correlation_id" text,
	"source" text NOT NULL,
	"method" text,
	"route" text,
	"graphql_operation" text,
	"ip_network" text,
	"ip_fingerprint" text,
	"user_agent" text,
	"archive_id" text
);
--> statement-breakpoint
CREATE TABLE "audit_export" (
	"id" text PRIMARY KEY NOT NULL,
	"requested_by" text NOT NULL,
	"format" text NOT NULL,
	"filters" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"object_key" text,
	"row_count" integer,
	"checksum_sha256" text,
	"error" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "audit_archive_window_uidx" ON "audit_archive" USING btree ("window_start","window_end");--> statement-breakpoint
CREATE INDEX "audit_archive_status_idx" ON "audit_archive" USING btree ("status","window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_event_id_uidx" ON "audit_event" USING btree ("id");--> statement-breakpoint
CREATE INDEX "audit_event_occurred_seq_idx" ON "audit_event" USING btree ("occurred_at","sequence");--> statement-breakpoint
CREATE INDEX "audit_event_actor_idx" ON "audit_event" USING btree ("actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_event_target_idx" ON "audit_event" USING btree ("target_type","target_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_event_action_idx" ON "audit_event" USING btree ("action","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_event_category_idx" ON "audit_event" USING btree ("category","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_event_outcome_idx" ON "audit_event" USING btree ("outcome","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_event_severity_idx" ON "audit_event" USING btree ("severity","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_event_request_idx" ON "audit_event" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "audit_event_correlation_idx" ON "audit_event" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "audit_export_requester_idx" ON "audit_export" USING btree ("requested_by","created_at");--> statement-breakpoint
ALTER TABLE "audit_event"
  ADD CONSTRAINT "audit_event_actor_type_check"
  CHECK ("actor_type" IN ('user', 'api_key', 'system', 'anonymous'));--> statement-breakpoint
ALTER TABLE "audit_event"
  ADD CONSTRAINT "audit_event_outcome_check"
  CHECK ("outcome" IN ('attempted', 'succeeded', 'failed', 'denied'));--> statement-breakpoint
ALTER TABLE "audit_event"
  ADD CONSTRAINT "audit_event_severity_check"
  CHECK ("severity" IN ('info', 'warning', 'high', 'critical'));--> statement-breakpoint
ALTER TABLE "audit_event"
  ADD CONSTRAINT "audit_event_source_check"
  CHECK ("source" IN ('rest', 'graphql', 'auth', 'job'));--> statement-breakpoint
ALTER TABLE "audit_event"
  ADD CONSTRAINT "audit_event_reason_length_check"
  CHECK ("reason" IS NULL OR char_length("reason") BETWEEN 1 AND 1000);--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('jrail.audit_retention_worker', true) = 'on' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_event is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_event_append_only"
BEFORE UPDATE OR DELETE ON "audit_event"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_purge_verified_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count integer;
BEGIN
  PERFORM set_config('jrail.audit_retention_worker', 'on', true);
  WITH eligible AS (
    SELECT e.ctid
    FROM audit_event e
    WHERE e.occurred_at < now() - interval '12 months'
      AND EXISTS (
        SELECT 1
        FROM audit_archive a
        WHERE a.status = 'verified'
          AND a.verified_at IS NOT NULL
          AND a.retention_until > now()
          AND e.occurred_at >= a.window_start
          AND e.occurred_at < a.window_end
      )
    ORDER BY e.occurred_at, e.sequence
    LIMIT 10000
  )
  DELETE FROM audit_event e
  USING eligible
  WHERE e.ctid = eligible.ctid;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION audit_purge_verified_events() FROM PUBLIC;
