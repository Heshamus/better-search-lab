import type { UsageSummary } from "@/lib/usage";

// Same "$X.XX" convention already used by dashboard-metrics.ts's health-strip
// spend tile and research-explorer.tsx's CPC column — kept as a local
// private helper here too (no shared currency util exists yet in this repo).
function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * Usage & cost view's presentational body (Task 9): total spend this month, a
 * by-day cost list, and a by-endpoint cost+rows table. Pure display over
 * `usageSummary`'s output (`@/lib/usage`) — the Usage page's server component
 * does the actual `api_usage` read; this component only knows how to lay the
 * numbers out, mirroring health-strip.tsx/opportunity-card.tsx's
 * presentational-only role.
 *
 * Honesty rule (brief): a genuinely empty summary (no api_usage rows this
 * month) still renders "$0.00" — a real, known zero — plus a gentle inline
 * note, never a blank page and never a fabricated non-zero number.
 */
export function UsageReport({ summary }: { summary: UsageSummary }) {
  const isEmpty = summary.byDay.length === 0 && summary.byEndpoint.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Total spend this month</p>
        <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-white">{formatUsd(summary.total)}</p>
        {isEmpty ? (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">No usage yet this month.</p>
        ) : null}
      </section>

      {summary.byDay.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            By day
          </h2>
          <ul className="flex flex-col gap-0 rounded-xl border border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900">
            {summary.byDay.map((d) => (
              <li
                key={d.day}
                data-testid={`usage-day-${d.day}`}
                className="flex items-center justify-between border-b border-neutral-100 py-2 text-sm last:border-0 dark:border-neutral-800/60"
              >
                <span className="text-neutral-600 dark:text-neutral-300">{d.day}</span>
                <span className="font-medium text-neutral-900 dark:text-white">{formatUsd(d.cost)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.byEndpoint.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            By endpoint
          </h2>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Endpoint
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Cost
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Rows
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.byEndpoint.map((e) => (
                  <tr
                    key={e.endpoint}
                    data-testid={`usage-endpoint-${e.endpoint}`}
                    className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60"
                  >
                    <td className="px-4 py-2 font-medium text-neutral-900 dark:text-white">{e.endpoint}</td>
                    <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{formatUsd(e.cost)}</td>
                    <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{e.rows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
