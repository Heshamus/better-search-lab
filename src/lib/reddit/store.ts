import { redditRadarSnapshots } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { RedditRadarData, RadarTerm, RadarSubreddit } from "./radar";

export interface RedditRadarRow {
  id: string;
  scannedAt: Date;
  terms: RadarTerm[];
  subreddits: RadarSubreddit[];
  termsScanned: number;
  threadsTotal: number;
}

/** Append one radar scan (history compounds). */
export async function saveRadar(db: any, projectId: string, data: RedditRadarData): Promise<void> {
  await db.insert(redditRadarSnapshots).values({
    projectId,
    terms: data.terms,
    subreddits: data.subreddits,
    termsScanned: data.termsScanned,
    threadsTotal: data.threadsTotal,
  });
}

export async function getLatestRadar(db: any, projectId: string): Promise<RedditRadarRow | null> {
  const [row] = await db
    .select()
    .from(redditRadarSnapshots)
    .where(eq(redditRadarSnapshots.projectId, projectId))
    .orderBy(desc(redditRadarSnapshots.scannedAt))
    .limit(1);
  return row
    ? {
        id: row.id,
        scannedAt: row.scannedAt,
        terms: (row.terms ?? []) as RadarTerm[],
        subreddits: (row.subreddits ?? []) as RadarSubreddit[],
        termsScanned: row.termsScanned,
        threadsTotal: row.threadsTotal,
      }
    : null;
}
