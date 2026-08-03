"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type MutableStatus = "tracked" | "dismissed";

async function postStatus(id: string, status: MutableStatus): Promise<void> {
  await fetch(`/api/opportunities/${id}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

const actionButtonClass =
  "rounded-lg border border-neutral-200 px-3 py-1 font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-default disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800";

/**
 * The mutation half of an opportunity card (§8). Track/Dismiss `fetch` the
 * guarded `POST /api/opportunities/[id]/status` route, then `router.refresh()`
 * so the server-rendered list re-fetches with the new status — this
 * component itself never re-reads `/lib` data, matching the read/mutation
 * split (server components read, client components mutate-then-refresh).
 *
 * SERP is a plain external link to a Google search for the keyword — no
 * fetch, no mutation. Brief is visibly disabled pending Phase 5 (deferred,
 * per the plan). Once `status` is `tracked` or `dismissed`, both action
 * buttons settle into a muted, disabled label reflecting that state instead
 * of continuing to offer an action that no longer applies.
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
  const [pending, setPending] = useState<MutableStatus | null>(null);

  const isTracked = status === "tracked";
  const isDismissed = status === "dismissed";
  const isSettled = isTracked || isDismissed;

  async function handle(next: MutableStatus) {
    setPending(next);
    try {
      await postStatus(id, next);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const serpUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}`;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        onClick={() => handle("tracked")}
        disabled={isSettled || pending !== null}
        className={
          isTracked
            ? "rounded-lg bg-accent/20 px-3 py-1 font-medium text-accent"
            : actionButtonClass
        }
      >
        {isTracked ? "Tracked" : "Track"}
      </button>

      <button
        type="button"
        onClick={() => handle("dismissed")}
        disabled={isSettled || pending !== null}
        className={
          isDismissed
            ? "rounded-lg bg-neutral-200 px-3 py-1 font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
            : actionButtonClass
        }
      >
        {isDismissed ? "Dismissed" : "Dismiss"}
      </button>

      <a href={serpUrl} target="_blank" rel="noopener" className={actionButtonClass}>
        SERP
      </a>

      <button type="button" disabled title="Coming in Phase 5" className={actionButtonClass}>
        Brief
      </button>
    </div>
  );
}
