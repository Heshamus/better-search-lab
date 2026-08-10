import { loadEnv } from "@/config/env";
import { getConnection, replaceGscDaily, saveGscSnapshot } from "@/lib/google/store";
import { getGoogleAccessToken, isGoogleConfigured } from "@/lib/google/access-token";
import { searchAnalytics, computeRisingQueries, buildQueryPageMap, type GscRow, type GscTopRow } from "@/lib/google/gsc";

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const toTop = (rows: GscRow[]): GscTopRow[] =>
  rows.map((r) => ({ key: r.keys[0] ?? "", clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));

// Async GSC sync: refresh the access token, pull the last 90 days of Search
// Analytics (daily series + top queries + top pages), and snapshot them. Free.
export function gscSyncHandler(opts?: { fetchImpl?: typeof fetch }) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const env = loadEnv();
    if (!isGoogleConfigured(env)) throw new Error("Google is not configured on this instance");
    const conn = await getConnection(db, projectId!);
    // With a service account, auth no longer needs a per-user refresh token — we
    // only need to know WHICH property to pull. So require the property, not the token.
    if (!conn?.propertyUrl) throw new Error("Search Console is not connected for this project");

    const accessToken = await getGoogleAccessToken(env, conn.refreshToken, opts?.fetchImpl);

    const end = new Date();
    const start = new Date(end.getTime() - 90 * 86_400_000);
    const window = { startDate: dateStr(start), endDate: dateStr(end) };
    // Rising queries: recent 28 days vs the prior 28, per query — the earliest,
    // first-party trend signal (your own demand moving before you even rank).
    const recentWin = { startDate: dateStr(new Date(end.getTime() - 28 * 86_400_000)), endDate: dateStr(end) };
    const priorWin = { startDate: dateStr(new Date(end.getTime() - 56 * 86_400_000)), endDate: dateStr(new Date(end.getTime() - 28 * 86_400_000)) };
    const [daily, queries, pages, recentQ, priorQ, queryPage] = await Promise.all([
      searchAnalytics(accessToken, conn.propertyUrl, { ...window, dimensions: ["date"] }, opts?.fetchImpl),
      searchAnalytics(accessToken, conn.propertyUrl, { ...window, dimensions: ["query"], rowLimit: 25 }, opts?.fetchImpl),
      searchAnalytics(accessToken, conn.propertyUrl, { ...window, dimensions: ["page"], rowLimit: 25 }, opts?.fetchImpl),
      searchAnalytics(accessToken, conn.propertyUrl, { ...recentWin, dimensions: ["query"], rowLimit: 500 }, opts?.fetchImpl),
      searchAnalytics(accessToken, conn.propertyUrl, { ...priorWin, dimensions: ["query"], rowLimit: 500 }, opts?.fetchImpl),
      // Google's own query→page mapping: which of OUR pages ranks for each query.
      searchAnalytics(accessToken, conn.propertyUrl, { ...window, dimensions: ["query", "page"], rowLimit: 1000 }, opts?.fetchImpl),
    ]);
    const queryPageMap = buildQueryPageMap(queryPage);
    const risingQueries = computeRisingQueries(recentQ, priorQ).map((r) => ({ ...r, page: queryPageMap.get(r.query) ?? null }));

    await replaceGscDaily(
      db,
      projectId!,
      daily.map((r) => ({ date: r.keys[0] ?? "", clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
    );

    const clicks = daily.reduce((s, r) => s + r.clicks, 0);
    const impressions = daily.reduce((s, r) => s + r.impressions, 0);
    const ctr = impressions > 0 ? clicks / impressions : 0;
    // Impression-weighted average position across the window.
    const position = impressions > 0 ? daily.reduce((s, r) => s + r.position * r.impressions, 0) / impressions : 0;

    await saveGscSnapshot(db, projectId!, {
      totals: { clicks, impressions, ctr, position },
      topQueries: toTop(queries).map((q) => ({ ...q, page: queryPageMap.get(q.key) ?? null })),
      topPages: toTop(pages),
      risingQueries,
    });

    return { rows: daily.length, cost: 0 };
  };
}
