import { projects, keywords, rankSnapshots } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { serpOrganicLive } from "@/lib/dataforseo/serp";
import { findDomainRank } from "@/lib/core/rank";
import { logApiUsage, estimateCost } from "@/lib/dataforseo/cost";
import type { DataForSeoClient } from "@/lib/dataforseo/client";

const SERP_ENDPOINT = "/v3/serp/google/organic/live/advanced";

export function rankRefreshHandler(client: DataForSeoClient, serp: typeof serpOrganicLive = serpOrganicLive) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) return { rows: 0, cost: 0 };
    const tracked = await db.select().from(keywords).where(and(eq(keywords.projectId, projectId!), eq(keywords.isTracked, true)));
    let rows = 0, cost = 0;
    for (const kw of tracked) {
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
      await logApiUsage(db, { endpoint: SERP_ENDPOINT, rows: 1, projectId: projectId });
      rows += 1; cost += estimateCost(SERP_ENDPOINT, 1);
    }
    return { rows, cost };
  };
}
