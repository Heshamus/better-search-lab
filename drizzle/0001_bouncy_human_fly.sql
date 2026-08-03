CREATE TABLE "competitor_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"competitor_domain" text NOT NULL,
	"keyword" text NOT NULL,
	"competitor_rank" integer,
	"our_rank" integer,
	"volume" integer,
	"difficulty" integer,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD COLUMN "own_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "competitor_gaps" ADD CONSTRAINT "competitor_gaps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;