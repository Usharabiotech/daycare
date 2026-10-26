CREATE TYPE "public"."claim_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "centre_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"note" text,
	"status" "claim_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"dependant_id" uuid NOT NULL,
	"age_group" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "centre_claims" ADD CONSTRAINT "centre_claims_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_dependant_id_dependants_id_fk" FOREIGN KEY ("dependant_id") REFERENCES "public"."dependants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "centre_claims_location_idx" ON "centre_claims" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interests_location_dependant_uq" ON "interests" USING btree ("location_id","dependant_id");--> statement-breakpoint
CREATE INDEX "interests_customer_idx" ON "interests" USING btree ("customer_id");