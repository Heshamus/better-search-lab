import type { AuditRow } from "@/lib/audit/store";
import type { Severity } from "@/lib/audit/checks";

const SEV_COLOR: Record<Severity, string> = {
  error: "var(--color-down)",
  warning: "var(--color-at-risk)",
  notice: "var(--color-series-2)",
};
const SEV_LABEL: Record<Severity, string> = { error: "Errors", warning: "Warnings", notice: "Notices" };

function ScoreRing({ score }: { score: number }) {
  const size = 128;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "var(--color-up)" : score >= 50 ? "var(--color-at-risk)" : "var(--color-down)";
  const grade = score >= 80 ? "Good" : score >= 50 ? "Needs work" : "Poor";
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-neutral-200)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize="30" fontWeight="600" fill="var(--color-neutral-900)" letterSpacing="-0.04em">
          {score}
        </text>
        <text x={size / 2} y={size / 2 + 17} textAnchor="middle" fontSize="9.5" fill="var(--color-neutral-500)" letterSpacing="0.06em">
          / 100
        </text>
      </svg>
      <div className="flex flex-col gap-1">
        <span className="text-lg font-semibold" style={{ color }}>{grade}</span>
        <span className="text-sm text-neutral-600">Overall on-page health</span>
      </div>
    </div>
  );
}

/** Strip the origin so affected URLs read as compact paths. */
function path(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? "/ (home)" : u.pathname;
  } catch {
    return url;
  }
}

export function AuditReport({ audit }: { audit: AuditRow }) {
  const bySev = (s: Severity) => audit.issues.filter((i) => i.severity === s).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="panel flex items-center p-5">
          <ScoreRing score={audit.score} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {(["error", "warning", "notice"] as Severity[]).map((s) => (
            <div key={s} className="panel flex flex-col justify-center gap-1.5 px-4 py-3.5">
              <span className="flex items-center gap-1.5 eyebrow">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: SEV_COLOR[s] }} />
                {SEV_LABEL[s]}
              </span>
              <span className="num text-[1.7rem] font-semibold leading-none tracking-tight text-neutral-900">{bySev(s)}</span>
              <span className="text-[0.7rem] text-neutral-500">issue types</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel divide-y divide-neutral-200">
        {audit.issues.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-neutral-600">No issues found — the crawled pages passed every check. 🎉</p>
        ) : (
          audit.issues.map((issue) => (
            <div key={issue.id} className="flex flex-col gap-2 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: SEV_COLOR[issue.severity] }} />
                <span className="text-sm font-semibold text-neutral-900">{issue.label}</span>
                <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[0.65rem] font-medium text-neutral-700">{issue.category}</span>
                <span className="tnum ml-auto text-xs text-neutral-600">{issue.count} {issue.count === 1 ? "page" : "pages"}</span>
              </div>
              <p className="text-sm text-neutral-600">{issue.help}</p>
              {issue.affected.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {issue.affected.map((u) => (
                    <span key={u} className="tnum truncate rounded bg-neutral-100 px-1.5 py-0.5 text-[0.68rem] text-neutral-500" title={u}>{path(u)}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
