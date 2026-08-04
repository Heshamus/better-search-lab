"use client";

import { useRefreshAction } from "@/components/use-refresh-action";

/**
 * The Competitors view's "Find keyword gaps" control (Task 8, relabeled
 * Task 14 for legibility — the action finds new gap rows, it does not
 * merely "refresh" an existing table). Posts the guarded
 * `POST /api/projects/[id]/gaps/refresh` route (runs the gap_refresh job,
 * re-collecting keyword-gap rows from DataForSEO for every tracked
 * competitor on this project); once it lands, the shared `useRefreshAction`
 * hook `router.refresh()`s so the server-rendered GapTable re-reads
 * `listGapSignals` with the fresh rows. A failed request surfaces as a small
 * inline error, never a silent no-op.
 */
export function RefreshGapsButton({ projectId }: { projectId: string }) {
  const { state, run } = useRefreshAction([`/api/projects/${projectId}/gaps/refresh`]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={state === "busy"}
        aria-live="polite"
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
      >
        {state === "busy" ? "Finding gaps…" : "Find keyword gaps"}
      </button>
      {/* Always-mounted live region: text toggles, element stays in the DOM so
          the AT is already watching it when the error lands. */}
      <span role="status" aria-live="polite" className="text-xs text-at-risk">
        {state === "error" ? "Couldn’t find gaps — try again." : null}
      </span>
    </div>
  );
}
