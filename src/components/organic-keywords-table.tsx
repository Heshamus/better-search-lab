"use client";
import { useEffect, useMemo, useState } from "react";
import type { OrganicKeywordRow } from "@/lib/organic-keywords-store";
import { formatCompact } from "@/lib/format";

const BUCKETS: { label: string; max: number | null }[] = [
  { label: "All", max: null }, { label: "Top 3", max: 3 }, { label: "Top 10", max: 10 },
  { label: "Top 20", max: 20 }, { label: "Top 100", max: 100 },
];
type SortKey = "position" | "searchVolume" | "difficulty" | "estTraffic";
const PAGE_SIZE = 100;

function shortPath(url: string | null): string {
  if (!url) return "—";
  try { const u = new URL(url); return u.pathname === "/" ? "/ (home)" : u.pathname; } catch { return url; }
}

// Nulls always sort to the bottom, in EITHER direction — NaN-free by construction.
// The naive `(a ?? Infinity*dir) - (b ?? Infinity*dir)` is undefined behavior for a
// null-vs-null pair (Infinity - Infinity === NaN, which violates Array.sort's
// comparator contract). Mirrors src/components/rankings-table.tsx's compareNullsLast
// — `position` (the default sort key) is nullable end-to-end, so this isn't a rare
// edge case: any domain with 2+ un-ranked keywords hits it on first render.
function compareNullsLast(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir * (a - b);
}

// Real <button> inside the <th> (not `<th onClick>`) so sort is keyboard-operable,
// same pattern as rankings-table.tsx's SortableHeader.
function SortableHeader({
  label, active, dir, onClick,
}: { label: string; active: boolean; dir: 1 | -1; onClick: () => void }) {
  return (
    <th className="px-4 py-2.5">
      <button type="button" onClick={onClick} className="eyebrow flex items-center gap-1 transition-colors hover:text-neutral-200">
        {label}
        {active ? <span aria-hidden className="text-accent">{dir === 1 ? "▲" : "▼"}</span> : null}
      </button>
    </th>
  );
}

export function OrganicKeywordsTable(props: {
  projectId: string; defaultLocationCode: number; defaultLanguageCode: string;
  rows: OrganicKeywordRow[]; capturedAt: Date | null;
}) {
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>("position");
  const [page, setPage] = useState(1);
  const [tracked, setTracked] = useState<Set<string>>(new Set());

  // Optimistic add to the local `tracked` set so the button flips to
  // "Tracked" immediately; reverted only if the POST itself fails (network
  // error or non-2xx via .catch — mirrors the brief's fire-and-forget shape).
  async function track(keyword: string) {
    setTracked((s) => new Set(s).add(keyword));
    await fetch("/api/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: props.projectId,
        keywords: [{ keyword, locationCode: props.defaultLocationCode, languageCode: props.defaultLanguageCode }],
      }),
    }).catch(() => setTracked((s) => { const n = new Set(s); n.delete(keyword); return n; }));
  }

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = props.rows.filter((r) => {
      if (needle && !r.keyword.toLowerCase().includes(needle)) return false;
      if (bucket !== null && !(r.position != null && r.position <= bucket)) return false;
      return true;
    });
    const dir: 1 | -1 = sort === "position" ? 1 : -1; // position asc; everything else desc
    return [...filtered].sort((a, b) => compareNullsLast(a[sort], b[sort], dir));
  }, [props.rows, q, bucket, sort]);

  // A narrower search/bucket, or a fresh `rows` prop landing (a refresh completed),
  // can leave `page` pointing past the new last page — reset to page 1 rather than
  // stranding the user on a blank page. Sort intentionally excluded: it doesn't
  // change the row count, so keeping the current page on re-sort is correct.
  useEffect(() => {
    setPage(1);
  }, [q, bucket, props.rows]);

  const totalPages = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages); // defensive clamp alongside the effect above
  const pageRows = view.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search keywords…"
          className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200"
        />
        <div className="flex gap-1">
          {BUCKETS.map((b) => (
            <button
              key={b.label} type="button" onClick={() => setBucket(b.max)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${bucket === b.max ? "bg-accent/15 text-accent" : "text-neutral-400 hover:text-neutral-200"}`}
            >{b.label}</button>
          ))}
        </div>
      </div>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-800">
              <th className="eyebrow px-4 py-2.5">Keyword</th>
              <SortableHeader label="Pos" active={sort === "position"} dir={1} onClick={() => setSort("position")} />
              <SortableHeader label="Volume" active={sort === "searchVolume"} dir={-1} onClick={() => setSort("searchVolume")} />
              <SortableHeader label="Difficulty" active={sort === "difficulty"} dir={-1} onClick={() => setSort("difficulty")} />
              <th className="eyebrow px-4 py-2.5">Ranking page</th>
              <SortableHeader label="Est. traffic" active={sort === "estTraffic"} dir={-1} onClick={() => setSort("estTraffic")} />
              <th className="eyebrow px-4 py-2.5">Track</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.keyword} data-testid={`keyword-row-${r.keyword}`} className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/20">
                <td className="px-4 py-2.5 font-medium text-white">{r.keyword}</td>
                <td className="px-4 py-2.5 tnum text-neutral-200">{r.position ?? "—"}</td>
                <td className="px-4 py-2.5 tnum text-neutral-300">{r.searchVolume != null ? formatCompact(r.searchVolume) : "—"}</td>
                <td className="px-4 py-2.5 tnum text-neutral-300">{r.difficulty ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="text-neutral-300 hover:text-white" title={r.url}>{shortPath(r.url)}</a> : "—"}
                </td>
                <td className="px-4 py-2.5 tnum text-neutral-300">{r.estTraffic != null ? formatCompact(r.estTraffic) : "—"}</td>
                <td className="px-4 py-2.5">
                  <button type="button" disabled={tracked.has(r.keyword)} onClick={() => void track(r.keyword)}
                    className="rounded-md px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent/10 disabled:text-neutral-500">
                    {tracked.has(r.keyword) ? "Tracked" : "Track"}
                  </button>
                </td>
              </tr>
            ))}
            {view.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-neutral-500">No keywords match.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {view.length > 0 ? (
        <div className="flex items-center justify-between gap-3 px-1 text-xs text-neutral-400">
          <span>{view.length} keyword{view.length === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-3">
            <button
              type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}
              className="rounded-md px-2 py-1 font-medium text-neutral-300 transition-colors hover:text-white disabled:cursor-default disabled:opacity-40 disabled:hover:text-neutral-300"
            >Prev</button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
              className="rounded-md px-2 py-1 font-medium text-neutral-300 transition-colors hover:text-white disabled:cursor-default disabled:opacity-40 disabled:hover:text-neutral-300"
            >Next</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
