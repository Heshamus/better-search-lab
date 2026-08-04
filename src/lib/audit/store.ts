import { siteAudits } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { AuditIssue, AuditResult } from "@/lib/audit/checks";

export interface AuditRow {
  id: string;
  createdAt: Date;
  score: number;
  pagesCrawled: number;
  issues: AuditIssue[];
}

export async function saveAudit(db: any, projectId: string, result: AuditResult): Promise<void> {
  await db.insert(siteAudits).values({
    projectId,
    score: result.score,
    pagesCrawled: result.pagesCrawled,
    issues: result.issues,
  });
}

/** The most recent audit for a project, or null if none has run yet. */
export async function latestAudit(db: any, projectId: string): Promise<AuditRow | null> {
  const [row] = await db
    .select({
      id: siteAudits.id,
      createdAt: siteAudits.createdAt,
      score: siteAudits.score,
      pagesCrawled: siteAudits.pagesCrawled,
      issues: siteAudits.issues,
    })
    .from(siteAudits)
    .where(eq(siteAudits.projectId, projectId))
    .orderBy(desc(siteAudits.createdAt))
    .limit(1);
  return row ? { ...row, issues: (row.issues ?? []) as AuditIssue[] } : null;
}
