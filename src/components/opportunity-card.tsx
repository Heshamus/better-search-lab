import type { opportunities } from "@/db/schema";
import { OpportunityActions } from "@/components/opportunity-actions";
import { KdMeter, PositionBadge, VolumeBar, Delta } from "@/components/viz";

export type OpportunityRow = typeof opportunities.$inferSelect;

// Label + tone per OpportunityType: striking distance / gap / momentum are
// forward-leaning moves (accent); decay means losing ground (at-risk amber); the
// structural types (SERP feature, duplicate URLs) stay neutral.
const TYPE_META: Record<string, { label: string; tone: "good" | "risk" | "neutral" }> = {
  striking_distance: { label: "Striking distance", tone: "good" },
  gap: { label: "Gap", tone: "good" },
  momentum: { label: "Rising", tone: "good" },
  decay: { label: "At-risk", tone: "risk" },
  serp_feature: { label: "SERP feature", tone: "neutral" },
  cannibalization: { label: "Cannibalization", tone: "neutral" },
};

const CHIP: Record<string, string> = {
  good: "bg-accent/12 text-accent",
  risk: "bg-at-risk/15 text-at-risk",
  neutral: "bg-neutral-800 text-neutral-300",
};

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow text-[0.6rem]">{label}</span>
      <span className="flex h-5 items-center">{children}</span>
    </div>
  );
}

/**
 * One advisor card in the opportunities feed: type chip + the projected-traffic
 * headline, the keyword, a one-line "why", then a four-metric row that shows —
 * not just tells — volume (bar), position (tier badge), difficulty (heat meter),
 * and trend (signed arrow), and the Track/Dismiss/SERP action row. Presentational
 * server component; a tracked/dismissed card mutes via `opp.status`.
 */
export function OpportunityCard({ opp, maxVolume = 0 }: { opp: OpportunityRow; maxVolume?: number }) {
  const isResolved = opp.status === "tracked" || opp.status === "dismissed";
  const meta = TYPE_META[opp.type] ?? { label: opp.type, tone: "neutral" as const };

  return (
    <article className={`panel flex flex-col p-4 transition-colors hover:border-neutral-700 ${isResolved ? "opacity-55" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${CHIP[meta.tone]}`}>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {meta.label}
        </span>
        {opp.upsideEstimate ? (
          <span className="tnum shrink-0 text-xs font-semibold text-accent" title="Projected monthly organic traffic">
            {opp.upsideEstimate}
          </span>
        ) : null}
      </div>

      <h3 className="mt-2.5 text-[0.95rem] font-semibold text-white">{opp.keyword}</h3>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-neutral-400">{opp.why}</p>

      <div className="mt-4 grid grid-cols-4 gap-3 border-t border-neutral-800/70 pt-3.5">
        <Cell label="Volume"><VolumeBar value={opp.volume} max={maxVolume || (opp.volume ?? 1)} /></Cell>
        <Cell label="Position"><PositionBadge pos={opp.currentPosition} /></Cell>
        <Cell label="Difficulty"><KdMeter kd={opp.difficulty} /></Cell>
        <Cell label="Trend"><Delta value={opp.trend} /></Cell>
      </div>

      <div className="mt-4">
        <OpportunityActions id={opp.id} status={opp.status} keyword={opp.keyword} />
      </div>
    </article>
  );
}
