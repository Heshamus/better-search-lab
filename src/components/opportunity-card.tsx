import type { opportunities } from "@/db/schema";
import { OpportunityActions } from "@/components/opportunity-actions";
import { formatMetric } from "@/lib/format";

export type OpportunityRow = typeof opportunities.$inferSelect;

// Human label + color per OpportunityType (spec §8): striking distance/gap/
// momentum read as positive, forward-leaning moves (accent green); decay is
// the one type that means "you're losing ground" (at-risk amber); the two
// more mechanical/structural types (a SERP feature to capture, duplicate
// URLs to consolidate) stay neutral rather than reading as good or bad news.
const TYPE_LABELS: Record<string, string> = {
  striking_distance: "Striking distance",
  gap: "Gap",
  momentum: "Rising",
  decay: "At-risk",
  serp_feature: "SERP feature",
  cannibalization: "Cannibalization",
};

const NEUTRAL_CHIP = "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300";

const TYPE_CHIP_CLASSES: Record<string, string> = {
  striking_distance: "bg-accent/20 text-accent",
  gap: "bg-accent/20 text-accent",
  momentum: "bg-accent/20 text-accent",
  decay: "bg-at-risk/20 text-at-risk",
  serp_feature: NEUTRAL_CHIP,
  cannibalization: NEUTRAL_CHIP,
};

// Like formatMetric (shared "—"-for-null rule), but with a +/- sign on real
// values so the direction of movement reads at a glance (trend is already
// signed: positive = climbed). Kept local — the signed shape is unique to Δ.
function fmtDelta(n: number | null): string {
  if (n == null) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * One advisor card in the opportunities feed (§8): type chip, keyword, a
 * one-line "why", a Vol/Pos/KD/Δ metrics row (each null field honestly "—"),
 * an optional upside estimate, and the Track/Dismiss/SERP/Brief action row.
 * Presentational only — a server component with no data fetching of its
 * own; `listOpportunities` rows feed straight into `opp` from the page.
 * A tracked/dismissed opportunity visually mutes (dimmed card + settled
 * action labels, both driven by `opp.status` inside OpportunityActions).
 */
export function OpportunityCard({ opp }: { opp: OpportunityRow }) {
  const isResolved = opp.status === "tracked" || opp.status === "dismissed";

  return (
    <article
      className={`rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 ${
        isResolved ? "opacity-60" : ""
      }`}
    >
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
          TYPE_CHIP_CLASSES[opp.type] ?? NEUTRAL_CHIP
        }`}
      >
        {TYPE_LABELS[opp.type] ?? opp.type}
      </span>

      <h3 className="mt-2 text-base font-semibold text-neutral-900 dark:text-white">{opp.keyword}</h3>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{opp.why}</p>

      <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-500">
        Vol {formatMetric(opp.volume)} · Pos {formatMetric(opp.currentPosition)} · KD {formatMetric(opp.difficulty)} · Δ {fmtDelta(opp.trend)}
      </p>

      {opp.upsideEstimate ? (
        <p className="mt-2 text-sm font-medium text-accent">{opp.upsideEstimate}</p>
      ) : null}

      <div className="mt-4">
        <OpportunityActions id={opp.id} status={opp.status} keyword={opp.keyword} />
      </div>
    </article>
  );
}
