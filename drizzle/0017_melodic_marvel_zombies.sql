CREATE TABLE "reddit_radar_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"scanned_at" timestamp DEFAULT now() NOT NULL,
	"terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subreddits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"terms_scanned" integer DEFAULT 0 NOT NULL,
	"threads_total" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reddit_radar_snapshots" ADD CONSTRAINT "reddit_radar_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reddit_radar_project_scanned_idx" ON "reddit_radar_snapshots" USING btree ("project_id","scanned_at" DESC NULLS LAST);