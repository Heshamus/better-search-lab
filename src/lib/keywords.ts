import { keywords } from "@/db/schema";
import { and, eq } from "drizzle-orm";
export async function addKeywords(db: any, projectId: string, rows: { keyword: string; locationCode: number; languageCode: string; device?: string; tags?: string[] }[]) {
  const created: any[] = [];
  for (const r of rows) {
    const device = r.device ?? "desktop";
    const existing = await db.select().from(keywords).where(and(
      eq(keywords.projectId, projectId), eq(keywords.keyword, r.keyword),
      eq(keywords.locationCode, r.locationCode), eq(keywords.languageCode, r.languageCode), eq(keywords.device, device),
    )).limit(1);
    if (existing.length) {
      // A matching row exists. If it was untracked, re-track it (so add→untrack→re-add
      // brings the keyword back) rather than silently no-oping. Never insert a duplicate.
      if (existing[0].isTracked === false) {
        await db.update(keywords).set({ isTracked: true }).where(eq(keywords.id, existing[0].id));
      }
      continue;
    }
    const [row] = await db.insert(keywords).values({
      projectId, keyword: r.keyword, locationCode: r.locationCode, languageCode: r.languageCode, device, tags: r.tags ?? [],
    }).returning();
    created.push(row);
  }
  return created;
}
export async function listTrackedKeywords(db: any, projectId: string) {
  return db.select().from(keywords).where(and(eq(keywords.projectId, projectId), eq(keywords.isTracked, true)));
}
export async function setKeywordTracked(db: any, keywordId: string, tracked: boolean) {
  await db.update(keywords).set({ isTracked: tracked }).where(eq(keywords.id, keywordId));
}
