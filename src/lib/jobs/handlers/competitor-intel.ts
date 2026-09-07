import { projects, competitors } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rankedKeywords } from "@/lib/dataforseo/labs";
import { saveCompetitorKeywords } from "@/lib/competitor-intel";
import { logApiUsage, estimateCost } from "@/lib/dataforseo/cost";
import type { DataForSeoClient } from "@/lib/dataforseo/client";

const ENDPOINT = "/v3/dataforseo_labs/google/ranked_keywords/live";
const LIMIT = 300;

export function competitorIntelHandler(client: DataForSeoClient) {
  return async (ctx: { db: any; projectId?: string; progress?: (message: string) => Promise<void> }) => {
    const { db, projectId, progress } = ctx;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) return { rows: 0, cost: 0 };
    const comps = await db.select().from(competitors).where(eq(competitors.projectId, projectId!));
    let rows = 0, cost = 0;
    for (const [i, c] of comps.entries()) {
      await progress?.(`Reading ${c.domain}'s rankings (${i + 1} of ${comps.length})`);
      const { items, rows: n } = await rankedKeywords(client, {
        target: c.domain, locationCode: project.defaultLocationCode, languageCode: project.defaultLanguageCode, limit: LIMIT,
      });
      await saveCompetitorKeywords(db, projectId!, c.domain, items.map((it) => ({
        keyword: it.keyword, rankAbsolute: it.rankAbsolute, url: it.url, volume: it.searchVolume, difficulty: it.difficulty,
      })));
      await logApiUsage(db, { endpoint: ENDPOINT, rows: n, projectId });
      rows += n; cost += estimateCost(ENDPOINT, n);
    }
    return { rows, cost };
  };
}
