import { loadEnv } from "@/config/env";
import { getConnection, replaceGaDaily, saveGaSnapshot, type GaDailyPoint } from "@/lib/google/store";
import { refreshAccessToken } from "@/lib/google/oauth";
import { runGaReport, normGaDate } from "@/lib/google/analytics";

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Async GA4 sync: refresh the token, pull the last 90 days (daily sessions/users,
// window totals, channel mix, top landing pages) and snapshot them. Free.
export function gaSyncHandler(opts?: { fetchImpl?: typeof fetch }) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const env = loadEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth is not configured on this instance");
    const conn = await getConnection(db, projectId!);
    if (!conn?.refreshToken) throw new Error("Google is not connected for this project");
    if (!conn.gaPropertyId) throw new Error("No Google Analytics property selected for this project");
    const prop = conn.gaPropertyId;

    const accessToken = await refreshAccessToken({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      refreshToken: conn.refreshToken,
      fetchImpl: opts?.fetchImpl,
    });

    const end = new Date();
    const start = new Date(end.getTime() - 90 * 86_400_000);
    const window = { startDate: dateStr(start), endDate: dateStr(end) };
    const report = (p: Parameters<typeof runGaReport>[2]) => runGaReport(accessToken, prop, p, opts?.fetchImpl);
    // `conversions` is on GA4's deprecation path (→ key events); isolate it so a
    // removal degrades that one number to 0 instead of failing the whole sync.
    const safeConversions = async (): Promise<number> => {
      try {
        const r = await report({ ...window, dimensions: [], metrics: ["conversions"] });
        return r[0]?.metrics[0] ?? 0;
      } catch {
        return 0;
      }
    };

    const [daily, totalsRows, channelRows, pageRows, conversions] = await Promise.all([
      report({ ...window, dimensions: ["date"], metrics: ["sessions", "totalUsers"] }),
      report({ ...window, dimensions: [], metrics: ["sessions", "totalUsers", "engagementRate"] }),
      report({ ...window, dimensions: ["sessionDefaultChannelGroup"], metrics: ["sessions"], orderByMetric: "sessions", limit: 12 }),
      report({ ...window, dimensions: ["landingPage"], metrics: ["sessions", "engagementRate"], orderByMetric: "sessions", limit: 25 }),
      safeConversions(),
    ]);

    const dailyPoints: GaDailyPoint[] = daily.map((r) => ({
      date: normGaDate(r.dimensions[0] ?? ""),
      sessions: r.metrics[0] ?? 0,
      users: r.metrics[1] ?? 0,
    }));
    await replaceGaDaily(db, projectId!, dailyPoints);

    const t = totalsRows[0]?.metrics ?? [];
    await saveGaSnapshot(db, projectId!, {
      totals: { sessions: t[0] ?? 0, users: t[1] ?? 0, engagementRate: t[2] ?? 0, conversions },
      channels: channelRows.map((r) => ({ channel: r.dimensions[0] || "(other)", sessions: r.metrics[0] ?? 0 })),
      topPages: pageRows.map((r) => ({ page: r.dimensions[0] ?? "", sessions: r.metrics[0] ?? 0, engagementRate: r.metrics[1] ?? 0, conversions: 0 })),
    });

    return { rows: dailyPoints.length, cost: 0 };
  };
}
