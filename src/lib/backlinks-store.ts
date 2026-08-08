import { backlinkSnapshots } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { BacklinkSummary, ReferringDomain, Anchor } from "@/lib/dataforseo/backlinks";

export interface BacklinkRow {
  id: string;
  createdAt: Date;
  summary: BacklinkSummary | null;
  referringDomains: ReferringDomain[];
  anchors: Anchor[];
}

/** One backlinks snapshot reduced to what the trend charts plot. */
export interface BacklinkHistoryPoint {
  at: Date;
  backlinks: number;
  referringDomains: number;
  rank: number | null;
  domains: string[];
}

export async function saveBacklinks(
  db: any,
  projectId: string,
  data: { summary: BacklinkSummary; referringDomains: ReferringDomain[]; anchors: Anchor[] },
): Promise<void> {
  await db.insert(backlinkSnapshots).values({
    projectId,
    summary: data.summary,
    referringDomains: data.referringDomains,
    anchors: data.anchors,
  });
}

/** The most recent backlinks snapshot for a project, or null if none. */
export async function latestBacklinks(db: any, projectId: string): Promise<BacklinkRow | null> {
  const [row] = await db
    .select({
      id: backlinkSnapshots.id,
      createdAt: backlinkSnapshots.createdAt,
      summary: backlinkSnapshots.summary,
      referringDomains: backlinkSnapshots.referringDomains,
      anchors: backlinkSnapshots.anchors,
    })
    .from(backlinkSnapshots)
    .where(eq(backlinkSnapshots.projectId, projectId))
    .orderBy(desc(backlinkSnapshots.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.createdAt,
    summary: (row.summary ?? null) as BacklinkSummary | null,
    referringDomains: (row.referringDomains ?? []) as ReferringDomain[],
    anchors: (row.anchors ?? []) as Anchor[],
  };
}

/**
 * Backlink snapshots for a project, oldest → newest, reduced to the fields
 * the trend charts need. Queries `desc(createdAt) + limit` to get the
 * `limit` MOST RECENT snapshots, then reverses in memory so the returned
 * array is still oldest → newest — the order the charts need.
 *
 * Deliberately NOT `orderBy(asc) + limit`: that would return the OLDEST
 * `limit` rows instead, so once a project passed `limit` snapshots the
 * trend would freeze on ancient data forever instead of sliding forward.
 */
export async function getBacklinksHistory(db: any, projectId: string, limit = 90): Promise<BacklinkHistoryPoint[]> {
  const rows = await db
    .select({
      createdAt: backlinkSnapshots.createdAt,
      summary: backlinkSnapshots.summary,
      referringDomains: backlinkSnapshots.referringDomains,
    })
    .from(backlinkSnapshots)
    .where(eq(backlinkSnapshots.projectId, projectId))
    .orderBy(desc(backlinkSnapshots.createdAt))
    .limit(limit);

  return rows
    .map((row: any) => {
      const summary = (row.summary ?? null) as BacklinkSummary | null;
      const referringDomains = (row.referringDomains ?? []) as ReferringDomain[];
      return {
        at: row.createdAt as Date,
        backlinks: summary?.backlinks ?? 0,
        referringDomains: summary?.referringDomains ?? 0,
        rank: summary?.rank ?? null,
        domains: referringDomains.map((d) => d.domain),
      };
    })
    .reverse();
}
