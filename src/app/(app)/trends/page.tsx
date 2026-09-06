import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { getConfig } from "@/lib/config/resolve";
import { listLatestConversations } from "@/lib/reddit/conversations-store";
import { EmptyState, IntegrationLink } from "@/components/empty-state";
import { RedditConversations } from "@/components/reddit-conversations";
import { RunConversationsScanButton } from "@/components/run-conversations-scan-button";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);
  if (!project) {
    return <EmptyState title="Create your first project in Settings" description="Add your site's domain in Settings to surface Reddit conversations worth joining." />;
  }

  const cfg = await getConfig(db);
  const configured = cfg.reddit.configured || cfg.apify.configured;
  const conversations = configured ? await listLatestConversations(db, project.id, 20) : [];
  // RedditConversations filters status !== "dismissed" internally and defers the
  // empty state to this page (its doc comment), so the branch below must count
  // the same visible set — otherwise an all-dismissed project (the normal "caught
  // up" state for an engaged user) renders RedditConversations's empty <div>
  // instead of the "No conversations yet" EmptyState. RedditConversations still
  // gets the full `conversations` array — it does its own filtering.
  const visible = conversations.filter((c) => c.status !== "dismissed");

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Trends</div>
          <p className="mt-1 text-sm text-neutral-400">
            Conversations worth joining — real Reddit threads where{" "}
            <span className="font-medium text-neutral-200">{project.domain}</span> can add genuine value.
          </p>
        </div>
        {configured ? <RunConversationsScanButton projectId={project.id} /> : null}
      </div>

      {!configured ? (
        <EmptyState
          title="Reddit Conversations isn't connected"
          description="Connect the Reddit API (free) or Apify, plus an AI assistant, to surface threads worth joining."
          action={<IntegrationLink group="reddit" label="Connect Reddit" />}
        />
      ) : visible.length ? (
        <RedditConversations conversations={conversations} projectId={project.id} />
      ) : (
        <EmptyState
          title="No conversations yet"
          description="Run a scan to surface the Reddit threads where your site can add genuine value."
        />
      )}
    </div>
  );
}
