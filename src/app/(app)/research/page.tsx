import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { EmptyState } from "@/components/empty-state";
import { ResearchExplorer } from "@/components/research-explorer";

// This page reads the DB (getCurrentProject) via cookies() on every request
// — force-dynamic skips the build-time static-generation pass (which has no
// DB to connect to) rather than swallowing a non-fatal ECONNREFUSED. Purely
// a build-time hint; the route was already `ƒ` Dynamic.
export const dynamic = "force-dynamic";

// Server component (Task 7, mirrors Task 4/5/6's pages): resolves the
// current project directly — no `/api` fetch, `(app)/*` is already
// middleware-guarded — purely for its id + default location/language, which
// seed every `/api/research` and `/api/keywords` call the client
// `ResearchExplorer` makes. Unlike Tasks 4-6 there is no list to read here:
// research is live-on-demand (a real DataForSEO call per search, with no
// persistence), so this page has nothing to fetch besides the project
// itself.
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

  return (
    <ResearchExplorer
      projectId={project.id}
      locationCode={project.defaultLocationCode}
      languageCode={project.defaultLanguageCode}
    />
  );
}
