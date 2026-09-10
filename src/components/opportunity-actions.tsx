"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDemo } from "@/components/demo-provider";

type MutableStatus = "tracked" | "dismissed";

const actionButtonClass =
  "rounded-lg border border-neutral-300 bg-white px-3 py-1 font-medium text-neutral-900 shadow-1 transition-colors hover:bg-neutral-50 disabled:cursor-default disabled:opacity-50";

/**
 * The mutation half of an opportunity card (§8). Track/Dismiss `fetch` the
 * guarded `POST /api/opportunities/[id]/status` route, check `res.ok`
 * explicitly, and only call `router.refresh()` once the mutation is
 * confirmed to have landed — a failed request (`!res.ok`) OR a network
 * throw (fetch rejects) both surface as a small inline error instead of a
 * silent no-op, and skip the refresh. This mirrors every other client
 * mutation in the app (keyword-manager.tsx's TrackToggle,
 * gap-table.tsx's AddToTrackingButton, refresh-gaps-button.tsx) — this is
 * the flagship landing view's primary action, so it follows the same
 * convention rather than being the one exception.
 *
 * SERP is a plain external link to a Google search for the keyword — no
 * fetch, no mutation. (The disabled "Brief" button was retired in Task 18 —
 * content-brief generation is Phase 5, and a permanently-disabled button is a
 * dead affordance, so it's gone rather than greyed-out here.) Once `status` is
 * `tracked` or `dismissed`, both action buttons settle into a muted, disabled
 * label reflecting that state instead of continuing to offer an action that no
 * longer applies.
 */
export function OpportunityActions({
  id,
  status,
  keyword,
}: {
  id: string;
  status: string;
  keyword: string;
}) {
  const router = useRouter();
  const demo = useDemo();
  const [pending, setPending] = useState<MutableStatus | null>(null);
  const [error, setError] = useState(false);

  const isTracked = status === "tracked";
  const isDismissed = status === "dismissed";
  const isSettled = isTracked || isDismissed;

  async function handle(next: MutableStatus) {
    setPending(next);
    setError(false); // clear any previous failure on a new attempt
    try {
      const res = await fetch(`/api/opportunities/${id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        setError(true);
        return; // do NOT refresh on failure
      }
      router.refresh();
    } catch {
      // Network error (fetch rejected) — same honest error as !res.ok.
      setError(true);
    } finally {
      setPending(null);
    }
  }

  const serpUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}`;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => handle("tracked")}
          disabled={demo || isSettled || pending !== null}
          title={demo ? "Read-only demo" : undefined}
          className={
            isTracked
              ? "rounded-lg bg-[--color-accent-tint] px-3 py-1 font-medium text-accent"
              : actionButtonClass
          }
        >
          {isTracked ? "Tracked" : "Track"}
        </button>

        <button
          type="button"
          onClick={() => handle("dismissed")}
          disabled={demo || isSettled || pending !== null}
          title={demo ? "Read-only demo" : undefined}
          className={
            isDismissed
              ? "rounded-lg bg-neutral-200 px-3 py-1 font-medium text-neutral-600"
              : actionButtonClass
          }
        >
          {isDismissed ? "Dismissed" : "Dismiss"}
        </button>

        <a href={serpUrl} target="_blank" rel="noopener" className={actionButtonClass}>
          SERP
        </a>
      </div>

      {error ? (
        <span className="text-xs text-at-risk">Couldn&rsquo;t update — try again.</span>
      ) : null}
    </div>
  );
}
