"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CompetitorManager, type Competitor } from "@/components/competitor-manager";

const primary = "rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50";
const secondary = "rounded-lg border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800/60 disabled:opacity-50";

/** Step 6 (spec §11.1): the existing manager (with Suggest) plus Continue / Skip. */
export function CompetitorsStep({ projectId, competitors }: { projectId: string; competitors: Competitor[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record(state: "done" | "skipped") {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/onboarding`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ competitors: state }) });
      if (!res.ok) { setError("Could not save the step."); return; }
      router.refresh();
    } catch { setError("Network error — please try again."); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold text-white">Competitors</h1>
        <p className="mt-1 text-sm text-neutral-400">Up to five domains you compete with in search. Suggest finds the ones that already overlap with your rankings.</p>
      </div>
      <CompetitorManager projectId={projectId} competitors={competitors} />
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" className={primary} disabled={busy} onClick={() => void record("done")}>Continue</button>
        <button type="button" className={secondary} disabled={busy} onClick={() => void record("skipped")}>Skip for now</button>
      </div>
    </div>
  );
}
