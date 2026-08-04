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
