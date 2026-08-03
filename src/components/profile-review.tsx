"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProfileCandidateRow } from "@/lib/profile";

type AddState = "idle" | "busy" | "error";
type ReprofileState = "idle" | "busy" | "error";

// Honesty rule (mirrors research-explorer.tsx/rankings-table.tsx): a null
// metric renders "—", never a fabricated 0.
function fmt(n: number | null): string {
  return n == null ? "—" : `${n}`;
}

const addButtonClass =
  "rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50";

const reprofileButtonClass =
  "rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-default disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800";

const emptyStateClass =
  "rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400";

/**
 * Task 6: the confirm/edit screen that turns auto-profile candidates
 * (crawl/ranking/expansion-sourced keyword suggestions the T4 profiling job
 * writes to `profile_candidates`, read back via `listProfileCandidates`)
 * into tracked keywords. Mirrors research-explorer.tsx's checkbox-table +
 * "Add selected to tracking" flow, but the table is always fully populated
 * up front from server-fetched `candidates` rather than a live search, so
 * row selection seeds from each row's own `selected` flag instead of
 * starting empty.
 *
 * Two independent mutations, each with its own busy/error state so one
 * in-flight action never blocks or gets confused with the other:
 *  - "Add selected to tracking" -> POST /api/keywords with the same body
 *    shape as research-explorer.tsx / keyword-manager.tsx
 *    (`{ projectId, keywords: [{ keyword, locationCode, languageCode }] }`)
 *    -> router.refresh().
 *  - "Re-profile" -> POST /api/projects/[id]/profile (no body; the Task 4
 *    route re-runs the crawl+rankings job and rewrites profile_candidates)
 *    -> router.refresh() so the server re-reads the fresh candidate set.
 *
 * Honesty guardrail (brief): a failed (!res.ok) or network-erroring request
 * on either action shows an inline text-at-risk error, never a fabricated
 * success.
 */
export function ProfileReview({
  projectId,
  candidates,
  locationCode,
  languageCode,
}: {
  projectId: string;
  candidates: ProfileCandidateRow[];
  locationCode: number;
  languageCode: number | string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.filter((c) => c.selected).map((c) => c.id)),
  );
  const [addState, setAddState] = useState<AddState>("idle");
  const [reprofileState, setReprofileState] = useState<ReprofileState>("idle");

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddSelected() {
    const chosen = candidates.filter((c) => selected.has(c.id));
    if (chosen.length === 0 || addState === "busy") return;

    setAddState("busy");
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          keywords: chosen.map((c) => ({ keyword: c.keyword, locationCode, languageCode })),
        }),
      });
      if (!res.ok) {
        setAddState("error");
        return;
      }
      setAddState("idle");
      router.refresh();
    } catch {
      // Network error (fetch rejected) — same honest error as !res.ok.
      setAddState("error");
    }
  }

  async function handleReprofile() {
    if (reprofileState === "busy") return;

    setReprofileState("busy");
    try {
      const res = await fetch(`/api/projects/${projectId}/profile`, { method: "POST" });
      if (!res.ok) {
        setReprofileState("error");
        return;
      }
      setReprofileState("idle");
      router.refresh();
    } catch {
      setReprofileState("error");
    }
  }

  if (candidates.length === 0) {
    return <p className={emptyStateClass}>No candidates yet — run Profile site.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              <th className="px-4 py-2" />
              <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Keyword
              </th>
              <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Source
              </th>
              <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Volume
              </th>
              <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                KD
              </th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr
                key={c.id}
                data-testid={`candidate-row-${c.id}`}
                className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60"
              >
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${c.keyword}`}
                    checked={selected.has(c.id)}
                    onChange={() => toggleRow(c.id)}
                  />
                </td>
                <td className="px-4 py-2 font-medium text-neutral-900 dark:text-white">{c.keyword}</td>
                <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{c.source}</td>
                <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{fmt(c.volume)}</td>
                <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{fmt(c.difficulty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={handleAddSelected}
            disabled={selected.size === 0 || addState === "busy"}
            className={addButtonClass}
          >
            {addState === "busy" ? "Adding…" : "Add selected to tracking"}
          </button>
          {addState === "error" ? (
            <span className="text-xs text-at-risk">Couldn&rsquo;t add keywords — try again.</span>
          ) : null}
        </div>

        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={handleReprofile}
            disabled={reprofileState === "busy"}
            className={reprofileButtonClass}
          >
            {reprofileState === "busy" ? "Re-profiling…" : "Re-profile"}
          </button>
          {reprofileState === "error" ? (
            <span className="text-xs text-at-risk">Couldn&rsquo;t re-profile — try again.</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
