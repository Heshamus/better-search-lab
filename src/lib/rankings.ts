import { rankSnapshots, keywordMetrics } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { listTrackedKeywords } from "@/lib/keywords";
import { deltaForKeyword, type Snap } from "@/lib/core/history";

export interface RankingRow {
  keywordId: string;
  keyword: string;
  rankAbsolute: number | null;
  url: string | null;
  serpFeatures: string[];
  ownedFeatures: string[];
  fetchStatus: string;
  volume: number | null;
  difficulty: number | null;
  delta7: number | null;
  delta30: number | null;
}

/**
 * One row per TRACKED keyword in the project: the chronologically latest
 * snapshot's fetchStatus (reported regardless of ok/failed, for honesty),
 * the rank/url/serpFeatures ONLY when that latest snapshot is ok (null/[]
 * on failed — a failed fetch means today's true position is unknown, so no
 * stale rank is shown as current even if an older ok snapshot exists), plus
 * metrics and 7d/30d deltas from the keyword's own ok history (via
 * deltaForKeyword, which is blind to a failed "latest" row by design — it
 * reasons only over ok data points).
 *
 * A tracked keyword with zero snapshots ever (never fetched) reports
 * fetchStatus "unknown" — distinct from both "ok" and "failed", since no
 * fetch was ever attempted for it.
 */
export async function listRankings(db: any, projectId: string, asOf: Date): Promise<RankingRow[]> {
  const tracked = await listTrackedKeywords(db, projectId);
  if (!tracked.length) return [];

  const keywordIds = tracked.map((k: any) => k.id);

  // Secondary sort on `id` makes ties on capturedAt (simultaneous captures)
  // deterministic, matching deltaForKeyword/latestAtOrBefore's own id
  // tie-break — otherwise "the last element = latest" below would silently
  // depend on whatever order the DB happens to return tied rows in.
  const snaps = await db.select().from(rankSnapshots)
    .where(inArray(rankSnapshots.keywordId, keywordIds))
    .orderBy(asc(rankSnapshots.capturedAt), asc(rankSnapshots.id));

  const metricsRows = await db.select().from(keywordMetrics)
    .where(inArray(keywordMetrics.keywordId, keywordIds));
  const metricsByKeyword = new Map<string, any>(metricsRows.map((m: any) => [m.keywordId, m]));

  // Group snapshots per keyword, preserving the ascending capturedAt order
  // from the query above — so the last entry per group is that keyword's
  // chronologically latest snapshot, regardless of fetch_status.
  const snapsByKeyword = new Map<string, any[]>();
  for (const s of snaps) {
    const arr = snapsByKeyword.get(s.keywordId) ?? [];
    arr.push(s);
    snapsByKeyword.set(s.keywordId, arr);
  }

  return tracked.map((kw: any): RankingRow => {
    const kwSnaps = snapsByKeyword.get(kw.id) ?? [];
    const metrics = metricsByKeyword.get(kw.id);
    const latest = kwSnaps.length ? kwSnaps[kwSnaps.length - 1] : null;
    const fetchStatus: string = latest?.fetchStatus ?? "unknown";
    const isOk = fetchStatus === "ok";

    return {
      keywordId: kw.id,
      keyword: kw.keyword,
      rankAbsolute: isOk ? latest.rankAbsolute ?? null : null,
      url: isOk ? latest.url ?? null : null,
      serpFeatures: isOk ? latest.serpFeatures ?? [] : [],
      ownedFeatures: isOk ? latest.ownedFeatures ?? [] : [],
      fetchStatus,
      volume: metrics?.searchVolume ?? null,
      difficulty: metrics?.difficulty ?? null,
      delta7: deltaForKeyword(kwSnaps as Snap[], asOf, 7),
      delta30: deltaForKeyword(kwSnaps as Snap[], asOf, 30),
    };
  });
}

/**
 * Chronological snapshots for one keyword's drill-in sparkline. Includes
 * failed rows (rankAbsolute null) so the UI can show gaps honestly instead
 * of silently skipping bad fetches.
 */
export async function rankHistory(
  db: any,
  keywordId: string,
): Promise<{ capturedAt: Date; rankAbsolute: number | null; fetchStatus: string }[]> {
  return db.select({
    capturedAt: rankSnapshots.capturedAt,
    rankAbsolute: rankSnapshots.rankAbsolute,
    fetchStatus: rankSnapshots.fetchStatus,
  }).from(rankSnapshots)
    .where(eq(rankSnapshots.keywordId, keywordId))
    .orderBy(asc(rankSnapshots.capturedAt), asc(rankSnapshots.id));
}
