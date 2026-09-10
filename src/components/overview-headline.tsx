import { formatCompact } from "@/lib/format";

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3.5">
      <span className="eyebrow">{label}</span>
      <span className="num text-[1.55rem] font-semibold leading-none tracking-tight text-neutral-900">{value}</span>
      <span className="text-[0.7rem] text-neutral-500">{hint}</span>
    </div>
  );
}

export interface OverviewHeadlineProps {
  gsc: { clicks: number; impressions: number; position: number | null } | null;
  ga: { sessions: number; engagementRate: number; conversions: number } | null;
}

/** The "how am I doing" strip: real Search Console + Analytics headline numbers. */
export function OverviewHeadline({ gsc, ga }: OverviewHeadlineProps) {
  return (
    <dl className="panel grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-0 lg:divide-x lg:divide-neutral-200">
      <Tile label="Clicks" value={gsc ? formatCompact(gsc.clicks) : "—"} hint="search · 90d" />
      <Tile label="Impressions" value={gsc ? formatCompact(gsc.impressions) : "—"} hint="search · 90d" />
      <Tile label="Avg position" value={gsc?.position != null ? gsc.position.toFixed(1) : "—"} hint="search" />
      <Tile label="Sessions" value={ga ? formatCompact(ga.sessions) : "—"} hint="analytics · 90d" />
      <Tile label="Engagement" value={ga ? `${(ga.engagementRate * 100).toFixed(0)}%` : "—"} hint="analytics" />
      <Tile label="Conversions" value={ga ? formatCompact(ga.conversions) : "—"} hint="analytics · 90d" />
    </dl>
  );
}
