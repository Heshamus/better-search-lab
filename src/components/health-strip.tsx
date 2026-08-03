// The slim health strip over the opportunities feed (spec §8): five compact
// tiles — Visibility, Est. traffic, Avg position, Keywords, Spend this
// month. Phase 0 has no data pipeline yet, so callers pass placeholder
// values; this component only knows how to lay a metric list out, never how
// to compute one.
export type Metric = {
  label: string;
  value: string;
};

export function HealthStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{metric.label}</dt>
          <dd className="mt-1 text-xl font-semibold text-neutral-900 dark:text-white">{metric.value}</dd>
        </div>
      ))}
    </dl>
  );
}
