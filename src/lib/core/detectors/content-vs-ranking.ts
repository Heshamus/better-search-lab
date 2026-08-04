import type { Candidate, DetectorInput } from "./types";

const MIN_CLICKS = 30; // meaningful traffic before we judge the page
const LOW_ENGAGEMENT = 0.35; // GA engaged-session rate below this = the page, not the ranking

/**
 * A page that ranks and earns clicks (GSC) but whose visitors don't engage (GA):
 * the ranking is fine — the PAGE is the problem, so the fix is content/UX, not
 * more SEO. Needs both first-party sources; impossible from rank data alone.
 */
export function detectContentVsRanking(input: DetectorInput): Candidate[] {
  const out: Candidate[] = [];
  for (const p of input.pageSignals) {
    if (p.gscClicks < MIN_CLICKS) continue;
    if (p.gaEngagementRate >= LOW_ENGAGEMENT) continue;
    out.push({
      type: "content_vs_ranking",
      keyword: p.url,
      keywordId: null,
      volume: p.gscClicks,
      difficulty: null,
      currentPosition: Math.round(p.gscPosition),
      trend: null,
      evidence: { url: p.url, gscClicks: p.gscClicks, gaSessions: p.gaSessions, gaEngagementRate: p.gaEngagementRate, gaConversions: p.gaConversions },
    });
  }
  return out;
}
