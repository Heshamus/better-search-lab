"use client";

import { useRefreshAction } from "@/components/use-refresh-action";

// The three on-demand jobs, in the SAME dependency order the weekly cron
// runs them in: gap_refresh's competitor diff and weekly_opportunities'
// scoring (weeklyOpportunitiesHandler -> loadDetectorInput) both read
// rank_snapshots, and weekly_opportunities also reads the gap rows —
// running them out of order would score/diff against stale or missing
// input. Each entry pairs the route segment with the progress label shown
// while that step is in flight.
const STEPS: { path: string; label: string }[] = [
  { path: "refresh", label: "Refreshing rankings…" },
  { path: "gaps/refresh", label: "Finding gaps…" },
  { path: "opportunities/refresh", label: "Scoring opportunities…" },
];

/**
 * Task 17: the full-pipeline "Refresh data" trigger — today rankings and
 * opportunities only populate via the Monday cron, so a user who adds
 * keywords mid-week sees nothing happen until then. This chains all three
 * on-demand routes (`POST /api/projects/[id]/refresh`, `.../gaps/refresh`,
 * `.../opportunities/refresh`) via the shared `useRefreshAction` hook, which
 * posts them SEQUENTIALLY (each later step's job reads data the earlier ones
 * produce), stops at the first `!res.ok`/thrown fetch with an inline error,
 * and only `router.refresh()`s after a full three-for-three success — never a
 * fabricated success. The per-step progress label is the one thing kept
 * local: the hook reports which step is in flight via `stepIndex`, and this
 * component maps that to the STEP copy shown on the button.
 */
export function RefreshDataButton({ projectId }: { projectId: string }) {
  const { state, stepIndex, run } = useRefreshAction(
    STEPS.map((step) => `/api/projects/${projectId}/${step.path}`),
  );

  const stepLabel = state === "busy" && stepIndex != null ? STEPS[stepIndex].label : null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={state === "busy"}
        aria-live="polite"
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
      >
        {stepLabel ?? "Refresh data"}
      </button>
      {/* Always-mounted live region: the AT must already be watching it before
          the error text lands, so its TEXT toggles rather than the element
          mounting with content. */}
      <span role="status" aria-live="polite" className="text-xs text-at-risk">
        {state === "error" ? "Couldn’t refresh — try again." : null}
      </span>
    </div>
  );
}
