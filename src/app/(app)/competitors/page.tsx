import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { listCompetitors, listGapSignals } from "@/lib/competitors";
import { listCompetitorKeywords, listCompetitorTopPages } from "@/lib/competitor-intel";
import { EmptyState } from "@/components/empty-state";
import { GapTable } from "@/components/gap-table";
import { RefreshGapsButton } from "@/components/refresh-gaps-button";
import { CompetitorManager } from "@/components/competitor-manager";
import { CompetitorIntelPanel } from "@/components/competitor-intel-panel";
import { CompetitorDashboard } from "@/components/competitor-dashboard";

// This page reads the DB (getCurrentProject/listCompetitors/listGapSignals/
// listCompetitorKeywords/listCompetitorTopPages) via cookies() on every
// request — force-dynamic skips the build-time static-generation pass (which
// has no DB to connect to) rather than swallowing a non-fatal ECONNREFUSED.
// Purely a build-time hint; the route was already `ƒ` Dynamic.
export const dynamic = "force-dynamic";

const sectionHeadingClass = "text-sm font-semibold uppercase tracking-wide text-neutral-500";

// Server component (Task 18, mirrors Tasks 8/12/14): resolves the current
// project directly — no /api fetch; the (app) layout validates the session against the users table on every render (middleware only pre-filters for a JWT) —
// then reads the competitor roster, per-competitor intel, and this project's
// keyword-gap rows straight from src/lib. All mutation (add/delete competitor,
// Refresh intel, Find keyword gaps, per-row Add to tracking) lives in the
// nested client components, which fetch a guarded /api/* route and then
// router.refresh() this page.
//
// Task 18 fix: competitors are now managed inline here via <CompetitorManager>
// (the old "add one in Settings" copy pointed at a surface that only Task 18
// actually built) and each tracked competitor gets its own intel panel. The
// gaps action (Task 14) still needs at least one competitor to diff against,
// so RefreshGapsButton stays gated on `competitorRows.length >= 1` — with zero
// competitors the honest prompt points at the add form right above it, not
// elsewhere.
//
// Share-of-voice is DEFERRED (competitor-rank-per-tracked-keyword is not
// captured — rank_snapshots stores only OUR rank, so there is no honest SoV
// data source yet) — this page renders a muted, non-interactive "coming soon"
// note instead of computing or faking a number/chart.
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

  const intel = await Promise.all(
    competitorRows.map(async (c) => ({
      competitor: c,
      keywords: await listCompetitorKeywords(db, project.id, c.domain),
      topPages: await listCompetitorTopPages(db, project.id, c.domain),
    })),
  );

  // Per-competitor reach, derived from the collected ranked keywords.
  const compStats = intel.map(({ competitor, keywords }) => {
    const ranks = keywords.map((k) => k.rankAbsolute).filter((r): r is number => r != null);
    return {
      domain: competitor.domain,
      keywords: keywords.length,
      avgPosition: ranks.length ? Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length) : null,
      volume: keywords.reduce((a, k) => a + (k.volume ?? 0), 0),
    };
  });

  return (
    <div className="flex flex-col gap-8">
      {competitorRows.length > 0 ? <CompetitorDashboard stats={compStats} gapCount={gapRows.length} /> : null}

      <section className="flex flex-col gap-2">
        <h2 className={sectionHeadingClass}>Competitors</h2>
        <CompetitorManager projectId={project.id} competitors={competitorRows} />
      </section>

      {intel.length > 0 ? (
        <section className="flex flex-col gap-6">
          <h2 className={sectionHeadingClass}>What they rank for</h2>
          {intel.map(({ competitor, keywords, topPages }) => (
            <CompetitorIntelPanel
              key={competitor.id}
              projectId={project.id}
              competitorDomain={competitor.domain}
              keywords={keywords}
              topPages={topPages}
            />
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className={sectionHeadingClass}>Keyword gaps</h2>
            <p className="text-sm text-neutral-500">
              Keywords your competitors rank for and you don&rsquo;t.
            </p>
          </div>
          {competitorRows.length >= 1 ? (
            <RefreshGapsButton projectId={project.id} />
          ) : (
            <p className="text-sm text-neutral-500">
              Add a competitor above to find keyword gaps.
            </p>
          )}
        </div>

        <GapTable
          rows={gapRows}
          projectId={project.id}
          defaultLocationCode={project.defaultLocationCode}
          defaultLanguageCode={project.defaultLanguageCode}
        />
      </section>
    </div>
  );
}
