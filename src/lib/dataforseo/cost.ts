import { apiUsage } from "@/db/schema";

// Synthetic endpoint for a DeepSeek reasoning-model chat call (niche extraction /
// relevance judge). Logged through the same apiUsage ledger as DataForSEO so LLM
// spend is never silent — a lesson paid for by a prior 24h billing-lapse outage.
export const DEEPSEEK_CHAT_ENDPOINT = "deepseek/v4-pro/chat";

// Pricing per request (approx, 2026-08); refine against live pricing later.
const PRICES: Record<string, number> = {
  "/v3/serp/google/organic/live/advanced": 0.002,
  "/v3/dataforseo_labs/google/keyword_ideas/live": 0.012,
  "/v3/dataforseo_labs/google/keyword_suggestions/live": 0.012,
  "/v3/dataforseo_labs/google/ranked_keywords/live": 0.012,
  "/v3/dataforseo_labs/google/keyword_overview/live": 0.012,
  "/v3/dataforseo_labs/google/domain_intersection/live": 0.012,
  "/v3/backlinks/summary/live": 0.02,
  "/v3/backlinks/referring_domains/live": 0.02,
  "/v3/backlinks/anchors/live": 0.02,
  [DEEPSEEK_CHAT_ENDPOINT]: 0.003, // ~one reasoning chat call at current DeepSeek pricing
};
export function estimateCost(endpoint: string, _rows: number): number {
  return PRICES[endpoint] ?? 0.012;
}
export async function logApiUsage(db: any, entry: { endpoint: string; rows: number; projectId?: string }) {
  await db.insert(apiUsage).values({
    endpoint: entry.endpoint, rows: entry.rows,
    projectId: entry.projectId ?? null, estCost: String(estimateCost(entry.endpoint, entry.rows)),
  });
}
