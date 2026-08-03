import { competitors, competitorGaps } from "@/db/schema";
import { eq, and, isNull, asc } from "drizzle-orm";
import type { IntersectionRow } from "@/lib/dataforseo/labs";
import type { GapSignal } from "@/lib/core/detectors/types";

// Task 7 (Competitor CRUD): hard cap enforced server-side by addCompetitor.
export const MAX_COMPETITORS = 5;

export class CompetitorCapError extends Error {
  constructor() {
    super(`competitor limit reached (max ${MAX_COMPETITORS})`);
    this.name = "CompetitorCapError";
  }
}

// Normalizes a user-entered competitor domain/URL to a bare host for
// dedupe/storage: lowercase, strip scheme, strip leading "www.", strip any
// path/query/hash, strip a trailing dot.
export function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  return s.replace(/\.$/, "");
}

// Task 8 (Competitors view): the roster of tracked competitor domains for a
// project, used to render the chip row above the gap table. Deliberately
// projected to just {id, domain} — the gap table itself joins on keyword via
// listGapSignals below, never on this row's id. Ordered by createdAt so the
// chip row is stable (insertion order) rather than DB-default row order.
export async function listCompetitors(db: any, projectId: string): Promise<{ id: string; domain: string }[]> {
  return db
    .select({ id: competitors.id, domain: competitors.domain })
    .from(competitors)
    .where(eq(competitors.projectId, projectId))
    .orderBy(asc(competitors.createdAt));
}

// Adds a competitor domain to a project, normalizing first. If the
// normalized domain already exists for this project, returns the existing
// row instead of inserting a duplicate (no-throw dedupe) — checked BEFORE
// the cap so re-adding an already-tracked domain at 5/5 succeeds instead of
// throwing. Only a genuinely new domain at the cap throws CompetitorCapError.
export async function addCompetitor(db: any, projectId: string, domain: string): Promise<{ id: string; domain: string }> {
  const norm = normalizeDomain(domain);
  const existing = await db
    .select()
    .from(competitors)
    .where(and(eq(competitors.projectId, projectId), eq(competitors.domain, norm)))
    .limit(1);
  if (existing.length) return { id: existing[0].id, domain: existing[0].domain };

  const current = await db.select().from(competitors).where(eq(competitors.projectId, projectId));
  if (current.length >= MAX_COMPETITORS) throw new CompetitorCapError();

  const [row] = await db.insert(competitors).values({ projectId, domain: norm }).returning();
  return { id: row.id, domain: row.domain };
}

// Removes a competitor, scoped to its project so one project can't delete
// another's row by guessing a competitorId.
export async function removeCompetitor(db: any, projectId: string, competitorId: string): Promise<void> {
  await db.delete(competitors).where(and(eq(competitors.projectId, projectId), eq(competitors.id, competitorId)));
}

// Edits a competitor's domain in place (normalized) rather than
// remove+re-add, so its createdAt/position in listCompetitors is preserved.
export async function updateCompetitorDomain(db: any, competitorId: string, domain: string): Promise<void> {
  await db.update(competitors).set({ domain: normalizeDomain(domain) }).where(eq(competitors.id, competitorId));
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
