import { TrendCard } from "@/components/trend-card";
import { computeBacklinkTrends } from "@/lib/backlinks-trends";
import { formatCompact } from "@/lib/format";
import type { BacklinkHistoryPoint } from "@/lib/backlinks-store";

const rankFormat = (n: number) => String(Math.round(n));
const netFormat = (n: number) => (n > 0 ? "+" : "") + Math.round(n);
const EMPTY_LABEL = "Refresh backlinks to build a trend";

/**
 * Backlinks-over-time: four `TrendCard`s computed from the project's
 * backlink snapshot history (oldest → newest) — total backlinks, referring
 * domains, domain rank, and net new/lost referring domains vs. the prior
 * snapshot. Sits above `BacklinksReport` (the latest-snapshot breakdown) on
 * the Backlinks page.
 */
export function BacklinksTrends({ history }: { history: BacklinkHistoryPoint[] }) {
  const trends = computeBacklinkTrends(history);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TrendCard
        title="Total backlinks"
        points={trends.backlinks}
        labels={trends.labels}
        format={formatCompact}
        color="var(--color-accent)"
        emptyLabel={EMPTY_LABEL}
      />
      <TrendCard
        title="Referring domains"
        points={trends.referringDomains}
        labels={trends.labels}
        format={formatCompact}
        color="var(--color-series-2)"
        emptyLabel={EMPTY_LABEL}
      />
      <TrendCard
        title="Domain rank"
        points={trends.rank}
        labels={trends.labels}
        format={rankFormat}
        color="var(--color-series-3)"
        emptyLabel={EMPTY_LABEL}
      />
      <TrendCard
        title="Net new/lost referring domains"
        points={trends.netNewLost}
        labels={trends.labels}
        format={netFormat}
        color="var(--color-series-4)"
        emptyLabel={EMPTY_LABEL}
      />
    </div>
  );
}
