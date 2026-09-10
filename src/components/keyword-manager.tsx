"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { keywords } from "@/db/schema";
import { locationLabel } from "@/lib/format";
import { useDemo } from "@/components/demo-provider";

export type KeywordManagerRow = typeof keywords.$inferSelect;

const actionButtonClass =
  "rounded-lg border border-neutral-200 px-3 py-1 font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-default disabled:opacity-50";

// Guardrail (brief): the parser splits on BOTH newlines and commas, trims
// each piece, and drops empties — so a stray blank line or trailing comma
// never turns into a POSTed empty-string keyword.
function parseKeywordInput(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
}

/**
 * Per-row Track/Untrack toggle. Posts the guarded `/api/keywords/[id]/track`
 * route with the flipped `tracked` value, checks `res.ok` explicitly (a
 * failed request surfaces as a small inline error, never a silent no-op),
 * and only calls `router.refresh()` — re-pulling `listTrackedKeywords` on
 * the server — once the mutation is confirmed to have landed.
 */
function TrackToggle({ id, isTracked }: { id: string; isTracked: boolean }) {
  const router = useRouter();
  const demo = useDemo();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleClick() {
    setPending(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/keywords/${id}/track`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tracked: !isTracked }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" onClick={handleClick} disabled={demo || pending} title={demo ? "Read-only demo" : undefined} className={actionButtonClass}>
        {isTracked ? "Untrack" : "Track"}
      </button>
      {failed ? (
        <span className="text-xs text-at-risk">Couldn&rsquo;t update — try again.</span>
      ) : null}
    </div>
  );
}

function KeywordTable({ rows }: { rows: KeywordManagerRow[] }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200">
            <th className="eyebrow px-4 py-2.5">Keyword</th>
            <th className="eyebrow px-4 py-2.5">Location</th>
            <th className="eyebrow px-4 py-2.5">Device</th>
            <th className="eyebrow px-4 py-2.5">Tags</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-testid={`keyword-row-${row.id}`}
              className="border-b border-neutral-200 transition-colors last:border-0 hover:bg-neutral-50"
            >
              <td className="px-4 py-2.5 font-medium text-neutral-900">{row.keyword}</td>
              <td className="px-4 py-2.5">
                <span className="tnum text-xs text-neutral-600">{locationLabel(row.locationCode, row.languageCode)}</span>
              </td>
              <td className="px-4 py-2.5 text-neutral-600 capitalize">{row.device}</td>
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {(row.tags ?? []).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-2.5">
                <TrackToggle id={row.id} isTracked={row.isTracked} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The "Add keywords" control (brief): a textarea the user pastes keywords
 * into, split on newlines and/or commas, trimmed, empties dropped. POSTs the
 * guarded `/api/keywords` route with the project's default location/language
 * on every parsed keyword, checks `res.ok` (inline error on failure, never a
 * silent success), shows a loading state while the request is in flight, and
 * clears the box + refreshes the server-rendered list once it lands.
 */
function AddKeywordsBox({
  projectId,
  defaultLocationCode,
  defaultLanguageCode,
}: {
  projectId: string;
  defaultLocationCode: number;
  defaultLanguageCode: string;
}) {
  const router = useRouter();
  const demo = useDemo();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const parsed = parseKeywordInput(value);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (parsed.length === 0) return;

    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          keywords: parsed.map((keyword) => ({
            keyword,
            locationCode: defaultLocationCode,
            languageCode: defaultLanguageCode,
          })),
        }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setValue("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4"
    >
      <label
        htmlFor="add-keywords-input"
        className="text-xs font-semibold uppercase tracking-wide text-neutral-500"
      >
        Add keywords
      </label>
      <textarea
        id="add-keywords-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="One keyword per line, or comma-separated"
        rows={3}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"
      />
      {failed ? (
        <p className="text-xs text-at-risk">Couldn&rsquo;t add keywords — try again.</p>
      ) : null}
      <button
        type="submit"
        disabled={demo || busy || parsed.length === 0}
        title={demo ? "Read-only demo" : undefined}
        className="self-start rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#2a3138] disabled:cursor-default disabled:opacity-50"
      >
        {busy ? "Adding…" : "Add keywords"}
      </button>
    </form>
  );
}

/**
 * The Keywords view's management surface (Task 6): a table of the tracked
 * keyword set with a per-row Track/Untrack toggle, plus the "Add keywords"
 * box. Renders even when `keywords` is empty — the add box is the point of
 * the page, so an empty tracked set gets a gentle inline note rather than a
 * dead-end EmptyState that would hide the only way to add a first keyword.
 * `defaultLocationCode`/`defaultLanguageCode` come from the current
 * project's row and seed every keyword the add box posts.
 */
export function KeywordManager({
  projectId,
  keywords: rows,
  defaultLocationCode,
  defaultLanguageCode,
}: {
  projectId: string;
  keywords: KeywordManagerRow[];
  defaultLocationCode: number;
  defaultLanguageCode: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500">
          No tracked keywords yet — add some below.
        </p>
      ) : (
        <KeywordTable rows={rows} />
      )}
      <AddKeywordsBox
        projectId={projectId}
        defaultLocationCode={defaultLocationCode}
        defaultLanguageCode={defaultLanguageCode}
      />
    </div>
  );
}
