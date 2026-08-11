import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rankedKeywords } from "@/lib/dataforseo/labs";
import { replaceOrganicKeywords, type OrganicKeywordRow } from "@/lib/organic-keywords-store";
import { logApiUsage, estimateCost } from "@/lib/dataforseo/cost";
import type { DataForSeoClient } from "@/lib/dataforseo/client";
import { normalizeDomain } from "@/lib/competitors";

const RANKED = "/v3/dataforseo_labs/google/ranked_keywords/live";
const LIMIT = 1000; // top 1,000 by volume — see plan Global Constraints

// Async organic-keywords refresh: pull every keyword the project's domain ranks
// for (one DataForSEO call) and replace the stored snapshot, so repeat views
// don't re-spend. A domain that ranks for nothing is a legitimate empty result.
export function organicKeywordsRefreshHandler(client: DataForSeoClient) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) return { rows: 0, cost: 0 };

    const { items, rows: n } = await rankedKeywords(client, {
      target: normalizeDomain(project.domain),
      locationCode: project.defaultLocationCode,
      languageCode: project.defaultLanguageCode,
      limit: LIMIT,
    });

    const rows: OrganicKeywordRow[] = items
      .filter((it) => !!it.keyword)
      .map((it) => ({
        keyword: it.keyword,
        position: it.rankAbsolute,
        searchVolume: it.searchVolume,
        difficulty: it.difficulty,
        url: it.url,
        estTraffic: it.etv,
      }));

    await replaceOrganicKeywords(db, projectId!, rows);
    await logApiUsage(db, { endpoint: RANKED, rows: n, projectId });
    return { rows: rows.length, cost: estimateCost(RANKED, n) };
  };
}
