import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { backlinksSummary, referringDomains, backlinkAnchors } from "@/lib/dataforseo/backlinks";
import { saveBacklinks } from "@/lib/backlinks-store";
import { logApiUsage, estimateCost } from "@/lib/dataforseo/cost";
import type { DataForSeoClient } from "@/lib/dataforseo/client";

const SUMMARY = "/v3/backlinks/summary/live";
const DOMAINS = "/v3/backlinks/referring_domains/live";
const ANCHORS = "/v3/backlinks/anchors/live";

// Async backlinks refresh: pull the DataForSEO summary + top referring domains +
// anchors concurrently and snapshot them, so repeat views don't re-spend.
export function backlinksRefreshHandler(client: DataForSeoClient) {
  return async (ctx: { db: any; projectId?: string; progress?: (message: string) => Promise<void> }) => {
    const { db, projectId, progress } = ctx;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) return { rows: 0, cost: 0 };
    const target = project.domain;

    await progress?.("Fetching backlink summary, referring domains and anchors…");
    const [sum, dom, anch] = await Promise.all([
      backlinksSummary(client, { target }),
      referringDomains(client, { target, limit: 50 }),
      backlinkAnchors(client, { target, limit: 20 }),
    ]);

    await progress?.("Saving snapshot");
    await saveBacklinks(db, projectId!, { summary: sum.summary, referringDomains: dom.items, anchors: anch.items });

    let cost = 0;
    let rows = 0;
    for (const [endpoint, n] of [[SUMMARY, sum.rows], [DOMAINS, dom.rows], [ANCHORS, anch.rows]] as const) {
      await logApiUsage(db, { endpoint, rows: n, projectId });
      cost += estimateCost(endpoint, n);
      rows += n;
    }
    return { rows, cost };
  };
}
