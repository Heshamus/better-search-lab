"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One-time admin-only guidance card, mounted by AppShell while
 * `update.firstRunPending` is true (see readUpdateState) and hidden for
 * good once dismissed. Mirrors update-banner.tsx's dismiss-then-refresh
 * pattern, but PATCHes `dismissFirstRun` instead of a version string.
 */
export function FirstRunCard() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function dismiss() {
    setBusy(true);
    await fetch("/api/settings/updates", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dismissFirstRun: true }),
    });
    router.refresh();
  }

  return (
    <div role="note" className="panel mb-5 flex flex-wrap items-start justify-between gap-3 px-5 py-4">
      <div className="flex flex-col gap-1.5 text-sm text-neutral-800">
        <p>
          Your app restarts automatically as long as Docker starts — see{" "}
          <a href="/settings/running" className="text-neutral-900 underline underline-offset-2">
            Running &amp; updates
          </a>{" "}
          for the Docker-Desktop-on-login step.
        </p>
        <p>Update notifications are on; turn them off in Running &amp; updates.</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={dismiss}
        className="shrink-0 rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
      >
        Dismiss
      </button>
    </div>
  );
}
