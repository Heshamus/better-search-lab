import { apiUsage } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface UsageSummary {
  total: number;
  byDay: { day: string; cost: number }[];
  byEndpoint: { endpoint: string; cost: number; rows: number }[];
}

/**
 * Aggregates api_usage rows into a total, a per-day cost series, and a
 * per-endpoint cost+rows breakdown. `est_cost` is stored as Postgres
 * `numeric`, which Drizzle returns as a string — every value is parsed with
 * Number() before summing, never string-concatenated. Optionally scoped to
 * one project; omitting projectId summarizes usage across all projects.
 */
export async function usageSummary(db: any, projectId?: string): Promise<UsageSummary> {
  const rows = projectId
    ? await db.select().from(apiUsage).where(eq(apiUsage.projectId, projectId))
    : await db.select().from(apiUsage);

  let total = 0;
  const byDayMap = new Map<string, number>();
  const byEndpointMap = new Map<string, { cost: number; rows: number }>();

  for (const r of rows) {
    const cost = Number(r.estCost);
    total += cost;

    const day = toDayKey(r.occurredAt);
    byDayMap.set(day, (byDayMap.get(day) ?? 0) + cost);

    const endpointAgg = byEndpointMap.get(r.endpoint) ?? { cost: 0, rows: 0 };
    endpointAgg.cost += cost;
    endpointAgg.rows += r.rows ?? 0;
    byEndpointMap.set(r.endpoint, endpointAgg);
  }

  const byDay = [...byDayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, cost]) => ({ day, cost }));

  const byEndpoint = [...byEndpointMap.entries()]
    .map(([endpoint, v]) => ({ endpoint, cost: v.cost, rows: v.rows }));

  return { total, byDay, byEndpoint };
}

function toDayKey(occurredAt: Date | string): string {
  const dt = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  return dt.toISOString().slice(0, 10);
}
