import { competitors, competitorGaps } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import type { IntersectionRow } from "@/lib/dataforseo/labs";
import type { GapSignal } from "@/lib/core/detectors/types";

// Task 8 (Competitors view): the roster of tracked competitor domains for a
// project, used to render the chip row above the gap table. Deliberately
// projected to just {id, domain} — the gap table itself joins on keyword via
// listGapSignals below, never on this row's id.
export async function listCompetitors(db: any, projectId: string): Promise<{ id: string; domain: string }[]> {
  return db
    .select({ id: competitors.id, domain: competitors.domain })
    .from(competitors)
    .where(eq(competitors.projectId, projectId));
}

export async function saveGapRows(db: any, projectId: string, competitorDomain: string, rows: IntersectionRow[]) {
  await db.delete(competitorGaps).where(
    and(eq(competitorGaps.projectId, projectId), eq(competitorGaps.competitorDomain, competitorDomain)),
  );
  if (rows.length === 0) return;
  await db.insert(competitorGaps).values(rows.map((r) => ({
    projectId, competitorDomain, keyword: r.keyword,
    competitorRank: r.competitorRank, ourRank: r.ourRank, volume: r.searchVolume, difficulty: r.difficulty,
  })));
}

export async function listGapSignals(db: any, projectId: string): Promise<GapSignal[]> {
  const rows = await db.select().from(competitorGaps)
    .where(and(eq(competitorGaps.projectId, projectId), isNull(competitorGaps.ourRank)));
  const byKeyword = new Map<string, GapSignal & { _competitors: Set<string> }>();
  for (const r of rows) {
    let g = byKeyword.get(r.keyword);
    if (!g) { g = { keyword: r.keyword, volume: r.volume, difficulty: r.difficulty, competitorCount: 0, _competitors: new Set() }; byKeyword.set(r.keyword, g); }
    g._competitors.add(r.competitorDomain);
    g.competitorCount = g._competitors.size;
    if ((r.volume ?? 0) > (g.volume ?? 0)) g.volume = r.volume;
    if (r.difficulty != null && (g.difficulty == null || r.difficulty < g.difficulty)) g.difficulty = r.difficulty;
  }
  return [...byKeyword.values()].map(({ _competitors, ...g }) => g);
}
