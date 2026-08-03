import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { listTrackedKeywords } from "@/lib/keywords";
import { EmptyState } from "@/components/empty-state";
import { KeywordManager } from "@/components/keyword-manager";

// This page reads the DB (getCurrentProject/listTrackedKeywords) via
// cookies() on every request — force-dynamic skips the build-time
// static-generation pass (which has no DB to connect to) rather than
// swallowing a non-fatal ECONNREFUSED. Purely a build-time hint; the route
// was already `ƒ` Dynamic.
export const dynamic = "force-dynamic";

// Server component (Task 6, mirrors Task 4/5's pages): resolves the current
// project directly — no `/api` fetch, `(app)/*` is already middleware-guarded
// — then reads the tracked keyword set straight from `src/lib`. All
// mutation (Track/Untrack toggle, Add keywords) lives in the client
// `KeywordManager`, which posts to the guarded `/api/keywords*` routes and
// `router.refresh()`s this page afterward.
export default async function KeywordsPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);

  if (!project) {
    return (
      <EmptyState
        title="Create your first project in Settings"
        description="Add your site's domain in Settings to start tracking keywords."
      />
    );
  }

  const keywordRows = await listTrackedKeywords(db, project.id);

  return (
    <KeywordManager
      projectId={project.id}
      keywords={keywordRows}
      defaultLocationCode={project.defaultLocationCode}
      defaultLanguageCode={project.defaultLanguageCode}
    />
  );
}
