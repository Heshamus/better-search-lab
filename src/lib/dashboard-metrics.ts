import { rankSnapshots, keywordMetrics } from "@/db/schema";
import { asc, inArray } from "drizzle-orm";
import { listTrackedKeywords } from "@/lib/keywords";
import { usageSummary } from "@/lib/usage";

export interface HealthMetrics {
  visibility: string;
  estTraffic: string;
  avgPosition: string;
  keywordsTracked: string;
  spend: string;
}

/**
 * Rough organic CTR by absolute SERP position (index 1-10; anything past 10
 * falls back to a flat long-tail rate). A widely-cited directional
 * approximation — steep drop-off after the top 3, flattening past position
 * 10 — used ONLY to shape the "Est. traffic" health-strip tile. Never feeds
 * scoreOpportunity or any ranking/detector decision.
 */
const CTR_BY_POSITION: number[] = [0, 0.28, 0.15, 0.11, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03, 0.02];
const LONG_TAIL_CTR = 0.01;

function ctrForPosition(rank: number): number {
  return rank >= 1 && rank <= 10 ? CTR_BY_POSITION[rank] : LONG_TAIL_CTR;
}

// A 0-100 index from our own rank alone (never a third-party visibility
// score): position #1 scores 100, #100 scores 1, anything worse clamps to 0.
function visibilityIndex(rank: number): number {
  return Math.max(0, Math.min(100, 101 - rank));
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * Aggregates the opportunities-landing health strip (spec §8) straight from
 * the project's own rank + usage data — never a fabricated or third-party
 * number. Every field renders as a ready-to-display string.
 *
 * `visibility`/`estTraffic`/`avgPosition` are derived from tracked keywords'
 * chronologically-latest snapshot PER keyword (ascending capturedAt + id
 * tie-break, mirroring listRankings), counting a keyword only when that
 * latest snapshot is `fetch_status: 'ok'` with a real rank — a failed or
 * never-fetched keyword contributes nothing, and when NO tracked keyword has
 * an ok rank yet, all three render "—" (honest "no data", never an
 * average-of-nothing or a fabricated 0).
 *
 * `keywordsTracked` and `spend` are real counts/sums that are legitimately
 * "0"/"$0.00" when empty — that is a KNOWN value (we can see there are zero
 * rows), not an unavailable one, so those two never render "—".
 *
 * `asOf` is the single source of "now": it decides which month "spend this
 * month" sums (via a UTC YYYY-MM prefix match against usageSummary's byDay,
 * consistent with usage.ts's own UTC day-keying) — no reliance on real
 * Date.now() anywhere in this function, so it stays deterministic in tests.
 */
export async function computeHealthMetrics(db: any, projectId: string, asOf: Date): Promise<HealthMetrics> {
  const tracked = await listTrackedKeywords(db, projectId);
  const keywordIds = tracked.map((k: any) => k.id);

  const okRanks: number[] = [];
  let estTrafficRaw = 0;

  if (keywordIds.length) {
    // Ascending capturedAt (+id tie-break) means the last write per keyword
    // below is that keyword's chronologically latest snapshot, regardless
    // of fetch_status — matching listRankings' own semantics.
    const snaps = await db.select().from(rankSnapshots)
      .where(inArray(rankSnapshots.keywordId, keywordIds))
      .orderBy(asc(rankSnapshots.capturedAt), asc(rankSnapshots.id));

    const metricsRows = await db.select().from(keywordMetrics).where(inArray(keywordMetrics.keywordId, keywordIds));
    const volumeByKeyword = new Map<string, number | null>(metricsRows.map((m: any) => [m.keywordId, m.searchVolume]));

    const latestByKeyword = new Map<string, any>();
    for (const s of snaps) latestByKeyword.set(s.keywordId, s);

    for (const [keywordId, snap] of latestByKeyword) {
      if (snap.fetchStatus !== "ok" || snap.rankAbsolute == null) continue;
      const rank = snap.rankAbsolute as number;
      okRanks.push(rank);
      const volume = volumeByKeyword.get(keywordId) ?? 0;
      estTrafficRaw += (volume ?? 0) * ctrForPosition(rank);
    }
  }

  const usage = await usageSummary(db, projectId);
  const monthPrefix = asOf.toISOString().slice(0, 7); // UTC "YYYY-MM"
  const spendThisMonth = usage.byDay
    .filter((row) => row.day.startsWith(monthPrefix))
    .reduce((sum, row) => sum + row.cost, 0);

  return {
    visibility: okRanks.length ? `${Math.round(avg(okRanks.map(visibilityIndex)))}/100` : "—",
    estTraffic: okRanks.length ? `~${Math.round(estTrafficRaw)}/mo` : "—",
    avgPosition: okRanks.length ? avg(okRanks).toFixed(1) : "—",
    keywordsTracked: `${keywordIds.length}`,
    spend: formatUsd(spendThisMonth),
  };
}
