"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Step 8 (spec §11.1): record the first completion (admin-only; a member's refusal is fine) and open the app. */
export function DoneStep({ projectName }: { projectName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try { await fetch("/api/setup/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ completed: true }) }); }
    catch { /* completion is a convenience flag; opening the app must never depend on it */ }
    router.push("/overview");
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-base font-semibold text-white">{projectName} is set up</h1>
      <p className="text-sm text-neutral-400">The overview shows what to do next. Refresh runs on the schedule in Settings → Project; every integration can be added later under Settings → Integrations.</p>
      <button type="button" disabled={busy} onClick={() => void open()} className="self-start rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50">Open Overview</button>
    </div>
  );
}
