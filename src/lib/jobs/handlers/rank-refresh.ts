import { projects, keywords, rankSnapshots } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { serpOrganicLive } from "@/lib/dataforseo/serp";
import { findDomainRank } from "@/lib/core/rank";
import { logApiUsage, estimateCost } from "@/lib/dataforseo/cost";
import { mapLimit } from "@/lib/async/map-limit";
import type { DataForSeoClient } from "@/lib/dataforseo/client";

const SERP_ENDPOINT = "/v3/serp/google/organic/live/advanced";
// Each SERP lookup is one live request; fetching them one-at-a-time made a
// 38-keyword refresh take ~5 minutes. They're independent per keyword, so fan
// out with a cap that speeds this up ~8× without stampeding the provider.
const SERP_CONCURRENCY = 8;

export function rankRefreshHandler(client: DataForSeoClient, serp: typeof serpOrganicLive = serpOrganicLive) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) return { rows: 0, cost: 0 };
    const tracked = await db.select().from(keywords).where(and(eq(keywords.projectId, projectId!), eq(keywords.isTracked, true)));

    await mapLimit(tracked, SERP_CONCURRENCY, async (kw: any) => {
      try {
        const { items } = await serp(client, { keyword: kw.keyword, locationCode: kw.locationCode, languageCode: kw.languageCode, device: kw.device });
        const hit = findDomainRank(items, project.domain);
        const features = items[0]?.serpFeatures ?? [];
        const ownUrls = [...new Set(items.filter((i) => i.domain === project.domain).map((i) => i.url))];
        await db.insert(rankSnapshots).values({
          keywordId: kw.id, rankAbsolute: hit?.rankAbsolute ?? null, rankGroup: hit?.rankGroup ?? null,
          url: hit?.url ?? null, serpFeatures: features, fetchStatus: "ok", ownUrls,
        });
      } catch (e: any) {
        await db.insert(rankSnapshots).values({ keywordId: kw.id, fetchStatus: "failed", reason: String(e?.message ?? e) });
      }
      await logApiUsage(db, { endpoint: SERP_ENDPOINT, rows: 1, projectId });
    });

    // One SERP request billed per tracked keyword (ok or failed both call the API).
    const rows = tracked.length;
    return { rows, cost: rows * estimateCost(SERP_ENDPOINT, 1) };
  };
}
