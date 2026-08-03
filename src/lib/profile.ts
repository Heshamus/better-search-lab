import { profileCandidates } from "@/db/schema";
import { eq } from "drizzle-orm";

export type CandidateSource = "crawl" | "ranking" | "expansion";
export interface ProfileCandidateInput { keyword: string; source: CandidateSource; volume: number | null; difficulty: number | null; }
export interface ProfileCandidateRow extends ProfileCandidateInput { id: string; selected: boolean; }

// Task 3 (profile_candidates): persistence for an auto-profile run's suggested
// keywords, held until the user confirms them (T4 profiling job writes here,
// T6 review UI reads/confirms). Replace-all semantics mirror saveGapRows in
// src/lib/competitors.ts — a project's candidate set is always the last save.
export async function saveProfileCandidates(db: any, projectId: string, rows: ProfileCandidateInput[]): Promise<void> {
  await db.delete(profileCandidates).where(eq(profileCandidates.projectId, projectId));
  if (rows.length === 0) return;
  await db.insert(profileCandidates).values(rows.map((r) => ({
    projectId, keyword: r.keyword, source: r.source, volume: r.volume, difficulty: r.difficulty,
  })));
}

export async function listProfileCandidates(db: any, projectId: string): Promise<ProfileCandidateRow[]> {
  const rows = await db.select().from(profileCandidates).where(eq(profileCandidates.projectId, projectId));
  return rows.map((r: any) => ({
    id: r.id, keyword: r.keyword, source: r.source as CandidateSource,
    volume: r.volume, difficulty: r.difficulty, selected: r.selected,
  }));
}

export async function clearProfileCandidates(db: any, projectId: string): Promise<void> {
  await db.delete(profileCandidates).where(eq(profileCandidates.projectId, projectId));
}
