import { projects } from "@/db/schema";
import { getConnection } from "@/lib/google/store";
import { getLatestRadar } from "./store";

const DAY_MS = 20 * 3_600_000; // ~daily, self-healing (survives a missed/duplicate tick)

/**
 * Self-healing daily Reddit-radar pass, run from the daily worker tick: scan each
 * Google-connected project not scanned in the last ~20h (its terms come from GSC).
 * Off when SerpApi isn't configured; per-project fail-soft.
 */
export async function runDailyRedditRadar(deps: {
  db: any;
  now: Date;
  env: { SERPAPI_API_KEY?: string };
  scan: (projectId: string) => Promise<void>;
}): Promise<{ scanned: string[] }> {
  const { db, now, env } = deps;
  const scanned: string[] = [];
  if (!env.SERPAPI_API_KEY) return { scanned }; // radar off

  const all = await db.select().from(projects);
  for (const project of all) {
    const conn = await getConnection(db, project.id);
    if (!conn?.propertyUrl) continue; // needs Search Console queries
    const latest = await getLatestRadar(db, project.id);
    if (latest && now.getTime() - latest.scannedAt.getTime() < DAY_MS) continue;
    try {
      await deps.scan(project.id);
      scanned.push(project.id);
    } catch (e) {
      console.error("[reddit-radar] failed for", project.id, e);
    }
  }
  return { scanned };
}
