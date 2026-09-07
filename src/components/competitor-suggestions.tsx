"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Suggestion { domain: string; intersections: number; avgPosition: number | null }

const buttonClass =
  "rounded-lg border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800/60 disabled:cursor-default disabled:opacity-50";

async function readError(res: Response, fallback: string): Promise<string> {
  try { const j = (await res.json()) as { error?: string }; return j.error || fallback; } catch { return fallback; }
}

/**
 * Suggest competitors from DataForSEO Labs (spec §11.3). Each Add reuses the
 * existing competitor POST, so the cap and dedupe rules stay server-side.
 */
export function CompetitorSuggestions({ projectId, atCap, onAdded }: { projectId: string; atCap: boolean; onAdded?: (domain: string) => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function suggest() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors/suggest`, { method: "POST" });
      if (!res.ok) { setError(await readError(res, "Could not fetch suggestions.")); return; }
      const body = (await res.json()) as { suggestions: Suggestion[] };
      setRows(body.suggestions);
      if (body.suggestions.length === 0) setError("No overlapping domains found for this site yet.");
    } catch { setError("Network error — please try again."); } finally { setBusy(false); }
  }

  async function add(domain: string) {
    setAdding(domain); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain }) });
      if (!res.ok) { setError(await readError(res, "Could not add this competitor.")); return; }
      setRows((prev) => (prev ?? []).filter((r) => r.domain !== domain));
      onAdded?.(domain);
      router.refresh();
    } catch { setError("Network error — please try again."); } finally { setAdding(null); }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void suggest()} disabled={busy} className={buttonClass}>
          {busy ? "Looking up overlapping domains…" : "Suggest competitors"}
        </button>
        <span className="text-[0.7rem] text-neutral-500">One DataForSEO Labs call (≈ $0.01).</span>
      </div>
      {rows && rows.length > 0 ? (
        <ul className="panel divide-y divide-neutral-800/60 px-4">
          {rows.map((r) => (
            <li key={r.domain} data-testid={`suggestion-${r.domain}`} className="flex flex-wrap items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">{r.domain}</span>
              <span className="tnum text-xs text-neutral-500">{r.intersections} shared keywords · avg. position {r.avgPosition === null ? "—" : r.avgPosition.toFixed(1)}</span>
              <button type="button" className={buttonClass} disabled={atCap || adding === r.domain} title={atCap ? "Maximum 5 competitors" : undefined} onClick={() => void add(r.domain)}>
                {adding === r.domain ? "Adding…" : "Add"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p role="alert" className="text-xs text-at-risk">{error}</p> : null}
    </div>
  );
}
