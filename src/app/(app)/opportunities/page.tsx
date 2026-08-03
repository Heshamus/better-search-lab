import { HealthStrip, type Metric } from "@/components/health-strip";
import { EmptyState } from "@/components/empty-state";

// Zeroed placeholders (spec §8) — Phase 0 has no rank/traffic/cost pipeline
// yet, so every tile is honestly "no data" rather than a fabricated number.
const METRICS: Metric[] = [
  { label: "Visibility", value: "—" },
  { label: "Est. traffic", value: "—" },
  { label: "Avg position", value: "—" },
  { label: "Keywords", value: "—" },
  { label: "Spend this month", value: "—" },
];

export default function OpportunitiesPage() {
  return (
    <div className="flex flex-col gap-6">
      <HealthStrip metrics={METRICS} />
      <EmptyState
        title="This week's opportunities"
        description="No opportunities yet — add a project and keywords to get started."
      />
    </div>
  );
}
