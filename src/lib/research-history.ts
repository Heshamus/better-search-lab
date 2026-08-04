import { researchSearches } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";

const KEEP = 20;

/**
 * Records one Research-tab search (Task 16) and prunes the project's history
 * back down to the most recent KEEP rows. Insert-then-prune (rather than a
 * single windowed delete) keeps the logic readable: select every row's id
 * for this project newest-first, drop everything past the KEEP-th, delete
 * by id. Only ever called from the `/api/research` success path — a failed
 * DataForSEO fetch never reaches this function, so nothing is persisted for
 * it.
 */
export async function saveResearchSearch(
  db: any,
  projectId: string,
  seed: string,
  results: unknown,
): Promise<void> {
  await db.insert(researchSearches).values({ projectId, seed, results });
  const rows = await db
    .select({ id: researchSearches.id })
    .from(researchSearches)
    .where(eq(researchSearches.projectId, projectId))
    // id (a random UUID — NOT chronological) is only a STABLE tiebreaker: it
    // pins same-tick rows (identical createdAt) into one fixed order that
    // listRecentSearches shares, so the prune-select here and the read there
    // AGREE on which rows fall past the KEEP cut. Without it a tie's order is
    // undefined and the two queries could disagree about which row to drop.
    .orderBy(desc(researchSearches.createdAt), desc(researchSearches.id));
  const stale = rows.slice(KEEP).map((r: { id: string }) => r.id);
  if (stale.length) await db.delete(researchSearches).where(inArray(researchSearches.id, stale));
}

/**
 * Newest-first recent searches for a project, capped at `limit` (default
 * KEEP, matching the prune threshold in saveResearchSearch). Read-only;
 * surfacing this on the Research page is Task 18, not this task.
 */
export async function listRecentSearches(
  db: any,
  projectId: string,
  limit = KEEP,
): Promise<{ id: string; seed: string; results: unknown; createdAt: Date }[]> {
  return db
    .select()
    .from(researchSearches)
    .where(eq(researchSearches.projectId, projectId))
    // id (a random UUID, not chronological) tiebreaks same-tick rows into one
    // fixed order that MATCHES saveResearchSearch's prune ordering, so the
    // `limit` cut here and the prune there agree at a same-timestamp tie.
    .orderBy(desc(researchSearches.createdAt), desc(researchSearches.id))
    .limit(limit);
}
