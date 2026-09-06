import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { listRecentSearches } from "@/lib/research-history";
import { EmptyState } from "@/components/empty-state";
import { ResearchExplorer } from "@/components/research-explorer";

// This page reads the DB (getCurrentProject) via cookies() on every request
// — force-dynamic skips the build-time static-generation pass (which has no
// DB to connect to) rather than swallowing a non-fatal ECONNREFUSED. Purely
// a build-time hint; the route was already `ƒ` Dynamic.
export const dynamic = "force-dynamic";

// Server component (Task 7, extended Task 18): resolves the current project
// directly — no `/api` fetch; the (app) layout validates the session against the users table on every render (middleware only pre-filters for a JWT) — for
// its id + default location/language, which seed every `/api/research` and
// `/api/keywords` call the client `ResearchExplorer` makes. Research itself is
// live-on-demand (a real DataForSEO call per search), but each search IS
// persisted to research history (Task 16); Task 18 reads that history back and
// passes the most-recent DISTINCT seeds in as clickable re-run chips, so a
// seed searched before navigating away isn't lost.
export default async function ResearchPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);

  if (!project) {
    return (
      <EmptyState
        title="Create your first project in Settings"
        description="Add your site's domain in Settings to start researching keyword ideas."
      />
    );
  }

  // History is already newest-first (listRecentSearches orders by createdAt
  // desc), so a Set preserves that order while collapsing repeat seeds; cap the
  // chip row so a busy project doesn't render all 20.
  const recents = await listRecentSearches(db, project.id);
  const recentSeeds = [...new Set(recents.map((r) => r.seed))].slice(0, 8);

  return (
    <ResearchExplorer
      projectId={project.id}
      locationCode={project.defaultLocationCode}
      languageCode={project.defaultLanguageCode}
      recentSeeds={recentSeeds}
    />
  );
}
