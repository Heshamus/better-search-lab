"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RefreshState = "idle" | "busy" | "error";

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
 * on-demand routes (`POST /api/projects/[id]/refresh`,
 * `.../gaps/refresh`, `.../opportunities/refresh`) sequentially — never in
 * parallel, since each later step's job reads data the earlier ones
 * produce — showing a small per-step progress label on the button itself.
 *
 * Honesty rule (mirrors refresh-gaps-button.tsx / competitor-intel-panel.tsx
 * / opportunity-actions.tsx): the chain stops at the FIRST `!res.ok` or
 * thrown fetch and shows an inline text-at-risk error — never a silent or
 * fabricated success. Only a full three-for-three success calls
 * `router.refresh()`, so the server-rendered rankings/gaps/opportunities
 * views re-read fresh rows.
 */
export function RefreshDataButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [state, setState] = useState<RefreshState>("idle");
  const [stepLabel, setStepLabel] = useState<string | null>(null);

  async function handleClick() {
    setState("busy");
    try {
      for (const step of STEPS) {
        setStepLabel(step.label);
        const res = await fetch(`/api/projects/${projectId}/${step.path}`, { method: "POST" });
        if (!res.ok) {
          setState("error");
          setStepLabel(null);
          return;
        }
      }
      setState("idle");
      setStepLabel(null);
      router.refresh();
    } catch {
      // Network error (fetch rejected) — same honest error as !res.ok.
      setState("error");
      setStepLabel(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "busy"}
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
      >
        {state === "busy" && stepLabel ? stepLabel : "Refresh data"}
      </button>
      {state === "error" ? (
        <span className="text-xs text-at-risk">Couldn&rsquo;t refresh — try again.</span>
      ) : null}
    </div>
  );
}
