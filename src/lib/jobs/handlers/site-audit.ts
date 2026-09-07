import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runSiteAudit } from "@/lib/audit/run-audit";
import { saveAudit } from "@/lib/audit/store";

// Async site-audit job: crawl the project's domain and store the scored on-page
// report. Free (our own crawler), so cost is 0 — no logApiUsage.
export function siteAuditHandler(opts?: { fetchImpl?: typeof fetch }) {
  return async (ctx: { db: any; projectId?: string; progress?: (message: string) => Promise<void> }) => {
    const { db, projectId, progress } = ctx;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) return { rows: 0, cost: 0 };
    await progress?.(`Crawling ${project.domain}…`);
    const result = await runSiteAudit(project.domain, { fetchImpl: opts?.fetchImpl });
    await progress?.(`Scoring ${result.pagesCrawled} page${result.pagesCrawled === 1 ? "" : "s"}`);
    await saveAudit(db, projectId!, result);
    return { rows: result.pagesCrawled, cost: 0 };
  };
}
