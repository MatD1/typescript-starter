ALTER TABLE "api_key" DROP CONSTRAINT "api_key_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_reference_id_users_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" DROP COLUMN "user_id";