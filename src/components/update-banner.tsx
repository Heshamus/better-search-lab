"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const UPGRADE_COMMAND = "cd better-search-lab && docker compose pull && docker compose up -d";

/**
 * Quiet admin-only chip, mounted by AppShell when a newer release is known
 * and not yet dismissed (see readUpdateState). Dismissing PATCHes the
 * dismissed version through Task 5's route and refreshes the server layout,
 * which recomputes update state and stops rendering this banner.
 */
export function UpdateBanner({ current, latest, url }: { current: string; latest: string; url: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function dismiss() {
    setBusy(true);
    await fetch("/api/settings/updates", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dismissVersion: latest }),
    });
    router.refresh();
  }

  return (
    <div
      role="note"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-neutral-200 bg-neutral-50 px-7 py-2 text-xs text-neutral-700"
    >
      <span className="font-medium text-neutral-900">Better Search Lab v{latest} is available</span>
      <span className="text-neutral-500">(you&apos;re on v{current})</span>
      <code className="rounded bg-white px-1.5 py-0.5 font-mono text-neutral-800 ring-1 ring-neutral-200">{UPGRADE_COMMAND}</code>
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(UPGRADE_COMMAND)}
        className="text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
      >
        Copy
      </button>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-neutral-900 underline underline-offset-2">
          Release notes →
        </a>
      ) : null}
      <button type="button" disabled={busy} onClick={dismiss} className="ml-auto text-neutral-500 hover:text-neutral-800">
        Dismiss
      </button>
    </div>
  );
}
