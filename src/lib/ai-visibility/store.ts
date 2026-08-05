import { aiVisibilitySnapshots } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { AiVisibilitySnapshotData, CitedSource, PerEngine, PerQuery } from "./types";

export interface AiVisibilityRow {
  id: string;
  scannedAt: Date;
  queries: { text: string; source: "gsc" | "generated" }[];
  engines: PerEngine[];
  perQuery: PerQuery[];
  namedTotal: number;
  citedTotal: number;
  answersTotal: number;
  citedSources: CitedSource[];
}

function mapRow(r: any): AiVisibilityRow {
  return {
    id: r.id,
    scannedAt: r.scannedAt,
    queries: (r.queries ?? []) as AiVisibilityRow["queries"],
    engines: (r.engines ?? []) as PerEngine[],
    perQuery: (r.perQuery ?? []) as PerQuery[],
    namedTotal: r.namedTotal,
    citedTotal: r.citedTotal,
    answersTotal: r.answersTotal,
    citedSources: (r.citedSources ?? []) as CitedSource[],
  };
}

/** Append one scan (history compounds — never a replace). */
export async function saveScan(db: any, projectId: string, data: AiVisibilitySnapshotData): Promise<void> {
  await db.insert(aiVisibilitySnapshots).values({
    projectId,
    queries: data.queries,
    engines: data.perEngine,
    perQuery: data.perQuery,
    namedTotal: data.namedTotal,
    citedTotal: data.citedTotal,
    answersTotal: data.answersTotal,
    citedSources: data.citedSources,
  });
}

export async function getLatestScan(db: any, projectId: string): Promise<AiVisibilityRow | null> {
  const [row] = await db
    .select()
    .from(aiVisibilitySnapshots)
    .where(eq(aiVisibilitySnapshots.projectId, projectId))
    .orderBy(desc(aiVisibilitySnapshots.scannedAt))
    .limit(1);
  return row ? mapRow(row) : null;
}

/** Scans newest-first (for the trend chart). */
export async function getScanHistory(db: any, projectId: string, limit = 30): Promise<AiVisibilityRow[]> {
  const rows = await db
    .select()
    .from(aiVisibilitySnapshots)
    .where(eq(aiVisibilitySnapshots.projectId, projectId))
    .orderBy(desc(aiVisibilitySnapshots.scannedAt))
    .limit(limit);
  return rows.map(mapRow);
}
