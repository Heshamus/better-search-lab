CREATE TABLE "ga_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"date" text NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"users" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ga_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"totals" jsonb,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"top_pages" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_connections" ADD COLUMN "ga_property_id" text;--> statement-breakpoint
ALTER TABLE "ga_daily" ADD CONSTRAINT "ga_daily_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_snapshots" ADD CONSTRAINT "ga_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;