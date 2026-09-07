import { eq } from "drizzle-orm";
import { projects } from "@/db/schema";
import type { DataForSeoClient } from "@/lib/dataforseo/client";
import { competitorsDomain, type CompetitorSuggestion } from "@/lib/dataforseo/labs";
import { logApiUsage } from "@/lib/dataforseo/cost";
import { listCompetitors, normalizeDomain } from "@/lib/competitors";

export const COMPETITORS_DOMAIN_ENDPOINT = "/v3/dataforseo_labs/google/competitors_domain/live";
const SUGGEST_LIMIT = 10;

/**
 * Suggest competitors for a project (spec §11.3): one Labs call, then drop the
 * project's own domain and anything already tracked. Domains are compared in
 * their normalized form (`normalizeDomain`) so `www.` never hides a duplicate.
 */
export async function suggestCompetitors(db: any, client: DataForSeoClient, projectId: string): Promise<CompetitorSuggestion[]> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return [];
  const own = normalizeDomain(project.domain);
  const tracked = new Set((await listCompetitors(db, projectId)).map((c) => normalizeDomain(c.domain)));
  const { items, rows } = await competitorsDomain(client, {
    target: own, locationCode: project.defaultLocationCode, languageCode: project.defaultLanguageCode, limit: SUGGEST_LIMIT,
  });
  await logApiUsage(db, { endpoint: COMPETITORS_DOMAIN_ENDPOINT, rows, projectId });
  const seen = new Set<string>();
  const out: CompetitorSuggestion[] = [];
  for (const it of items) {
    const d = normalizeDomain(it.domain);
    if (!d || d === own || tracked.has(d) || seen.has(d)) continue;
    seen.add(d);
    out.push({ ...it, domain: d });
  }
  return out;
}
