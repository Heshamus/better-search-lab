// The health strip over the opportunities feed: Visibility, Est. traffic, Avg
// position, Keywords, Spend. This component only lays a metric list out — the
// values (already "—"-for-null formatted) are computed upstream.
export type Metric = {
  label: string;
  value: string;
  hint?: string;
};

// Fallback context per tile, so a number is never naked. A metric may override
// with its own `hint`.
const HINTS: Record<string, string> = {
  Visibility: "share of tracked SERPs",
  "Est. traffic": "monthly organic clicks",
  "Avg position": "across tracked keywords",
  Keywords: "tracked",
  "Spend this month": "DataForSEO + LLM",
};

export function HealthStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {metrics.map((metric) => {
        const empty = metric.value === "—" || metric.value === "";
        return (
          <div key={metric.label} className="panel flex flex-col gap-1.5 px-4 py-3.5">
            <dt className="eyebrow">{metric.label}</dt>
            <dd className={`num text-[1.7rem] font-semibold leading-none tracking-tight ${empty ? "text-neutral-600" : "text-white"}`}>
              {empty ? "—" : metric.value}
            </dd>
            <dd className="text-[0.7rem] text-neutral-500">{empty ? "No data yet" : (metric.hint ?? HINTS[metric.label] ?? "")}</dd>
          </div>
        );
      })}
    </dl>
  );
}
