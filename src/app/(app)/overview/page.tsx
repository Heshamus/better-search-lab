import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { getGscData, getGaData } from "@/lib/google/store";
import { computeDashboard } from "@/lib/dashboard";
import { listOpportunities } from "@/lib/opportunities";
import { latestAudit } from "@/lib/audit/store";
import { latestBacklinks } from "@/lib/backlinks-store";
import { listCompetitors } from "@/lib/competitors";
import { OverviewHeadline } from "@/components/overview-headline";
import { RefreshDataButton } from "@/components/refresh-data-button";
import { EmptyState } from "@/components/empty-state";
import { formatCompact } from "@/lib/format";
import type { OpportunityRow } from "@/components/opportunity-card";

export const dynamic = "force-dynamic";

// Human labels for the action-list type chips.
const TYPE_LABEL: Record<string, string> = {
  striking_distance: "Striking distance",
  ctr_gap: "Click-through gap",
  content_vs_ranking: "Page fix",
  gap: "Gap",
  decay: "At-risk",
  momentum: "Rising",
  serp_feature: "SERP feature",
  cannibalization: "Cannibalization",
};
// Types that are, by construction, grounded in first-party Search Console / GA
// data — safe to badge even though the stored row doesn't carry a dataSource.
const GROUNDED = new Set(["ctr_gap", "content_vs_ranking"]);

function HealthTile({ href, label, value, hint }: { href: string; label: string; value: string; hint: string }) {
  return (
    <a href={href} className="panel group flex flex-col gap-1.5 px-4 py-3.5 transition-colors hover:border-neutral-700">
      <span className="eyebrow">{label}</span>
      <span className="num text-[1.4rem] font-semibold leading-none tracking-tight text-white">{value}</span>
      <span className="text-[0.7rem] text-neutral-500">{hint}</span>
    </a>
  );
}

// The State-of-SEO command center + home screen: real Search Console / Analytics
// headline, the DeepSeek-sequenced "do this next" action list (read from the
// stored, advisor-polished opportunities), and health tiles that link out.
export default async function OverviewPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);
  if (!project) {
    return <EmptyState title="Create your first project in Settings" description="Add your site's domain in Settings to see the state of your SEO." />;
  }

  const [gsc, ga, dashboard, opportunities, audit, backlinks, competitors] = await Promise.all([
    getGscData(db, project.id),
    getGaData(db, project.id),
    computeDashboard(db, project.id),
    listOpportunities(db, project.id) as Promise<OpportunityRow[]>,
    latestAudit(db, project.id),
    latestBacklinks(db, project.id),
    listCompetitors(db, project.id),
  ]);

  const actions = opportunities.slice(0, 8);
  const gscHead = gsc?.totals ? { clicks: gsc.totals.clicks, impressions: gsc.totals.impressions, position: gsc.totals.position } : null;
  const gaHead = ga?.totals ? { sessions: ga.totals.sessions, engagementRate: ga.totals.engagementRate, conversions: ga.totals.conversions } : null;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow">Overview</div>
          <p className="mt-1 text-sm text-neutral-400">
            The state of search for <span className="font-medium text-neutral-200">{project.domain}</span>.
          </p>
        </div>
        <RefreshDataButton projectId={project.id} />
      </div>

      <OverviewHeadline gsc={gscHead} ga={gaHead} />

      <section className="flex flex-col gap-3.5">
        <h2 className="text-sm font-semibold text-white">Do this next</h2>
        {actions.length ? (
          <ol className="flex flex-col gap-2.5">
            {actions.map((o, i) => (
              <li key={o.id}>
                <a href="/opportunities" className="panel group flex items-start gap-3 px-4 py-3 transition-colors hover:border-neutral-700">
                  <span className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-neutral-100">{o.why}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="eyebrow">{TYPE_LABEL[o.type] ?? o.type}</span>
                      {GROUNDED.has(o.type) ? (
                        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[0.62rem] font-medium text-accent">grounded in Search Console</span>
                      ) : null}
                      {o.upsideEstimate ? <span className="tnum text-[0.7rem] text-neutral-500">{o.upsideEstimate}</span> : null}
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            title="No actions yet"
            description="Connect Search Console & Analytics, track some keywords, then hit Refresh data to generate this week's action list."
          />
        )}
      </section>

      <section className="flex flex-col gap-3.5">
        <h2 className="text-sm font-semibold text-white">Health</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HealthTile href="/audit" label="Site audit" value={audit ? String(audit.score) : "—"} hint="score / 100" />
          <HealthTile href="/backlinks" label="Referring domains" value={backlinks ? formatCompact(backlinks.referringDomains.length) : "—"} hint="linking sites" />
          <HealthTile href="/competitors" label="Competitors" value={String(competitors.length)} hint="tracked" />
          <HealthTile href="/keywords" label="Keywords" value={formatCompact(dashboard.keywordsTracked)} hint="tracked" />
        </div>
      </section>
    </div>
  );
}
