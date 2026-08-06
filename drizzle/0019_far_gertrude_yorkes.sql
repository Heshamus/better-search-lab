CREATE TABLE "reddit_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"scan_date" date NOT NULL,
	"thread_url" text NOT NULL,
	"subreddit" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"up_votes" integer,
	"num_comments" integer,
	"posted_at" timestamp with time zone,
	"why_it_matters" text DEFAULT '' NOT NULL,
	"draft_reply" text DEFAULT '' NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"promo_risk" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reddit_conversations" ADD CONSTRAINT "reddit_conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reddit_conversations_project_url_idx" ON "reddit_conversations" USING btree ("project_id","thread_url");