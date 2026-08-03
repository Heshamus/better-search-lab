import { keywords, keywordMetrics } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { keywordOverview } from "@/lib/dataforseo/labs";
import { logApiUsage, estimateCost } from "@/lib/dataforseo/cost";
import type { DataForSeoClient } from "@/lib/dataforseo/client";

const OVERVIEW_ENDPOINT = "/v3/dataforseo_labs/google/keyword_overview/live";

export function metricsRefreshHandler(client: DataForSeoClient, overview: typeof keywordOverview = keywordOverview) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const tracked = await db.select().from(keywords).where(and(eq(keywords.projectId, projectId!), eq(keywords.isTracked, true)));
    if (!tracked.length) return { rows: 0, cost: 0 };
    // Phase-1a assumption: one locale per project — use the first tracked keyword's location/language for the bulk call.
    const { locationCode, languageCode } = tracked[0];
    const { items } = await overview(client, { keywords: tracked.map((k: any) => k.keyword), locationCode, languageCode });
    const byKeyword = new Map(tracked.map((k: any) => [k.keyword, k.id]));
    let rows = 0;
    for (const item of items) {
      const keywordId = byKeyword.get(item.keyword);
      if (!keywordId) continue;
      await db.insert(keywordMetrics).values({
        keywordId, searchVolume: item.searchVolume, cpc: item.cpc, competition: item.competition,
        difficulty: item.difficulty, updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: keywordMetrics.keywordId,
        set: { searchVolume: item.searchVolume, cpc: item.cpc, competition: item.competition, difficulty: item.difficulty, updatedAt: new Date() },
      });
      rows++;
    }
    await logApiUsage(db, { endpoint: OVERVIEW_ENDPOINT, rows, projectId });
    return { rows, cost: estimateCost(OVERVIEW_ENDPOINT, rows) };
  };
}
