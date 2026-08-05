import type { RedditRadarRow } from "@/lib/reddit/store";

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel flex flex-col gap-1.5 px-4 py-3.5">
      <span className="eyebrow">{label}</span>
      <span className="num text-[1.7rem] font-semibold leading-none tracking-tight text-white">{value}</span>
      <span className="text-[0.7rem] text-neutral-500">{hint}</span>
    </div>
  );
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? "/ (home)" : u.pathname;
  } catch {
    return url;
  }
}

/**
 * Reddit trend radar: which of your niche terms are being discussed on Reddit
 * right now (past month), the top thread per term, whether you have a page for
 * it, and the subreddits your niche lives in (auto-discovered).
 */
export function RedditRadar({ radar }: { radar: RedditRadarRow }) {
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-3 gap-3">
        <Tile label="Terms discussed" value={String(radar.terms.length)} hint={`of ${radar.termsScanned} scanned`} />
        <Tile label="Threads found" value={String(radar.threadsTotal)} hint="recent · past month" />
        <Tile label="Subreddits" value={String(radar.subreddits.length)} hint="where your niche lives" />
      </dl>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel overflow-x-auto lg:col-span-2">
          <div className="border-b border-neutral-800 px-4 py-2.5"><h3 className="text-sm font-semibold text-white">Active on Reddit</h3></div>
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="eyebrow px-4 py-2.5">Term</th>
                <th className="eyebrow px-4 py-2.5">Your page</th>
                <th className="eyebrow px-4 py-2.5">Threads</th>
                <th className="eyebrow px-4 py-2.5">Top discussion</th>
              </tr>
            </thead>
            <tbody>
              {radar.terms.length ? radar.terms.map((t) => (
                <tr key={t.term} className="border-b border-neutral-800/50 align-top transition-colors last:border-0 hover:bg-neutral-800/20">
                  <td className="px-4 py-2.5 font-medium text-white">{t.term}</td>
                  <td className="px-4 py-2.5">
                    {t.page ? (
                      <span className="text-neutral-300" title={t.page}>{shortPath(t.page)}</span>
                    ) : (
                      <span className="rounded bg-at-risk/10 px-1.5 py-0.5 text-[0.66rem] font-medium text-at-risk">no page · gap</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5"><span className="tnum text-neutral-200">{t.threadCount}</span></td>
                  <td className="px-4 py-2.5">
                    {t.topThreads[0] ? (
                      <a href={t.topThreads[0].url} target="_blank" rel="noreferrer" className="text-accent hover:underline" title={t.topThreads[0].title}>
                        {t.topThreads[0].title.slice(0, 60)}
                        {t.topThreads[0].subreddit ? <span className="text-neutral-500"> · r/{t.topThreads[0].subreddit}</span> : null}
                      </a>
                    ) : <span className="text-neutral-500">—</span>}
                  </td>
                </tr>
              )) : <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-neutral-500">No Reddit discussion found for your terms in the last month.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="border-b border-neutral-800 px-4 py-2.5"><h3 className="text-sm font-semibold text-white">Where your niche lives</h3></div>
          <ul className="flex flex-col">
            {radar.subreddits.length ? radar.subreddits.map((s) => (
              <li key={s.subreddit} className="flex items-center justify-between gap-2 border-b border-neutral-800/50 px-4 py-2.5 text-sm last:border-0">
                <a href={`https://www.reddit.com/r/${s.subreddit}`} target="_blank" rel="noreferrer" className="font-medium text-neutral-200 hover:text-accent">r/{s.subreddit}</a>
                <span className="tnum text-xs text-neutral-500">{s.count}</span>
              </li>
            )) : <li className="px-4 py-6 text-center text-sm text-neutral-500">—</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
