"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RefreshState = "idle" | "busy" | "error";

/**
 * Task 17: the Rankings page's lightweight, single-route refresh trigger —
 * posts only `POST /api/projects/[id]/refresh` (the rank_refresh job that
 * re-fetches SERP position for every tracked keyword), not the whole
 * pipeline. Reach for `RefreshDataButton` instead wherever the WHOLE chain
 * (rankings + gaps + opportunities) is wanted, e.g. the Opportunities page,
 * whose weekly shortlist needs all three. Mirrors refresh-gaps-button.tsx's
 * fetch -> !res.ok/catch -> router.refresh() shape and visual style exactly.
 */
export function RefreshRankingsButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [state, setState] = useState<RefreshState>("idle");

  async function handleClick() {
    setState("busy");
    try {
      const res = await fetch(`/api/projects/${projectId}/refresh`, { method: "POST" });
      if (!res.ok) {
        setState("error");
        return;
      }
      setState("idle");
      router.refresh();
    } catch {
      // Network error (fetch rejected) — same honest error as !res.ok.
      setState("error");
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
        {state === "busy" ? "Refreshing rankings…" : "Refresh rankings"}
      </button>
      {state === "error" ? (
        <span className="text-xs text-at-risk">Couldn&rsquo;t refresh — try again.</span>
      ) : null}
    </div>
  );
}
