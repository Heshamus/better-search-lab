import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { listRankings } from "@/lib/rankings";
import { EmptyState } from "@/components/empty-state";
import { RankingsTable } from "@/components/rankings-table";
import { RefreshRankingsButton } from "@/components/refresh-rankings-button";

// This page reads the DB (getCurrentProject/listRankings) via cookies() on
// every request — force-dynamic skips the build-time static-generation pass
// (which has no DB to connect to) rather than swallowing a non-fatal
// ECONNREFUSED. Purely a build-time hint; the route was already `ƒ` Dynamic.
export const dynamic = "force-dynamic";

// Server component (Task 5, mirrors Task 4's opportunities page): resolves
// the current project directly — no `/api` fetch, `(app)/*` is already
// middleware-guarded — then reads this run's ranking rows straight from
// `src/lib`. All interactivity (sort, per-keyword history drill-in) lives in
// the client `RankingsTable`.
//
// Task 17: rankings only populated via the Monday cron until now, so a
// freshly-tracked keyword sat at "not yet checked" with no way to force a
// fetch. `RefreshRankingsButton` (single-route rank_refresh) fixes that —
// gated on `rows.length > 0` because rank_refresh iterates tracked
// keywords, so with zero tracked it would be a pointless no-op (mirrors the
// competitors page gating `RefreshGapsButton` on `competitorRows.length`).
export default async function RankingsPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);

  if (!project) {
    return (
      <EmptyState
        title="Create your first project in Settings"
        description="Add your site's domain in Settings to start tracking keyword rankings."
      />
    );
  }

  const rows = await listRankings(db, project.id, new Date());

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No tracked keywords yet"
        description="Track a keyword from Opportunities or Keywords to start seeing rank history here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <RefreshRankingsButton projectId={project.id} />
      </div>
      <RankingsTable rows={rows} />
    </div>
  );
}
