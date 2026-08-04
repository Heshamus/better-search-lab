import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runSiteAudit } from "@/lib/audit/run-audit";
import { saveAudit } from "@/lib/audit/store";

// Async site-audit job: crawl the project's domain and store the scored on-page
// report. Free (our own crawler), so cost is 0 — no logApiUsage.
export function siteAuditHandler(opts?: { fetchImpl?: typeof fetch }) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) return { rows: 0, cost: 0 };
    const result = await runSiteAudit(project.domain, { fetchImpl: opts?.fetchImpl });
    await saveAudit(db, projectId!, result);
    return { rows: result.pagesCrawled, cost: 0 };
  };
}
