"use client";

import { useRefreshAction } from "@/components/use-refresh-action";

/**
 * Task 17: the Rankings page's lightweight, single-route refresh trigger —
 * posts only `POST /api/projects/[id]/refresh` (the rank_refresh job that
 * re-fetches SERP position for every tracked keyword), not the whole
 * pipeline. Reach for `RefreshDataButton` instead wherever the WHOLE chain
 * (rankings + gaps + opportunities) is wanted, e.g. the Opportunities page,
 * whose weekly shortlist needs all three. The fetch -> !res.ok/catch ->
 * router.refresh() flow lives in the shared `useRefreshAction` hook; this
 * component only owns its route, labels, and error copy.
 */
export function RefreshRankingsButton({ projectId }: { projectId: string }) {
  const { state, run } = useRefreshAction([`/api/projects/${projectId}/refresh`]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={state === "busy"}
        aria-live="polite"
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
      >
        {state === "busy" ? "Refreshing rankings…" : "Refresh rankings"}
      </button>
      {state === "error" ? (
        <span aria-live="polite" className="text-xs text-at-risk">Couldn&rsquo;t refresh — try again.</span>
      ) : null}
    </div>
  );
}
