import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { loadEnv } from "@/config/env";
import { getConnection } from "@/lib/google/store";
import { getLatestRadar } from "@/lib/reddit/store";
import { EmptyState } from "@/components/empty-state";
import { RedditRadar } from "@/components/reddit-radar";
import { RunRedditRadarButton } from "@/components/run-reddit-radar-button";

export const dynamic = "force-dynamic";

function ScanPanel({ projectId }: { projectId: string }) {
  return (
    <div className="panel flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
      </div>
      <h1 className="text-lg font-semibold text-white">Scan Reddit for your niche</h1>
      <p className="max-w-md text-sm text-neutral-400">
        We search Reddit for your real Search Console terms and surface which ones have active discussion, in which
        subreddits, and whether you already have a page for them. Runs daily once started.
      </p>
      <RunRedditRadarButton projectId={projectId} />
    </div>
  );
}

export default async function TrendsPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);
  if (!project) {
    return <EmptyState title="Create your first project in Settings" description="Add your site's domain in Settings to run the Reddit trend radar." />;
  }

  const env = loadEnv();
  const configured = Boolean(env.SERPAPI_API_KEY);
  const conn = configured ? await getConnection(db, project.id) : null;
  const radar = conn?.propertyUrl ? await getLatestRadar(db, project.id) : null;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Trends</div>
          <p className="mt-1 text-sm text-neutral-400">
            What your niche is discussing on Reddit — <span className="font-medium text-neutral-200">{project.domain}</span>.
          </p>
        </div>
        {radar ? <RunRedditRadarButton projectId={project.id} label="Re-scan" /> : null}
      </div>

      {!configured ? (
        <EmptyState title="Trends isn't configured" description="This instance needs a SerpApi key before the Reddit radar can run." />
      ) : !conn?.propertyUrl ? (
        <EmptyState title="Connect Search Console first" description="The radar's terms come from your real Search Console queries — connect it, then run a scan." />
      ) : !radar ? (
        <ScanPanel projectId={project.id} />
      ) : (
        <RedditRadar radar={radar} />
      )}
    </div>
  );
}
