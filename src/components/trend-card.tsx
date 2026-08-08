import { AreaTrend } from "@/components/charts";

/**
 * Shared trend panel: a headline (latest value), a Δ chip (first → latest),
 * and an `AreaTrend` chart underneath. Generalizes the "Cited rate over
 * time" panel from `AiVisibilityDashboard` so any historical metric —
 * cited rate, backlinks, average rank position, GSC clicks — gets the same
 * treatment.
 *
 * `invert` is for metrics where a SMALLER number is the win (rank position):
 * it flips both the "higher/lower is better" eyebrow and which delta
 * direction counts as an improvement, matching `AreaTrend`'s own `invert`
 * (which flips the chart's y-axis the same way).
 */
export function TrendCard({
  title,
  points,
  labels,
  format,
  invert = false,
  color,
  emptyLabel,
  showDelta = true,
}: {
  title: string;
  points: number[];
  labels?: string[];
  format: (n: number) => string;
  invert?: boolean;
  color?: string;
  emptyLabel: string;
  // Set false for a series that is ALREADY a per-period delta (e.g. net
  // new/lost): a first→latest Δ chip is meaningless there (the first point is
  // a synthetic 0, so the chip just repeats the headline). Levels keep it.
  showDelta?: boolean;
}) {
  const hasLatest = points.length > 0;
  const headline = hasLatest ? format(points[points.length - 1]) : "—";
  const hasDelta = points.length >= 2 && showDelta;

  // "Improvement" flips with `invert`: for a plain metric a rise (delta>0)
  // is good, but for a rank/position series a FALL (delta<0) is the climb.
  let deltaClass = "bg-neutral-800/60 text-neutral-400";
  let deltaText = "";
  if (hasDelta) {
    const delta = points[points.length - 1] - points[0];
    const improved = invert ? delta < 0 : delta > 0;
    const declined = invert ? delta > 0 : delta < 0;
    deltaText = `${delta > 0 ? "+" : ""}${format(delta)}`;
    if (improved) deltaClass = "bg-accent/15 text-accent";
    else if (declined) deltaClass = "bg-at-risk/15 text-at-risk";
  }

  return (
    <div className="panel flex flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="eyebrow">{invert ? "lower is better" : "higher is better"}</span>
      </div>
      <div className="flex items-baseline gap-2.5">
        <span data-testid="trend-headline" className="num text-[1.7rem] font-semibold leading-none tracking-tight text-white">{headline}</span>
        {hasDelta ? (
          <span data-testid="trend-delta" className={`tnum rounded-md px-1.5 py-0.5 text-xs font-medium ${deltaClass}`}>
            {deltaText}
          </span>
        ) : null}
      </div>
      <AreaTrend
        points={points}
        labels={labels ?? []}
        invert={invert}
        color={color ?? "var(--color-accent)"}
        height={190}
        yFormat={format}
        emptyLabel={emptyLabel}
      />
    </div>
  );
}
