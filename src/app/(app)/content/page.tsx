import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { listOpportunities } from "@/lib/opportunities";
import { EmptyState } from "@/components/empty-state";
import type { OpportunityRow } from "@/components/opportunity-card";

// This page reads the DB (getCurrentProject/listOpportunities) via cookies()
// on every request — force-dynamic skips the build-time static-generation
// pass (which has no DB to connect to) rather than swallowing a non-fatal
// ECONNREFUSED. Purely a build-time hint; the route was already `ƒ` Dynamic.
export const dynamic = "force-dynamic";

// Server component (Task 9, mirrors Tasks 4-8): resolves the current
// project directly — no /api fetch, (app)/* is already middleware-guarded.
//
// Deliberately a light Phase-1 stub (brief + plan's Deferred block): full
// content-brief generation is Phase 5, so this page only surfaces this
// week's `gap`-type opportunities (reusing listOpportunities — no new read
// path) as lightweight "content signals" — keywords a competitor ranks for
// that we don't, the closest thing to a content-brief candidate the
// platform can honestly produce today. The banner says so plainly rather
// than implying more than a stub delivers.
export default async function ContentPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);

  if (!project) {
    return (
      <EmptyState
        title="Create your first project in Settings"
        description="Add your site's domain in Settings to start surfacing content signals."
      />
    );
  }

  const opportunityRows = (await listOpportunities(db, project.id)) as OpportunityRow[];
  const gapRows = opportunityRows.filter((row) => row.type === "gap");

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-neutral-700 dark:text-neutral-200">
        Full content briefs arrive in Phase 5. Below are this week&rsquo;s content-gap signals only — keywords a
        competitor ranks for that we don&rsquo;t.
      </section>

      {gapRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          No content-gap signals yet this week.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {gapRows.map((row) => (
            <li
              key={row.id}
              data-testid={`content-signal-${row.id}`}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <p className="font-medium text-neutral-900 dark:text-white">{row.keyword}</p>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{row.why}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
