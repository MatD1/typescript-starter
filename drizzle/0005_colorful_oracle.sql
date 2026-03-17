DROP TABLE IF EXISTS "gtfs_stop_routes" CASCADE;
--> statement-breakpoint
CREATE TABLE "gtfs_stop_routes" (
	"stop_id" text NOT NULL,
	"route_id" text NOT NULL,
	"mode" text,
	CONSTRAINT "gtfs_stop_routes_stop_id_route_id_pk" PRIMARY KEY("stop_id","route_id")
);
--> statement-breakpoint
CREATE INDEX "gtfs_stop_routes_stop_idx" ON "gtfs_stop_routes" USING btree ("stop_id");--> statement-breakpoint
CREATE INDEX "gtfs_stop_routes_route_idx" ON "gtfs_stop_routes" USING btree ("route_id");
