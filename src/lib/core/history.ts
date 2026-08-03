export interface Snap {
  keywordId: string;
  capturedAt: Date;
  rankAbsolute: number | null;
  fetchStatus: string;
  id?: string;
}

export function latestByKeyword(snaps: Snap[]): Map<string, Snap> {
  const m = new Map<string, Snap>();
  for (const s of snaps) {
    if (s.fetchStatus !== "ok") continue;
    const cur = m.get(s.keywordId);
    if (!cur || s.capturedAt > cur.capturedAt) m.set(s.keywordId, s);
  }
  return m;
}

// True when `a` is "later" than `b`: a strictly greater capturedAt wins
// outright; an exact tie (simultaneous captures) is broken by `id` so the
// winner is deterministic regardless of the input array's own order,
// instead of silently depending on iteration/insertion order.
function isLater(a: Snap, b: Snap): boolean {
  const byTime = a.capturedAt.getTime() - b.capturedAt.getTime();
  if (byTime !== 0) return byTime > 0;
  return (a.id ?? "") > (b.id ?? "");
}

function latestAtOrBefore(snaps: Snap[], t: Date): Snap | null {
  let best: Snap | null = null;
  for (const s of snaps)
    if (s.capturedAt <= t && (!best || isLater(s, best))) best = s;
  return best;
}

export function deltaForKeyword(
  snaps: Snap[],
  asOf: Date,
  days: number,
): number | null {
  const ok = snaps.filter(
    (s) => s.fetchStatus === "ok" && s.rankAbsolute != null,
  );
  const prevCutoff = new Date(asOf.getTime() - days * 86_400_000);
  const current = latestAtOrBefore(ok, asOf);
  const previous = latestAtOrBefore(ok, prevCutoff);
  // A delta needs two DISTINCT time points. When only one ok sample is
  // reachable for both cutoffs (e.g. a single old snapshot with nothing
  // more recent), current/previous resolve to the very same snapshot
  // (reference-equal — latestAtOrBefore returns the actual array element),
  // and `rank - rank` would silently read as a real "no change" 0 instead
  // of the honest "no recent data" null. Two genuinely distinct snapshots
  // that happen to share a rank still correctly return 0 (a real no-change).
  if (!current || !previous || current === previous) return null;
  return (previous.rankAbsolute as number) - (current.rankAbsolute as number);
}
