ALTER TABLE "users" ADD COLUMN "supabase_user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_supabase_user_id_unique" UNIQUE("supabase_user_id");