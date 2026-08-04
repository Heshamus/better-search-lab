/**
 * Honesty rule shared across the metric tables/cards (gap-table,
 * competitor-intel-panel, profile-review, rankings-table, opportunity-card):
 * a null/undefined metric renders an em-dash "—", never a fabricated 0.
 * Each of those components used to carry its own identical `fmt` — this is
 * the single source of truth. Rendered output is unchanged: for any real
 * number, `String(n)` equals the old template-literal `${n}`.
 */
export function formatMetric(n: number | null | undefined): string {
  return n == null ? "—" : String(n);
}

// DataForSEO location codes → a readable label. Covers the codes this tool
// actually uses; anything else falls back to the raw code so it's never wrong.
const LOCATION_NAMES: Record<number, string> = {
  2840: "US",
  2826: "UK",
  2124: "Canada",
  2036: "Australia",
  2276: "Germany",
  2250: "France",
  2724: "Spain",
  2356: "India",
};

export function locationLabel(code: number, lang: string): string {
  const place = LOCATION_NAMES[code] ?? String(code);
  return `${place} · ${lang.toUpperCase()}`;
}

// Compact number for dense table cells: 12300 → "12.3K", null → "—".
export function formatCompact(n: number | null | undefined): string {
  return n == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
