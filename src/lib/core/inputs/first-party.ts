import { getGscData, getGaData } from "@/lib/google/store";
import type { PageSignal } from "@/lib/core/detectors/types";

export type { PageSignal };

export interface GscQueryStat {
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
}

/** Normalize a keyword / query for exact-match joining (lowercase, single-spaced). */
export const normQuery = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, " ");

const pathOf = (u: string): string => {
  try {
    return new URL(u).pathname || "/";
  } catch {
    return u;
  }
};

/** Join GSC top pages to GA landing pages by normalized path; missing GA → zeros. */
export function joinGscGa(
  gscPages: { key: string; clicks: number; impressions: number; ctr: number; position: number }[],
  gaByPath: Map<string, { sessions: number; engagementRate: number; conversions: number }>,
): PageSignal[] {
  return gscPages.map((p) => {
    const ga = gaByPath.get(pathOf(p.key)) ?? { sessions: 0, engagementRate: 0, conversions: 0 };
    return {
      url: p.key,
      gscClicks: p.clicks,
      gscImpressions: p.impressions,
      gscPosition: p.position,
      gaSessions: ga.sessions,
      gaEngagementRate: ga.engagementRate,
      gaConversions: ga.conversions,
    };
  });
}

/**
 * Read the latest GSC + GA snapshots into engine-ready first-party signals. When
 * a project has no Google connection both structures come back empty, so the
 * engine behaves exactly as it did before Google was connected (unit-proven).
 */
export async function buildFirstPartyInput(
  db: any,
  projectId: string,
): Promise<{ gscByQuery: Map<string, GscQueryStat>; pageSignals: PageSignal[] }> {
  const [gsc, ga] = await Promise.all([getGscData(db, projectId), getGaData(db, projectId)]);

  const gscByQuery = new Map<string, GscQueryStat>();
  for (const q of gsc?.topQueries ?? []) {
    gscByQuery.set(normQuery(q.key), { impressions: q.impressions, clicks: q.clicks, ctr: q.ctr, position: q.position });
  }

  const gaByPath = new Map(
    (ga?.topPages ?? []).map((p) => [pathOf(p.page), { sessions: p.sessions, engagementRate: p.engagementRate ?? 0, conversions: p.conversions }]),
  );
  const pageSignals = joinGscGa(gsc?.topPages ?? [], gaByPath);

  return { gscByQuery, pageSignals };
}
