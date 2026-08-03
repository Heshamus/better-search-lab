export interface RankSparklinePoint {
  rankAbsolute: number | null;
  capturedAt?: string | Date;
  fetchStatus?: string;
}

const WIDTH = 240;
const HEIGHT = 60;
const PAD_X = 4;
const PAD_Y = 6;

/**
 * Tiny inline SVG trend line for one keyword's rank history (Task 5). Pure
 * presentational — no fetching, no state; `RankingsTable`'s drill-in owns
 * that and passes `rankHistory`'s rows straight through.
 *
 * Deliberately plots so a LOWER rank number (a better position) lands at a
 * SMALLER svg y — i.e. higher up the chart. That is the opposite of the
 * "bigger value sits higher" convention most trend lines use for a plain
 * metric, which is exactly the inversion mistake this scale avoids: naively
 * reusing a normal metric's scale here would put rank 1 at the BOTTOM.
 *
 * A null point (never fetched, or a failed fetch — see `rankHistory`) is a
 * genuine gap: it is skipped as a plot point and breaks the polyline rather
 * than being interpolated across, so a stretch with no real data never
 * reads as a smooth, confident line. An isolated ok point with a gap on
 * both sides still renders as a dot, so it isn't silently dropped.
 */
export function RankSparkline({ points }: { points: RankSparklinePoint[] }) {
  const knownRanks = points
    .map((p) => p.rankAbsolute)
    .filter((r): r is number => r != null);

  if (knownRanks.length === 0) {
    return <p className="text-xs text-neutral-400 dark:text-neutral-500">No rank history yet.</p>;
  }

  const minRank = Math.min(...knownRanks);
  const maxRank = Math.max(...knownRanks);
  const span = maxRank - minRank || 1; // avoid /0 when every ok point shares one rank

  const n = points.length;
  const xAt = (i: number) => (n <= 1 ? WIDTH / 2 : PAD_X + (i / (n - 1)) * (WIDTH - PAD_X * 2));
  // Lower rank -> smaller y -> higher on the chart (see file comment above).
  const yAt = (rank: number) => PAD_Y + ((rank - minRank) / span) * (HEIGHT - PAD_Y * 2);

  type Plotted = { i: number; x: number; y: number; rank: number };
  const segments: Plotted[][] = [];
  let current: Plotted[] = [];
  points.forEach((p, i) => {
    if (p.rankAbsolute == null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push({ i, x: xAt(i), y: yAt(p.rankAbsolute), rank: p.rankAbsolute });
  });
  if (current.length) segments.push(current);

  return (
    <svg
      data-testid="rank-sparkline"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-16 w-full max-w-xs text-accent"
      role="img"
      aria-label="Rank history over time"
    >
      {segments.map((segment, si) =>
        segment.length > 1 ? (
          <polyline
            key={si}
            points={segment.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          />
        ) : null,
      )}
      {segments.flat().map((p) => (
        <circle key={p.i} data-testid="sparkline-point" data-rank={p.rank} cx={p.x} cy={p.y} r={2} fill="currentColor" />
      ))}
    </svg>
  );
}
