import { competitorKeywords } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface CompetitorKeywordInput {
  keyword: string;
  rankAbsolute: number | null;
  url: string | null;
  volume: number | null;
  difficulty: number | null;
}
export interface CompetitorKeywordRow extends CompetitorKeywordInput {
  id: string;
}
export interface TopPage {
  url: string;
  keywordCount: number;
  topKeywords: string[];
}

// Task 10 (competitor intel): persistence for what a tracked competitor
// ranks for. Replace-all semantics scoped to (projectId, competitorDomain)
// mirror saveGapRows in src/lib/competitors.ts / saveProfileCandidates in
// src/lib/profile.ts — a competitor's keyword set is always the last save,
// so a re-fetch never leaves stale rows behind alongside fresh ones.
export async function saveCompetitorKeywords(
  db: any,
  projectId: string,
  competitorDomain: string,
  rows: CompetitorKeywordInput[],
): Promise<void> {
  await db.delete(competitorKeywords).where(
    and(eq(competitorKeywords.projectId, projectId), eq(competitorKeywords.competitorDomain, competitorDomain)),
  );
  if (rows.length === 0) return;
  await db.insert(competitorKeywords).values(rows.map((r) => ({
    projectId,
    competitorDomain,
    keyword: r.keyword,
    rankAbsolute: r.rankAbsolute,
    url: r.url,
    volume: r.volume,
    difficulty: r.difficulty,
  })));
}

// NULL ranks sort last (not first) under plain ascending numeric sort, so we
// key them to a value above any real rank instead.
const rankKey = (n: number | null) => (n == null ? Number.MAX_SAFE_INTEGER : n);

export async function listCompetitorKeywords(
  db: any,
  projectId: string,
  competitorDomain: string,
): Promise<CompetitorKeywordRow[]> {
  const rows = await db.select().from(competitorKeywords).where(
    and(eq(competitorKeywords.projectId, projectId), eq(competitorKeywords.competitorDomain, competitorDomain)),
  );
  return rows
    .map((r: any) => ({
      id: r.id,
      keyword: r.keyword,
      rankAbsolute: r.rankAbsolute,
      url: r.url,
      volume: r.volume,
      difficulty: r.difficulty,
    }))
    .sort((a: CompetitorKeywordRow, b: CompetitorKeywordRow) => rankKey(a.rankAbsolute) - rankKey(b.rankAbsolute));
}

// Aggregates a competitor's keyword rows by url — "here's what's working for
// them", page by page. Rows with no url can't anchor a page and are
// excluded rather than fabricating a grouping key for them. topKeywords is
// capped at 5, ranked by volume (nulls treated as 0 so they sort last, never
// fabricated as a real number).
export async function listCompetitorTopPages(
  db: any,
  projectId: string,
  competitorDomain: string,
): Promise<TopPage[]> {
  const rows = await db.select().from(competitorKeywords).where(
    and(eq(competitorKeywords.projectId, projectId), eq(competitorKeywords.competitorDomain, competitorDomain)),
  );
  const byUrl = new Map<string, { url: string; kws: { keyword: string; volume: number | null }[] }>();
  for (const r of rows) {
    if (!r.url) continue;
    let entry = byUrl.get(r.url);
    if (!entry) {
      entry = { url: r.url, kws: [] };
      byUrl.set(r.url, entry);
    }
    entry.kws.push({ keyword: r.keyword, volume: r.volume });
  }
  return [...byUrl.values()]
    .map((entry) => ({
      url: entry.url,
      keywordCount: entry.kws.length,
      topKeywords: entry.kws
        .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
        .slice(0, 5)
        .map((k) => k.keyword),
    }))
    .sort((a, b) => b.keywordCount - a.keywordCount);
}
