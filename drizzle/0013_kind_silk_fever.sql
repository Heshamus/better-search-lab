CREATE TABLE "ai_visibility_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"scanned_at" timestamp DEFAULT now() NOT NULL,
	"queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"engines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"named_total" integer DEFAULT 0 NOT NULL,
	"cited_total" integer DEFAULT 0 NOT NULL,
	"answers_total" integer DEFAULT 0 NOT NULL,
	"cited_sources" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_visibility_snapshots" ADD CONSTRAINT "ai_visibility_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_visibility_snapshots_project_scanned_idx" ON "ai_visibility_snapshots" USING btree ("project_id","scanned_at" DESC NULLS LAST);