CREATE TABLE "place" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fsq_id" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"category" varchar(100),
	"address" text,
	"city" varchar(120),
	"country" varchar(80),
	"lat" double precision,
	"lng" double precision,
	"data" jsonb,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "place_fsq_id_idx" ON "place" USING btree ("fsq_id");--> statement-breakpoint
CREATE INDEX "place_refreshed_at_idx" ON "place" USING btree ("refreshed_at");