import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { latestBacklinks, getBacklinksHistory } from "@/lib/backlinks-store";
import { EmptyState } from "@/components/empty-state";
import { BacklinksReport } from "@/components/backlinks-report";
import { BacklinksTrends } from "@/components/backlinks-trends";
import { RunBacklinksButton } from "@/components/run-backlinks-button";

export const dynamic = "force-dynamic";

function timeAgo(d: Date): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default async function BacklinksPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);

  if (!project) {
    return (
      <EmptyState
        title="Create your first project in Settings"
        description="Add your site's domain in Settings to analyze its backlink profile."
      />
    );
  }

  const [data, history] = await Promise.all([latestBacklinks(db, project.id), getBacklinksHistory(db, project.id)]);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Backlinks</div>
          <p className="mt-1 text-sm text-neutral-600">
            Who links to <span className="font-medium text-neutral-800">{project.domain}</span>
            {data ? ` — refreshed ${timeAgo(data.createdAt)}` : ""}.
          </p>
        </div>
        <RunBacklinksButton projectId={project.id} label={data ? "Refresh backlinks" : "Analyze backlinks"} />
      </div>

      {data ? (
        <>
          <BacklinksTrends history={history} />
          <BacklinksReport data={data} />
        </>
      ) : (
        <EmptyState
          title="No backlink data yet"
          description="Analyze your backlink profile — referring domains, anchor texts, dofollow split, and domain authority."
        />
      )}
    </div>
  );
}
