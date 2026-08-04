import { keywords, rankSnapshots, keywordMetrics, opportunities } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { listGapSignals } from "@/lib/competitors";
import type { DetectorInput, DetectorSnap, KeywordSignal } from "@/lib/core/detectors/types";
import type { EngineResult } from "@/lib/core/opportunity-engine";

/**
 * The ISO date (`YYYY-MM-DD`) of the Monday of the UTC week containing
 * `isoDate`. This is the `week_of` key opportunities are grouped/upserted by.
 */
export function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // days to walk back (or forward) to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Assembles a project's `DetectorInput` from already-collected signals: the
 * project's tracked keywords, each one's `rank_snapshots` history (mapped to
 * `DetectorSnap`, chronological), `keyword_metrics`, and competitor gap rows.
 *
 * Snapshots are loaded as-is (both `ok` and `failed` rows, preserving
 * `fetchStatus`) — detectors/history helpers are the ones that filter to
 * `fetch_status='ok'` and skip nulls (degraded-run honesty lives there, not
 * here). Each snapshot's `keywordId` comes from its own DB row (selected by
 * `keyword_id = kw.id`), so it naturally matches the owning signal's
 * `keywordId` — required for detectors' `latestByKeyword(...).get(keywordId)`
 * lookups to resolve.
 */
export async function loadDetectorInput(db: any, projectId: string, asOf: Date): Promise<DetectorInput> {
  const tracked = await db.select().from(keywords).where(and(eq(keywords.projectId, projectId), eq(keywords.isTracked, true)));

  const keywordSignals: KeywordSignal[] = [];
  for (const kw of tracked) {
    const snaps = await db.select().from(rankSnapshots)
      .where(eq(rankSnapshots.keywordId, kw.id))
      .orderBy(asc(rankSnapshots.capturedAt));

    const snapshots: DetectorSnap[] = snaps.map((s: any) => ({
      keywordId: s.keywordId,
      capturedAt: s.capturedAt,
      rankAbsolute: s.rankAbsolute,
      fetchStatus: s.fetchStatus,
      serpFeatures: s.serpFeatures,
      ownUrls: s.ownUrls,
    }));

    const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;

    const [metrics] = await db.select().from(keywordMetrics).where(eq(keywordMetrics.keywordId, kw.id));

    keywordSignals.push({
      keywordId: kw.id,
      keyword: kw.keyword,
      tags: kw.tags ?? [],
      snapshots,
      ownUrls: latest?.ownUrls ?? [],
      volume: metrics?.searchVolume ?? null,
      difficulty: metrics?.difficulty ?? null,
    });
  }

  const gapSignals = await listGapSignals(db, projectId);

  return { keywordSignals, gapSignals, asOf };
}

/**
 * Upserts this week's opportunity shortlist: deletes this `(projectId,
 * weekOf)`'s prior `status='new'` rows, then inserts `results`. User-actioned
 * rows (`tracked`/`dismissed`/`done`) are left untouched, so re-running the
 * job only refreshes the un-actioned shortlist — idempotent per week.
 *
 * A same-week re-run must not resurrect a user-actioned `(keyword, type)` as
 * a fresh `new` row (e.g. a dismissed opportunity coming back). After the
 * `status='new'` delete, whatever remains for this `(projectId, weekOf)` is,
 * by construction, already actioned (tracked/dismissed/done) — so `results`
 * are filtered to skip any `(keyword, type)` already present among those
 * survivors. Genuinely-new candidates still insert; a re-run with no status
 * changes nets the same rows either way (nothing survives to filter against).
 *
 * The whole delete -> select -> insert sequence runs in one transaction so a
 * crash between the delete and the insert can't leave the week's shortlist
 * wiped — either the refreshed shortlist lands whole or the prior `new` rows
 * survive. The survivor select MUST be inside the tx so it reads-your-writes
 * (sees the post-delete state); an early return still commits the delete,
 * matching the original "empty shortlist this week" outcome.
 */
export async function upsertOpportunities(db: any, projectId: string, weekOf: string, results: EngineResult[]): Promise<void> {
  await db.transaction(async (tx: any) => {
    await tx.delete(opportunities).where(and(
      eq(opportunities.projectId, projectId),
      eq(opportunities.weekOf, weekOf),
      eq(opportunities.status, "new"),
    ));

    if (!results.length) return;

    const surviving = await tx.select({ keyword: opportunities.keyword, type: opportunities.type }).from(opportunities)
      .where(and(eq(opportunities.projectId, projectId), eq(opportunities.weekOf, weekOf)));
    const actioned = new Set(surviving.map((s: any) => `${s.keyword}|${s.type}`));
    const toInsert = results.filter((r) => !actioned.has(`${r.keyword}|${r.type}`));

    if (!toInsert.length) return;

    await tx.insert(opportunities).values(toInsert.map((r) => ({
      projectId,
      keywordId: r.keywordId,
      keyword: r.keyword,
      volume: r.volume,
      difficulty: r.difficulty,
      currentPosition: r.currentPosition,
      trend: r.trend,
      type: r.type,
      score: r.score,
      scoreBreakdown: r.scoreBreakdown,
      why: r.why,
      upsideEstimate: r.upsideEstimate,
      weekOf,
    })));
  });
}

/** Rows for the project, filtered to `weekOf` when given, else the latest week — highest score first. */
export async function listOpportunities(db: any, projectId: string, weekOf?: string) {
  let targetWeek: string | undefined = weekOf;
  if (!targetWeek) {
    const [latest] = await db.select({ weekOf: opportunities.weekOf }).from(opportunities)
      .where(eq(opportunities.projectId, projectId))
      .orderBy(desc(opportunities.weekOf))
      .limit(1);
    targetWeek = latest?.weekOf;
  }
  if (!targetWeek) return [];
  return db.select().from(opportunities)
    .where(and(eq(opportunities.projectId, projectId), eq(opportunities.weekOf, targetWeek)))
    .orderBy(desc(opportunities.score));
}

export async function setOpportunityStatus(db: any, id: string, status: string): Promise<void> {
  await db.update(opportunities).set({ status }).where(eq(opportunities.id, id));
}
