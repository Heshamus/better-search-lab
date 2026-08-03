CREATE TABLE "competitor_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"competitor_domain" text NOT NULL,
	"keyword" text NOT NULL,
	"rank_absolute" integer,
	"url" text,
	"volume" integer,
	"difficulty" integer,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competitor_keywords" ADD CONSTRAINT "competitor_keywords_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;