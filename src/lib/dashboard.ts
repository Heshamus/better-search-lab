import { keywords, rankSnapshots, opportunities, competitorKeywords } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

// Aggregates for the project dashboard's charts. Everything here is derived from
// data the tool already has (tracked keywords, their latest rank snapshot, the
// scored opportunities, and per-competitor ranked keywords) so the dashboard is
// populated the moment a project has been profiled + refreshed — no new fetches.

export interface Segment {
  label: string;
  value: number;
  color: string;
}

export interface DashboardData {
  keywordsTracked: number;
  opportunityCount: number;
  addressableVolume: number; // total monthly search volume across scored opportunities
  avgDifficulty: number | null;
  positionDist: Segment[];
  difficultyDist: Segment[];
  topOpportunities: { label: string; value: number }[];
  competitorSov: { label: string; value: number }[];
}

const POS_COLORS = {
  top3: "var(--color-up)",
  page1: "var(--color-accent)",
  page2: "var(--color-at-risk)",
  deep: "var(--color-series-3)",
  unranked: "var(--color-neutral-700)",
};

const KD_BUCKET_COLORS = ["#57d9a3", "#8fd06a", "#f5c451", "#f2954e", "#f2724e"];

export async function computeDashboard(db: any, projectId: string): Promise<DashboardData> {
  // Tracked keywords + every rank snapshot for them (small — grouped to latest in JS).
  const tracked = await db
    .select({ id: keywords.id })
    .from(keywords)
    .where(and(eq(keywords.projectId, projectId), eq(keywords.isTracked, true)));
  const trackedIds = new Set<string>(tracked.map((k: { id: string }) => k.id));

  const snaps = await db
    .select({
      keywordId: rankSnapshots.keywordId,
      rankAbsolute: rankSnapshots.rankAbsolute,
      fetchStatus: rankSnapshots.fetchStatus,
      capturedAt: rankSnapshots.capturedAt,
    })
    .from(rankSnapshots)
    .innerJoin(keywords, eq(keywords.id, rankSnapshots.keywordId))
    .where(eq(keywords.projectId, projectId));

  // Latest snapshot per keyword (a "failed" fetch counts as unranked, not stale).
  const latest = new Map<string, { rank: number | null; ts: Date }>();
  for (const s of snaps as { keywordId: string; rankAbsolute: number | null; fetchStatus: string; capturedAt: Date }[]) {
    const prev = latest.get(s.keywordId);
    if (!prev || s.capturedAt > prev.ts) {
      latest.set(s.keywordId, { rank: s.fetchStatus === "ok" ? s.rankAbsolute : null, ts: s.capturedAt });
    }
  }

  let top3 = 0, page1 = 0, page2 = 0, deep = 0, unranked = 0;
  for (const id of trackedIds) {
    const r = latest.get(id)?.rank ?? null;
    if (r == null) unranked++;
    else if (r <= 3) top3++;
    else if (r <= 10) page1++;
    else if (r <= 20) page2++;
    else if (r <= 100) deep++;
    else unranked++;
  }
  const positionDist: Segment[] = [
    { label: "Top 3", value: top3, color: POS_COLORS.top3 },
    { label: "Page 1 (4–10)", value: page1, color: POS_COLORS.page1 },
    { label: "Page 2 (11–20)", value: page2, color: POS_COLORS.page2 },
    { label: "21–100", value: deep, color: POS_COLORS.deep },
    { label: "Unranked", value: unranked, color: POS_COLORS.unranked },
  ];

  // Opportunities: count, addressable volume, avg difficulty, KD buckets, top by volume.
  const opps = await db
    .select({ keyword: opportunities.keyword, volume: opportunities.volume, difficulty: opportunities.difficulty })
    .from(opportunities)
    .where(eq(opportunities.projectId, projectId));

  const oppRows = opps as { keyword: string; volume: number | null; difficulty: number | null }[];
  const addressableVolume = oppRows.reduce((s, o) => s + (o.volume ?? 0), 0);
  const kds = oppRows.map((o) => o.difficulty).filter((d): d is number => d != null);
  const avgDifficulty = kds.length ? Math.round(kds.reduce((s, d) => s + d, 0) / kds.length) : null;

  const buckets = [0, 0, 0, 0, 0]; // 0–20, 21–40, 41–60, 61–80, 81–100
  for (const d of kds) buckets[Math.min(4, Math.floor(d / 20))]++;
  const difficultyDist: Segment[] = buckets.map((value, i) => ({
    label: ["0–20", "21–40", "41–60", "61–80", "81+"][i],
    value,
    color: KD_BUCKET_COLORS[i],
  }));

  const topOpportunities = [...oppRows]
    .filter((o) => (o.volume ?? 0) > 0)
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, 6)
    .map((o) => ({ label: o.keyword, value: o.volume ?? 0 }));

  // Competitor share-of-voice: how many ranked keywords we've collected per rival.
  const sov = await db
    .select({ domain: competitorKeywords.competitorDomain, n: sql<number>`count(*)::int` })
    .from(competitorKeywords)
    .where(eq(competitorKeywords.projectId, projectId))
    .groupBy(competitorKeywords.competitorDomain);
  const competitorSov = (sov as { domain: string; n: number }[])
    .map((r) => ({ label: r.domain, value: Number(r.n) }))
    .sort((a, b) => b.value - a.value);

  return {
    keywordsTracked: trackedIds.size,
    opportunityCount: oppRows.length,
    addressableVolume,
    avgDifficulty,
    positionDist,
    difficultyDist,
    topOpportunities,
    competitorSov,
  };
}
