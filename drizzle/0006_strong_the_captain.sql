ALTER TABLE "apikey" RENAME TO "api_key";--> statement-breakpoint
ALTER TABLE "api_key" DROP CONSTRAINT "apikey_key_unique";--> statement-breakpoint
ALTER TABLE "api_key" DROP CONSTRAINT "apikey_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_key_unique" UNIQUE("key");