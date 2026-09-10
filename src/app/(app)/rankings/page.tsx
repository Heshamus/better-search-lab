import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { listRankings, getAveragePositionHistory } from "@/lib/rankings";
import { EmptyState } from "@/components/empty-state";
import { RankingsTable } from "@/components/rankings-table";
import { RankingsSummary } from "@/components/rankings-summary";
import { RefreshRankingsButton } from "@/components/refresh-rankings-button";
import { TrendCard } from "@/components/trend-card";

// This page reads the DB (getCurrentProject/listRankings) via cookies() on
// every request — force-dynamic skips the build-time static-generation pass
// (which has no DB to connect to) rather than swallowing a non-fatal
// ECONNREFUSED. Purely a build-time hint; the route was already `ƒ` Dynamic.
export const dynamic = "force-dynamic";

// Server component (Task 5, mirrors Task 4's opportunities page): resolves
// the current project directly — no `/api` fetch;
// the (app) layout validates the session against the users table on every render (middleware only pre-filters for a JWT) — then reads this run's ranking rows straight from
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

  const posHistory = await getAveragePositionHistory(db, project.id);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Rank tracking</div>
          <p className="mt-1 text-sm text-neutral-600">Where your tracked keywords sit in Google.</p>
        </div>
        <RefreshRankingsButton projectId={project.id} />
      </div>

      <TrendCard
        title="Average position over time"
        points={posHistory.points}
        labels={posHistory.labels}
        format={(n) => n.toFixed(1)}
        invert
        emptyLabel="Refresh rankings again to build a trend"
      />

      <RankingsSummary rows={rows} />

      <section className="flex flex-col gap-3.5">
        <h2 className="text-sm font-semibold text-neutral-900">All keywords</h2>
        <RankingsTable rows={rows} />
      </section>
    </div>
  );
}
