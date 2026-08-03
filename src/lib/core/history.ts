export interface Snap {
  keywordId: string;
  capturedAt: Date;
  rankAbsolute: number | null;
  fetchStatus: string;
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

function latestAtOrBefore(snaps: Snap[], t: Date): Snap | null {
  let best: Snap | null = null;
  for (const s of snaps)
    if (s.capturedAt <= t && (!best || s.capturedAt > best.capturedAt))
      best = s;
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
  if (!current || !previous) return null;
  return (previous.rankAbsolute as number) - (current.rankAbsolute as number);
}
