import type { BacklinkRow } from "@/lib/backlinks-store";
import { Donut, HBars } from "@/components/charts";
import { formatCompact } from "@/lib/format";

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel flex flex-col gap-1.5 px-4 py-3.5">
      <span className="eyebrow">{label}</span>
      <span className="num text-[1.7rem] font-semibold leading-none tracking-tight text-white">{value}</span>
      <span className="text-[0.7rem] text-neutral-500">{hint}</span>
    </div>
  );
}

/** Domain rank 0–1000 → a coloured badge (green strong, amber mid, muted low). */
function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) return <span className="tnum text-xs text-neutral-600">—</span>;
  const cls = rank >= 400 ? "bg-up/15 text-up" : rank >= 150 ? "bg-accent/15 text-accent" : "bg-neutral-800/70 text-neutral-400";
  return <span className={`tnum rounded-md px-1.5 py-0.5 text-xs font-medium ${cls}`}>{rank}</span>;
}

export function BacklinksReport({ data }: { data: BacklinkRow }) {
  const s = data.summary;
  if (!s) {
    return <p className="panel px-6 py-16 text-center text-sm text-neutral-400">No backlink data returned for this domain.</p>;
  }
  const dofollowPct = s.backlinks > 0 ? Math.round((s.dofollow / s.backlinks) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Domain rank" value={s.rank != null ? String(s.rank) : "—"} hint="0–1000 authority" />
        <Tile label="Backlinks" value={formatCompact(s.backlinks)} hint="total links" />
        <Tile label="Referring domains" value={formatCompact(s.referringDomains)} hint="unique domains" />
        <Tile label="Dofollow" value={`${dofollowPct}%`} hint="of all backlinks" />
        <Tile label="Spam score" value={s.spamScore != null ? `${s.spamScore}%` : "—"} hint="lower is safer" />
      </dl>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel flex flex-col gap-4 p-5">
          <h3 className="text-sm font-semibold text-white">Link type</h3>
          <Donut
            segments={[
              { label: "Dofollow", value: s.dofollow, color: "var(--color-up)" },
              { label: "Nofollow", value: s.nofollow, color: "var(--color-neutral-600)" },
            ]}
            centerLabel="backlinks"
          />
        </div>

        <div className="panel flex flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Referring domains by TLD</h3>
            <span className="eyebrow">top {s.tldDistribution.length}</span>
          </div>
          <HBars
            items={s.tldDistribution.map((t) => ({ label: `.${t.tld}`, value: t.count }))}
            color="var(--color-series-2)"
            emptyLabel="No TLD data"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="eyebrow px-4 py-2.5">Referring domain</th>
                <th className="eyebrow px-4 py-2.5">Backlinks</th>
                <th className="eyebrow px-4 py-2.5">DR</th>
                <th className="eyebrow px-4 py-2.5">Spam</th>
              </tr>
            </thead>
            <tbody>
              {data.referringDomains.slice(0, 25).map((d) => (
                <tr key={d.domain} className="border-b border-neutral-800/50 transition-colors last:border-0 hover:bg-neutral-800/20">
                  <td className="px-4 py-2.5 font-medium text-white">{d.domain}</td>
                  <td className="px-4 py-2.5"><span className="tnum text-neutral-200">{formatCompact(d.backlinks)}</span></td>
                  <td className="px-4 py-2.5"><RankBadge rank={d.rank} /></td>
                  <td className="px-4 py-2.5"><span className="tnum text-neutral-400">{d.spamScore != null ? `${d.spamScore}%` : "—"}</span></td>
                </tr>
              ))}
              {data.referringDomains.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-neutral-500">No referring domains found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="panel flex flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Top anchor texts</h3>
            <span className="eyebrow">by backlinks</span>
          </div>
          <HBars
            items={data.anchors.slice(0, 10).map((a) => ({ label: a.anchor, value: a.backlinks }))}
            color="var(--color-series-3)"
            emptyLabel="No anchor data"
          />
        </div>
      </div>
    </div>
  );
}
