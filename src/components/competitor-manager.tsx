"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CompetitorSuggestions } from "@/components/competitor-suggestions";
import { useDemo } from "@/components/demo-provider";

export type Competitor = { id: string; domain: string };

// Mirrors MAX_COMPETITORS in src/lib/competitors.ts. Not imported directly —
// every other client component in this repo takes only `import type` from
// server-side src/lib modules (see keyword-manager.tsx's `import type {
// keywords } from "@/db/schema"`) to keep DB-touching code out of the client
// bundle, and MAX_COMPETITORS is a value, not a type. The server is the
// actual authority: addCompetitor throws CompetitorCapError -> 409 regardless
// of what this constant says, so a drift here is a UX-copy bug, not a cap
// bypass.
const MAX_COMPETITORS = 5;

const CAP_MESSAGE = `Maximum ${MAX_COMPETITORS} competitors`;
const ADD_FAILURE_MESSAGE = "Couldn’t add competitor — try again.";
const DELETE_FAILURE_MESSAGE = "Couldn’t delete — try again.";

const deleteButtonClass =
  "rounded-lg border border-neutral-200 px-3 py-1 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-default disabled:opacity-50";

/**
 * One tracked-competitor row: domain + a Delete button. Mirrors
 * keyword-manager.tsx's TrackToggle — owns its own pending/failed state so
 * one row's in-flight delete never blocks or gets confused with another
 * row's, and a failed DELETE surfaces as a small inline error rather than a
 * silent no-op. DELETEs the project-scoped
 * `/api/projects/[projectId]/competitors` route with `{ competitorId }` and
 * only `router.refresh()`s once the mutation is confirmed to have landed.
 */
function CompetitorRow({ projectId, id, domain }: { projectId: string; id: string; domain: string }) {
  const router = useRouter();
  const demo = useDemo();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleDelete() {
    setPending(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitorId: id }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      router.refresh();
    } catch {
      // Network error (fetch rejected) — same honest error as !res.ok.
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      data-testid={`competitor-row-${id}`}
      className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-2 last:border-0"
    >
      <span className="font-medium text-neutral-900">{domain}</span>
      <div className="flex flex-col items-end gap-1">
        <button type="button" onClick={handleDelete} disabled={demo || pending} title={demo ? "Read-only demo" : undefined} className={deleteButtonClass}>
          {pending ? "Deleting…" : "Delete"}
        </button>
        {failed ? <span className="text-xs text-at-risk">{DELETE_FAILURE_MESSAGE}</span> : null}
      </div>
    </div>
  );
}

/**
 * The Competitors view's management surface (Task 9): discrete add/delete
 * rows with a hard cap of 5. The cap is enforced server-side
 * (`addCompetitor` -> `CompetitorCapError` -> 409, see
 * src/app/api/projects/[id]/competitors/route.ts) — this component mirrors
 * it for UX (disabling the add input at 5/5 with an inline note) but also
 * handles the 409 explicitly, so a client that's briefly out of sync with
 * the server (e.g. another tab just added the 5th competitor) still gets
 * the same honest "Maximum 5 competitors" message instead of a generic
 * failure. A non-cap failure (network error or any other non-2xx) shows a
 * distinct generic error — never a fabricated success and never mislabeled
 * as the cap.
 */
export function CompetitorManager({ projectId, competitors }: { projectId: string; competitors: Competitor[] }) {
  const router = useRouter();
  const demo = useDemo();
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atCap = competitors.length >= MAX_COMPETITORS;
  const showCapMessage = atCap || error === CAP_MESSAGE;

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = domain.trim();
    if (!trimmed || busy || atCap) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: trimmed }),
      });
      if (res.status === 409) {
        setError(CAP_MESSAGE);
        return;
      }
      if (!res.ok) {
        setError(ADD_FAILURE_MESSAGE);
        return;
      }
      setDomain("");
      router.refresh();
    } catch {
      // Network error (fetch rejected) — same honest error as !res.ok.
      setError(ADD_FAILURE_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {competitors.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500">
          No competitors yet — add one below.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {competitors.map((c) => (
            <CompetitorRow key={c.id} projectId={projectId} id={c.id} domain={c.domain} />
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Visually-hidden label: the placeholder alone isn't an accessible
              name, so a screen reader had nothing to announce for this input.
              sr-only keeps the visual layout unchanged. Mirrors the labelled
              add box in keyword-manager.tsx. */}
          <label htmlFor="competitor-domain-input" className="sr-only">
            Competitor domain
          </label>
          <input
            id="competitor-domain-input"
            type="text"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="Competitor domain"
            disabled={demo || atCap}
            className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-400 disabled:cursor-default disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={demo || atCap || busy || domain.trim().length === 0}
            title={demo ? "Read-only demo" : undefined}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#2a3138] disabled:cursor-default disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
        {showCapMessage ? (
          <p className="text-xs text-at-risk">{CAP_MESSAGE}</p>
        ) : error ? (
          <p className="text-xs text-at-risk">{error}</p>
        ) : null}
      </form>

      <CompetitorSuggestions projectId={projectId} atCap={atCap} />
    </div>
  );
}
