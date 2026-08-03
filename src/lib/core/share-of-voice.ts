export function shareOfVoice(
  rows: { domain: string; rankAbsolute: number | null }[],
): Map<string, number> {
  const raw = new Map<string, number>();
  for (const r of rows) {
    const v = r.rankAbsolute && r.rankAbsolute > 0 ? 1 / r.rankAbsolute : 0;
    raw.set(r.domain, (raw.get(r.domain) ?? 0) + v);
  }
  const total = [...raw.values()].reduce((a, b) => a + b, 0);
  const out = new Map<string, number>();
  for (const [domain, v] of raw)
    out.set(domain, total > 0 ? (v / total) * 100 : 0);
  return out;
}
