"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RefreshState = "idle" | "busy" | "error";

/**
 * The Competitors view's "Refresh gaps" control (Task 8). Posts the guarded
 * `POST /api/projects/[id]/gaps/refresh` route (runs the gap_refresh job,
 * re-collecting keyword-gap rows from DataForSEO for every tracked
 * competitor on this project), checks `res.ok` explicitly (a failed request
 * surfaces as a small inline error, never a silent no-op), then
 * `router.refresh()`s so the server-rendered GapTable re-reads
 * `listGapSignals` with the fresh rows — mirrors keyword-manager.tsx's
 * TrackToggle / opportunity-actions.tsx's Track button.
 */
export function RefreshGapsButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [state, setState] = useState<RefreshState>("idle");

  async function handleClick() {
    setState("busy");
    try {
      const res = await fetch(`/api/projects/${projectId}/gaps/refresh`, { method: "POST" });
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
        {state === "busy" ? "Refreshing…" : "Refresh gaps"}
      </button>
      {state === "error" ? (
        <span className="text-xs text-at-risk">Couldn&rsquo;t refresh gaps — try again.</span>
      ) : null}
    </div>
  );
}
