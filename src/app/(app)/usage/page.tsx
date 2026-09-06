import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { usageSummary } from "@/lib/usage";
import { EmptyState } from "@/components/empty-state";
import { UsageReport } from "@/components/usage-report";

// This page reads the DB (getCurrentProject/usageSummary) via cookies() on
// every request — force-dynamic skips the build-time static-generation pass
// (which has no DB to connect to) rather than swallowing a non-fatal
// ECONNREFUSED. Purely a build-time hint; the route was already `ƒ` Dynamic.
export const dynamic = "force-dynamic";

// Server component (Task 9, mirrors Tasks 4-8): resolves the current
// project directly — no /api fetch; the (app) layout validates the session against the users table on every render (middleware only pre-filters for a JWT)
// — then reads this project's api_usage aggregate straight from src/lib.
// Pure read/display page: UsageReport is presentational-only, so there is
// no client mutation half to wire up here.
export default async function UsagePage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);

  if (!project) {
    return (
      <EmptyState
        title="Create your first project in Settings"
        description="Add your site's domain in Settings to start tracking usage and cost."
      />
    );
  }

  const summary = await usageSummary(db, project.id);

  return <UsageReport summary={summary} />;
}
