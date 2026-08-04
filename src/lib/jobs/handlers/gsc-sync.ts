import { loadEnv } from "@/config/env";
import { getConnection, replaceGscDaily, saveGscSnapshot } from "@/lib/google/store";
import { refreshAccessToken } from "@/lib/google/oauth";
import { searchAnalytics, type GscRow, type GscTopRow } from "@/lib/google/gsc";

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
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth is not configured on this instance");
    const conn = await getConnection(db, projectId!);
    if (!conn?.refreshToken || !conn.propertyUrl) throw new Error("Search Console is not connected for this project");

    const accessToken = await refreshAccessToken({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      refreshToken: conn.refreshToken,
      fetchImpl: opts?.fetchImpl,
    });

    const end = new Date();
    const start = new Date(end.getTime() - 90 * 86_400_000);
    const window = { startDate: dateStr(start), endDate: dateStr(end) };
    const [daily, queries, pages] = await Promise.all([
      searchAnalytics(accessToken, conn.propertyUrl, { ...window, dimensions: ["date"] }, opts?.fetchImpl),
      searchAnalytics(accessToken, conn.propertyUrl, { ...window, dimensions: ["query"], rowLimit: 25 }, opts?.fetchImpl),
      searchAnalytics(accessToken, conn.propertyUrl, { ...window, dimensions: ["page"], rowLimit: 25 }, opts?.fetchImpl),
    ]);

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
      topQueries: toTop(queries),
      topPages: toTop(pages),
    });

    return { rows: daily.length, cost: 0 };
  };
}
