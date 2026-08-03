import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { listRankings } from "@/lib/rankings";
import { EmptyState } from "@/components/empty-state";
import { RankingsTable } from "@/components/rankings-table";

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

  return <RankingsTable rows={rows} />;
}
