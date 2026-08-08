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
 * `netNewLost[i]` is the referring-domain set difference vs. the prior
 * snapshot: (domains added) − (domains lost), per the spec formula
 * |domains[i] \ domains[i-1]| − |domains[i-1] \ domains[i]|. For two true
 * sets that quantity is ALWAYS arithmetically equal to a plain size delta
 * (|domains[i]| − |domains[i-1]|) — basic set theory (|A\B|-|B\A| = |A|-|B|),
 * not a coincidence — so this is not about producing a different NUMBER than
 * a naive `.length` delta would. The real reason to diff via `Set` is
 * correctness if `domains[i]` (or `[i-1]`) ever contains the same domain
 * twice: `Set` absorbs that for free, where `.length` would silently
 * double-count it. (Also not the same quantity as `referringDomains[i] -
 * referringDomains[i-1]` above — that's DataForSEO's reported TOTAL
 * referring-domain count, while `domains` here is only the stored top-N
 * list, so the two series aren't expected to reconcile.)
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
