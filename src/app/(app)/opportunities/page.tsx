import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { listOpportunities } from "@/lib/opportunities";
import { computeHealthMetrics } from "@/lib/dashboard-metrics";
import { HealthStrip, type Metric } from "@/components/health-strip";
import { EmptyState } from "@/components/empty-state";
import { OpportunityCard, type OpportunityRow } from "@/components/opportunity-card";

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
  { type: "gap", title: "Gaps" },
  { type: "decay", title: "At-risk" },
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
  const [healthMetrics, opportunityRows] = await Promise.all([
    computeHealthMetrics(db, project.id, asOf),
    listOpportunities(db, project.id) as Promise<OpportunityRow[]>,
  ]);

  const metrics: Metric[] = [
    { label: "Visibility", value: healthMetrics.visibility },
    { label: "Est. traffic", value: healthMetrics.estTraffic },
    { label: "Avg position", value: healthMetrics.avgPosition },
    { label: "Keywords", value: healthMetrics.keywordsTracked },
    { label: "Spend this month", value: healthMetrics.spend },
  ];

  const byType = new Map<string, OpportunityRow[]>();
  for (const row of opportunityRows) {
    const group = byType.get(row.type) ?? [];
    group.push(row);
    byType.set(row.type, group);
  }

  return (
    <div className="flex flex-col gap-8">
      <HealthStrip metrics={metrics} />

      {opportunityRows.length === 0 ? (
        <EmptyState
          title="No opportunities yet"
          description="Run a refresh to generate this week's shortlist."
        />
      ) : (
        SECTIONS.map(({ type, title }) => {
          const rows = byType.get(type);
          if (!rows?.length) return null;
          return (
            <section key={type} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {title}
                <span className="ml-2 font-normal normal-case text-neutral-400 dark:text-neutral-600">
                  {rows.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {rows.map((opp) => (
                  <OpportunityCard key={opp.id} opp={opp} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
