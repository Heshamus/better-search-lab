CREATE TABLE "project_reddit_config" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"knowledge_brief" text,
	"subreddits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_reddit_config" ADD CONSTRAINT "project_reddit_config_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;