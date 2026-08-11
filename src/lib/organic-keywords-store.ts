import { organicKeywords } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export interface OrganicKeywordRow {
  keyword: string;
  position: number | null;
  searchVolume: number | null;
  difficulty: number | null;
  url: string | null;
  estTraffic: number | null;
}

/** Replace-all: the latest refresh is the only snapshot we keep (no history in v1). */
export async function replaceOrganicKeywords(db: any, projectId: string, rows: OrganicKeywordRow[]): Promise<void> {
  await db.delete(organicKeywords).where(eq(organicKeywords.projectId, projectId));
  if (rows.length) {
    await db.insert(organicKeywords).values(rows.map((r) => ({ projectId, ...r })));
  }
}

/** The project's current organic-keyword snapshot (position ascending) + when it was captured. */
export async function getOrganicKeywords(db: any, projectId: string): Promise<{ rows: OrganicKeywordRow[]; capturedAt: Date | null }> {
  const found = await db
    .select({
      keyword: organicKeywords.keyword,
      position: organicKeywords.position,
      searchVolume: organicKeywords.searchVolume,
      difficulty: organicKeywords.difficulty,
      url: organicKeywords.url,
      estTraffic: organicKeywords.estTraffic,
      capturedAt: organicKeywords.capturedAt,
    })
    .from(organicKeywords)
    .where(eq(organicKeywords.projectId, projectId))
    .orderBy(asc(organicKeywords.position));
  const rows: OrganicKeywordRow[] = found.map((r: any) => ({
    keyword: r.keyword, position: r.position, searchVolume: r.searchVolume,
    difficulty: r.difficulty, url: r.url, estTraffic: r.estTraffic,
  }));
  return { rows, capturedAt: found.length ? (found[0].capturedAt as Date) : null };
}
