"use client";
import { useMemo, useState } from "react";
import type { OrganicKeywordRow } from "@/lib/organic-keywords-store";
import { formatCompact } from "@/lib/format";

const BUCKETS: { label: string; max: number | null }[] = [
  { label: "All", max: null }, { label: "Top 3", max: 3 }, { label: "Top 10", max: 10 },
  { label: "Top 20", max: 20 }, { label: "Top 100", max: 100 },
];
type SortKey = "position" | "searchVolume" | "difficulty" | "estTraffic";

function shortPath(url: string | null): string {
  if (!url) return "—";
  try { const u = new URL(url); return u.pathname === "/" ? "/ (home)" : u.pathname; } catch { return url; }
}

export function OrganicKeywordsTable(props: {
  projectId: string; defaultLocationCode: number; defaultLanguageCode: string;
  rows: OrganicKeywordRow[]; capturedAt: Date | null;
}) {
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>("position");

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = props.rows.filter((r) => {
      if (needle && !r.keyword.toLowerCase().includes(needle)) return false;
      if (bucket !== null && !(r.position != null && r.position <= bucket)) return false;
      return true;
    });
    const dir = sort === "position" ? 1 : -1; // position asc; everything else desc
    return [...filtered].sort((a, b) => dir * ((a[sort] ?? Infinity * dir) - (b[sort] ?? Infinity * dir)));
  }, [props.rows, q, bucket, sort]);

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
              {(["position", "searchVolume", "difficulty", "estTraffic"] as SortKey[]).map((k) => (
                <th key={k} className="eyebrow cursor-pointer px-4 py-2.5" onClick={() => setSort(k)}>
                  {{ position: "Pos", searchVolume: "Volume", difficulty: "Difficulty", estTraffic: "Est. traffic" }[k]}
                  {sort === k ? " ▾" : ""}
                </th>
              ))}
              <th className="eyebrow px-4 py-2.5">Ranking page</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.keyword} className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/20">
                <td className="px-4 py-2.5 font-medium text-white">{r.keyword}</td>
                <td className="px-4 py-2.5 tnum text-neutral-200">{r.position ?? "—"}</td>
                <td className="px-4 py-2.5 tnum text-neutral-300">{r.searchVolume != null ? formatCompact(r.searchVolume) : "—"}</td>
                <td className="px-4 py-2.5 tnum text-neutral-300">{r.difficulty ?? "—"}</td>
                <td className="px-4 py-2.5 tnum text-neutral-300">{r.estTraffic != null ? formatCompact(r.estTraffic) : "—"}</td>
                <td className="px-4 py-2.5">
                  {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="text-neutral-300 hover:text-white" title={r.url}>{shortPath(r.url)}</a> : "—"}
                </td>
              </tr>
            ))}
            {view.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-neutral-500">No keywords match.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
