import type { BacklinkHistoryPoint } from "@/lib/backlinks-store";

export interface BacklinkTrends {
  backlinks: number[];
  referringDomains: number[];
  rank: number[];
  netNewLost: number[];
  labels: string[];
}

/**
 * Pure transform: backlink snapshot history (oldest → newest, as returned by
 * `getBacklinksHistory`) into the parallel series each `TrendCard` plots,
 * plus the chart's [first, last] date labels. No I/O — callers fetch
 * `history` separately, which keeps this trivially unit-testable.
 *
 * `rank` maps a missing domain rank (`null`, e.g. before DataForSEO has
 * scored the domain) to `0` rather than breaking the series or carrying the
 * last-known value forward — a flat 0 reads honestly as "no rank yet"
 * without a chart gap.
 *
 * `netNewLost[i]` is the actual referring-domain set difference vs. the
 * prior snapshot: (domains added) − (domains lost). It is NOT the same as
 * `referringDomains[i] - referringDomains[i-1]`, which nets adds against
 * drops and would show 0 when e.g. 2 domains are gained and 2 are lost.
 * `netNewLost[0]` is always 0 — there's no prior snapshot to diff against.
 */
export function computeBacklinkTrends(history: BacklinkHistoryPoint[]): BacklinkTrends {
  const backlinks = history.map((h) => h.backlinks);
  const referringDomains = history.map((h) => h.referringDomains);
  const rank = history.map((h) => h.rank ?? 0);

  const netNewLost = history.map((point, i) => {
    if (i === 0) return 0;
    const prev = new Set(history[i - 1].domains);
    const curr = new Set(point.domains);
    let added = 0;
    for (const d of curr) if (!prev.has(d)) added++;
    let lost = 0;
    for (const d of prev) if (!curr.has(d)) lost++;
    return added - lost;
  });

  const labels = history.length
    ? [history[0].at.toISOString().slice(0, 10), history[history.length - 1].at.toISOString().slice(0, 10)]
    : [];

  return { backlinks, referringDomains, rank, netNewLost, labels };
}
