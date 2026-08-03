"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export interface ResearchIdea {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  difficulty: number | null;
}

// Search state is a discriminated union rather than a handful of booleans so
// "loading", "error", and "zero results" can never be true simultaneously —
// the brief requires these to read as three distinct, mutually-exclusive
// states (plus the initial "idle" prompt before any search has run).
type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "results"; items: ResearchIdea[] };

type AddState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "error" }
  | { status: "done"; count: number };

// Honesty rule (mirrors rankings-table.tsx/opportunity-card.tsx): a null
// metric renders "—", never a fabricated 0.
function fmt(n: number | null): string {
  return n == null ? "—" : `${n}`;
}

function fmtCpc(n: number | null): string {
  return n == null ? "—" : `$${n.toFixed(2)}`;
}

const primaryButtonClass =
  "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50";

const promptBoxClass =
  "rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400";

/**
 * The Research view's seed -> keyword-ideas explorer (Task 7). Client
 * component: a seed search calls the guarded `POST /api/research` and
 * renders whatever it returns; a multi-select of the results can be added
 * to tracking via the guarded `POST /api/keywords`, after which the
 * server-rendered parts of the shell are refreshed. Unlike Tasks 4-6, there
 * is no server-fetched data to seed this component with — research is
 * live-on-demand, so `projectId`/`locationCode`/`languageCode` are the only
 * inputs, all sourced from the current project's row. `projectId` also
 * rides along in the `/api/research` body so the server can record the
 * search to that project's history (Task 16); this component itself stays
 * stateless across navigations — surfacing that history as Recents is
 * Task 18, not here.
 *
 * Honesty guardrail (brief): a failed or network-erroring `/api/research`
 * call NEVER renders fabricated ideas — it clears any prior results and
 * shows an inline amber error instead.
 */
export function ResearchExplorer({
  projectId,
  locationCode,
  languageCode,
}: {
  projectId: string;
  locationCode: number;
  languageCode: string;
}) {
  const router = useRouter();
  const [seed, setSeed] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addState, setAddState] = useState<AddState>({ status: "idle" });

  const items = search.status === "results" ? search.items : [];

  async function handleResearch(event: FormEvent) {
    event.preventDefault();
    const trimmed = seed.trim();
    if (!trimmed || search.status === "loading") return;

    setSearch({ status: "loading" });
    setSelected(new Set());
    setAddState({ status: "idle" });

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, keywords: [trimmed], locationCode, languageCode }),
      });
      if (!res.ok) {
        setSearch({ status: "error" });
        return;
      }
      const data = await res.json();
      setSearch({ status: "results", items: (data.items ?? []) as ResearchIdea[] });
    } catch {
      // Network error (fetch rejected) — same honest amber error as !res.ok,
      // never fabricated ideas.
      setSearch({ status: "error" });
    }
  }

  function toggleRow(keyword: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  }

  async function handleAddSelected() {
    if (selected.size === 0 || addState.status === "busy") return;
    const chosen = items.filter((item) => selected.has(item.keyword));

    setAddState({ status: "busy" });
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          keywords: chosen.map((item) => ({ keyword: item.keyword, locationCode, languageCode })),
        }),
      });
      if (!res.ok) {
        setAddState({ status: "error" });
        return;
      }
      setAddState({ status: "done", count: chosen.length });
      setSelected(new Set());
      router.refresh();
    } catch {
      setAddState({ status: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleResearch}
        className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1">
          <label
            htmlFor="research-seed"
            className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
            Seed keyword
          </label>
          <input
            id="research-seed"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            placeholder="e.g. best crm software"
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-accent dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
          />
        </div>
        <button
          type="submit"
          disabled={search.status === "loading" || seed.trim().length === 0}
          className={primaryButtonClass}
        >
          {search.status === "loading" ? "Researching…" : "Research"}
        </button>
      </form>

      {search.status === "idle" ? (
        <p className={promptBoxClass}>Enter a seed keyword to explore ideas, volume, and difficulty.</p>
      ) : null}

      {search.status === "loading" ? (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
          Researching…
        </p>
      ) : null}

      {search.status === "error" ? (
        <p className="rounded-xl border border-at-risk/40 bg-at-risk/10 px-4 py-3 text-sm text-at-risk">
          Couldn&rsquo;t fetch keyword ideas — try again.
        </p>
      ) : null}

      {search.status === "results" && search.items.length === 0 ? (
        <p className={promptBoxClass}>No ideas found for that seed.</p>
      ) : null}

      {search.status === "results" && search.items.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th className="px-4 py-2" />
                  <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Keyword
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Volume
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    KD
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    CPC
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Competition
                  </th>
                </tr>
              </thead>
              <tbody>
                {search.items.map((item) => (
                  <tr
                    key={item.keyword}
                    data-testid={`idea-row-${item.keyword}`}
                    className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60"
                  >
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.keyword}`}
                        checked={selected.has(item.keyword)}
                        onChange={() => toggleRow(item.keyword)}
                      />
                    </td>
                    <td className="px-4 py-2 font-medium text-neutral-900 dark:text-white">{item.keyword}</td>
                    <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{fmt(item.searchVolume)}</td>
                    <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{fmt(item.difficulty)}</td>
                    <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{fmtCpc(item.cpc)}</td>
                    <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{fmt(item.competition)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={handleAddSelected}
              disabled={selected.size === 0 || addState.status === "busy"}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
            >
              {addState.status === "busy" ? "Adding…" : "Add selected to tracking"}
            </button>
            {addState.status === "error" ? (
              <p className="text-xs text-at-risk">Couldn&rsquo;t add keywords — try again.</p>
            ) : null}
            {addState.status === "done" ? (
              <p className="text-xs text-accent">
                Added {addState.count} keyword{addState.count === 1 ? "" : "s"}.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
