import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { loadEnv } from "@/config/env";
import { listLatestConversations } from "@/lib/reddit/conversations-store";
import { EmptyState } from "@/components/empty-state";
import { RedditConversations } from "@/components/reddit-conversations";
import { RunConversationsScanButton } from "@/components/run-conversations-scan-button";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);
  if (!project) {
    return <EmptyState title="Create your first project in Settings" description="Add your site's domain in Settings to run the Reddit trend radar." />;
  }

  const env = loadEnv();
  const configured = Boolean(env.APIFY_API_KEY);
  const conversations = configured ? await listLatestConversations(db, project.id, 20) : [];

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
      ) : conversations.length ? (
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
