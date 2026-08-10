import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { loadEnv } from "@/config/env";
import { listLatestConversations } from "@/lib/reddit/conversations-store";
import { EmptyState } from "@/components/empty-state";
import { RedditConversations } from "@/components/reddit-conversations";
import { RunConversationsScanButton } from "@/components/run-conversations-scan-button";
import { conversationFetchConfigured } from "@/lib/reddit/scrape-source";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);
  if (!project) {
    return <EmptyState title="Create your first project in Settings" description="Add your site's domain in Settings to surface Reddit conversations worth joining." />;
  }

  const env = loadEnv();
  const configured = conversationFetchConfigured(env);
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
          title="Reddit Conversations needs an Apify key"
          description="This instance needs an Apify key before it can scan Reddit for conversations worth joining."
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
