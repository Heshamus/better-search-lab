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
