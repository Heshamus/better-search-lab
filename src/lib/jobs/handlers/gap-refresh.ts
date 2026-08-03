import { projects, competitors } from "@/db/schema";
import { eq } from "drizzle-orm";
import { domainIntersection } from "@/lib/dataforseo/labs";
import { logApiUsage, estimateCost } from "@/lib/dataforseo/cost";
import { saveGapRows } from "@/lib/competitors";
import type { DataForSeoClient } from "@/lib/dataforseo/client";

const ENDPOINT = "/v3/dataforseo_labs/google/domain_intersection/live";

export function gapRefreshHandler(client: DataForSeoClient) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) return { rows: 0, cost: 0 };
    const comps = await db.select().from(competitors).where(eq(competitors.projectId, projectId!));
    let rows = 0, cost = 0;
    for (const c of comps) {
      const { items, rows: n } = await domainIntersection(client, {
        competitor: c.domain, us: project.domain,
        locationCode: project.defaultLocationCode, languageCode: project.defaultLanguageCode,
      });
      await saveGapRows(db, projectId!, c.domain, items);
      await logApiUsage(db, { endpoint: ENDPOINT, rows: n, projectId });
      rows += n; cost += estimateCost(ENDPOINT, n);
    }
    return { rows, cost };
  };
}
