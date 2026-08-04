import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { listOpportunities } from "@/lib/opportunities";
import { computeHealthMetrics } from "@/lib/dashboard-metrics";
import { computeDashboard } from "@/lib/dashboard";
import { HealthStrip, type Metric } from "@/components/health-strip";
import { DashboardCharts } from "@/components/dashboard-charts";
import { EmptyState } from "@/components/empty-state";
import { OpportunityCard, type OpportunityRow } from "@/components/opportunity-card";
import { RefreshDataButton } from "@/components/refresh-data-button";
import { formatCompact } from "@/lib/format";

// This page reads the DB (getCurrentProject/listOpportunities) via cookies()
// on every request — force-dynamic skips the build-time static-generation
// pass (which has no DB to connect to) rather than swallowing a non-fatal
// ECONNREFUSED. Purely a build-time hint; the route was already `ƒ` Dynamic.
export const dynamic = "force-dynamic";

// Section order + human titles (brief §8, Task 4): striking distance leads
// (the most immediately actionable — a top-3 push), gaps and at-risk decay
// follow, then rising momentum, then the two more structural types.
const SECTIONS: { type: string; title: string }[] = [
  { type: "striking_distance", title: "Striking distance" },
  { type: "ctr_gap", title: "Click-through gaps" },
  { type: "gap", title: "Gaps" },
  { type: "decay", title: "At-risk" },
  { type: "content_vs_ranking", title: "Page fixes" },
  { type: "momentum", title: "Rising" },
  { type: "serp_feature", title: "SERP features" },
  { type: "cannibalization", title: "Cannibalization" },
];

// This is the dashboard's centerpiece (Task 4): the opportunities landing.
// Server component — resolves the current project directly (no /api fetch;
// (app)/* is already middleware-guarded), computes the health strip and
// reads this week's shortlist straight from `src/lib`, then groups it into
// calm, scannable advisor-card sections. All mutation (Track/Dismiss) lives
// in the nested client `OpportunityActions`.
//
// Task 17: opportunities only populated via the Monday cron until now, so
// a project with fresh keywords/competitors saw an empty shortlist with no
// way to force one. `RefreshDataButton` chains all three on-demand jobs
// (rank_refresh -> gap_refresh -> weekly_opportunities, the same order and
// dependency weekly_opportunities' loadDetectorInput reads) — always
// rendered, including the empty state, mirroring competitor-intel-panel.tsx's
// "first fetch still needs a trigger" rule.
export default async function OpportunitiesPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);

  if (!project) {
    return (
      <EmptyState
        title="Create your first project in Settings"
        description="Add your site's domain in Settings to start generating this week's opportunities."
      />
    );
  }

  const asOf = new Date();
  const [healthMetrics, dashboard, opportunityRows] = await Promise.all([
    computeHealthMetrics(db, project.id, asOf),
    computeDashboard(db, project.id),
    listOpportunities(db, project.id) as Promise<OpportunityRow[]>,
  ]);

  // Portfolio metrics that are populated the moment a project is profiled +
  // refreshed (unlike visibility/position, which stay empty until the site
  // actually ranks — those live in the Ranking-distribution chart instead).
  const metrics: Metric[] = [
    { label: "Keywords", value: String(dashboard.keywordsTracked), hint: "tracked" },
    { label: "Opportunities", value: String(dashboard.opportunityCount), hint: "this week" },
    { label: "Addressable volume", value: formatCompact(dashboard.addressableVolume), hint: "monthly searches" },
    { label: "Avg difficulty", value: dashboard.avgDifficulty != null ? String(dashboard.avgDifficulty) : "—", hint: "across opportunities" },
    { label: "Spend this month", value: healthMetrics.spend },
  ];
  const hasData = dashboard.keywordsTracked > 0 || dashboard.opportunityCount > 0;

  const byType = new Map<string, OpportunityRow[]>();
  for (const row of opportunityRows) {
    const group = byType.get(row.type) ?? [];
    group.push(row);
    byType.set(row.type, group);
  }
  // Shared scale so every volume bar across the feed is comparable.
  const maxVolume = Math.max(0, ...opportunityRows.map((row) => row.volume ?? 0));

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow">This week&rsquo;s shortlist</div>
          <p className="mt-1 text-sm text-neutral-400">
            The highest-leverage moves for <span className="font-medium text-neutral-200">{project.domain}</span>.
          </p>
        </div>
        <RefreshDataButton projectId={project.id} />
      </div>

      <HealthStrip metrics={metrics} />

      {hasData ? (
        <section className="flex flex-col gap-3.5">
          <h2 className="text-sm font-semibold text-white">Overview</h2>
          <DashboardCharts data={dashboard} />
        </section>
      ) : null}

      {opportunityRows.length === 0 ? (
        <EmptyState
          title="No opportunities yet"
          description="Track some keywords, then use Refresh data to generate this week's shortlist."
        />
      ) : (
        SECTIONS.map(({ type, title }) => {
          const rows = byType.get(type);
          if (!rows?.length) return null;
          return (
            <section key={type} className="flex flex-col gap-3.5">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold text-white">{title}</h2>
                <span className="tnum rounded-full bg-neutral-800/80 px-2 py-0.5 text-[0.7rem] text-neutral-400">{rows.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
                {rows.map((opp) => (
                  <OpportunityCard key={opp.id} opp={opp} maxVolume={maxVolume} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
