import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { getOrganicKeywords } from "@/lib/organic-keywords-store";
import { EmptyState } from "@/components/empty-state";
import { OrganicKeywordsTable } from "@/components/organic-keywords-table";
import { RunOrganicKeywordsButton } from "@/components/run-organic-keywords-button";

export const dynamic = "force-dynamic";

// Same implementation as src/app/(app)/backlinks/page.tsx's timeAgo (and
// audit/page.tsx's) — not a shared import (there isn't one in this codebase;
// each page keeps its own copy), but identical logic so "refreshed" reads
// consistently across pages.
function timeAgo(d: Date): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default async function OrganicKeywordsPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);
  if (!project) {
    return <EmptyState title="Create your first project in Settings" description="Add your site's domain in Settings to see the keywords it ranks for." />;
  }
  const { rows, capturedAt } = await getOrganicKeywords(db, project.id);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Organic Keywords</div>
          <p className="mt-1 text-sm text-neutral-600">
            Every keyword <span className="font-medium text-neutral-800">{project.domain}</span> ranks for in Google
            {capturedAt ? ` — refreshed ${timeAgo(capturedAt)}` : ""}.
          </p>
        </div>
        <RunOrganicKeywordsButton projectId={project.id} />
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="No organic keywords yet"
          description="Hit “Refresh organic keywords” to pull everything your domain ranks for (top 1,000 by volume)."
        />
      ) : (
        <OrganicKeywordsTable projectId={project.id} defaultLocationCode={project.defaultLocationCode} defaultLanguageCode={project.defaultLanguageCode} rows={rows} />
      )}
    </div>
  );
}
