import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { listCompetitors, listGapSignals } from "@/lib/competitors";
import { EmptyState } from "@/components/empty-state";
import { GapTable } from "@/components/gap-table";
import { RefreshGapsButton } from "@/components/refresh-gaps-button";

// Server component (Task 8, mirrors Tasks 4-7): resolves the current project
// directly — no /api fetch, (app)/* is already middleware-guarded — then
// reads the competitor roster + this project's keyword-gap rows straight
// from src/lib. All mutation (Refresh gaps, per-row Add to tracking) lives
// in the nested client RefreshGapsButton / GapTable, which fetch a guarded
// /api/* route and then router.refresh() this page.
//
// Share-of-voice is DEFERRED (competitor-rank-per-tracked-keyword is not
// captured — rank_snapshots stores only OUR rank, so there is no honest SoV
// data source yet) — this page renders a muted "coming soon" note instead
// of computing or faking a number/chart.
export default async function CompetitorsPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);

  if (!project) {
    return (
      <EmptyState
        title="Create your first project in Settings"
        description="Add your site's domain in Settings to start tracking competitors."
      />
    );
  }

  const [competitorRows, gapRows] = await Promise.all([
    listCompetitors(db, project.id),
    listGapSignals(db, project.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {competitorRows.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No competitors yet — gaps need at least one competitor domain, added in Settings.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {competitorRows.map((c) => (
              <span
                key={c.id}
                className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
              >
                {c.domain}
              </span>
            ))}
          </div>
        )}
        <RefreshGapsButton projectId={project.id} />
      </div>

      <GapTable
        rows={gapRows}
        projectId={project.id}
        defaultLocationCode={project.defaultLocationCode}
        defaultLanguageCode={project.defaultLanguageCode}
      />

      <p className="text-xs text-neutral-400 dark:text-neutral-600">Share of voice — coming soon.</p>
    </div>
  );
}
