// Hand-built SVG chart set, styled to the design system (ink ground, series
// palette, Geist Mono numerals). No charting dependency — full control over the
// look so the analytics read as one instrument, not a bolted-on library.
//
// All charts are responsive (viewBox + width:100%), server-renderable (no hooks),
// and degrade to a calm empty state when there's nothing to plot yet.

const SERIES = ["var(--color-series-1)", "var(--color-series-2)", "var(--color-series-3)", "var(--color-series-4)"];

function EmptyChart({ height = 160, label = "No data yet" }: { height?: number; label?: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-neutral-800 text-xs text-neutral-600" style={{ height }}>
      {label}
    </div>
  );
}

function compactAxis(n: number): string {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/* ── Area trend ─────────────────────────────────────────────────────────────
   Time-series area + line with a gradient fill, horizontal gridlines, y ticks
   and a highlighted last point. `invert` for position series (lower is better). */
export function AreaTrend({
  points,
  labels = [],
  color = "var(--color-accent)",
  height = 200,
  invert = false,
  yFormat = compactAxis,
  emptyLabel,
}: {
  points: number[];
  labels?: string[];
  color?: string;
  height?: number;
  invert?: boolean;
  yFormat?: (n: number) => string;
  emptyLabel?: string;
}) {
  if (points.length < 2) return <EmptyChart height={height} label={emptyLabel ?? "Not enough history yet"} />;

  const W = 640;
  const H = height;
  const padL = 40;
  const padR = 12;
  const padT = 12;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const disp = invert ? points.map((p) => -p) : points;
  const rawMin = Math.min(...disp);
  const rawMax = Math.max(...disp);
  const min = rawMin === rawMax ? rawMin - 1 : rawMin;
  const max = rawMin === rawMax ? rawMax + 1 : rawMax;
  const span = max - min;

  const x = (i: number) => padL + (i / (points.length - 1)) * plotW;
  const y = (v: number) => padT + (1 - (v - min) / span) * plotH;

  const pts = disp.map((v, i) => [x(i), y(v)] as const);
  const line = pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${padT + plotH} L${pts[0][0].toFixed(1)} ${padT + plotH} Z`;

  const ticks = 3;
  const gridY = Array.from({ length: ticks + 1 }, (_, i) => min + (span * i) / ticks);
  const gid = `at-${Math.round(min)}-${Math.round(max)}-${points.length}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" role="img">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridY.map((gv, i) => {
        const gy = y(gv);
        return (
          <g key={i}>
            <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={padL - 6} y={gy + 3} textAnchor="end" fontSize="9" fill="var(--color-neutral-500)" fontFamily="var(--font-mono)">
              {yFormat(invert ? -gv : gv)}
            </text>
          </g>
        );
      })}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill={color} stroke="var(--color-neutral-950)" strokeWidth="1.5" />
      {labels.length ? (
        <>
          <text x={padL} y={H - 6} textAnchor="start" fontSize="9" fill="var(--color-neutral-500)">{labels[0]}</text>
          <text x={W - padR} y={H - 6} textAnchor="end" fontSize="9" fill="var(--color-neutral-500)">{labels[labels.length - 1]}</text>
        </>
      ) : null}
    </svg>
  );
}

/* ── Donut ──────────────────────────────────────────────────────────────────
   Segmented ring with a big centre total; a legend of segment shares. */
export function Donut({
  segments,
  size = 168,
  centerLabel,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  centerLabel?: string;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const stroke = 16;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let offset = 0;
  const arcs =
    total > 0
      ? segments
          .filter((s) => s.value > 0)
          .map((seg) => {
            const frac = seg.value / total;
            const dash = frac * C;
            const el = (
              <circle
                key={seg.label}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return el;
          })
      : [];

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-neutral-800)" strokeWidth={stroke} />
        {arcs}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="26" fontWeight="600" fill="white" fontFamily="var(--font-mono)" letterSpacing="-0.03em">
          {total}
        </text>
        {centerLabel ? (
          <text x={cx} y={cy + 15} textAnchor="middle" fontSize="9.5" fill="var(--color-neutral-500)" letterSpacing="0.06em">
            {centerLabel.toUpperCase()}
          </text>
        ) : null}
      </svg>
      <ul className="flex min-w-0 flex-col gap-1.5">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: seg.color }} />
            <span className="truncate text-neutral-400">{seg.label}</span>
            <span className="tnum ml-auto pl-2 text-neutral-200">{seg.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Vertical histogram ─────────────────────────────────────────────────────
   Bucketed counts (e.g. keyword difficulty), each bar its own colour. */
export function BarHistogram({ bars, height = 150 }: { bars: { label: string; value: number; color: string }[]; height?: number }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {bars.map((bar) => {
        const h = (bar.value / max) * (height - 26);
        return (
          <div key={bar.label} className="flex flex-1 flex-col items-center justify-end gap-1.5">
            <span className="tnum text-[0.7rem] text-neutral-300">{bar.value}</span>
            <div className="w-full overflow-hidden rounded-t-md" style={{ height: Math.max(2, h), background: bar.color, minHeight: 2 }} />
            <span className="text-[0.62rem] text-neutral-500">{bar.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Horizontal bars ────────────────────────────────────────────────────────
   Ranked comparison (competitor share-of-voice, top keywords by volume). */
export function HBars({
  items,
  valueFormat = (n) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n),
  color = "var(--color-accent)",
  emptyLabel,
}: {
  items: { label: string; value: number; sub?: string }[];
  valueFormat?: (n: number) => string;
  color?: string;
  emptyLabel?: string;
}) {
  if (!items.length) return <EmptyChart label={emptyLabel ?? "No data yet"} />;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item, i) => (
        <li key={item.label} className="flex items-center gap-3">
          <span className="w-36 shrink-0 truncate text-xs text-neutral-300" title={item.label}>{item.label}</span>
          <span className="relative h-4 flex-1 overflow-hidden rounded-md bg-neutral-800/60">
            <span
              className="absolute inset-y-0 left-0 rounded-md"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, background: i === 0 ? color : "color-mix(in oklab, var(--color-series-2) 75%, transparent)" }}
            />
          </span>
          <span className="tnum w-14 shrink-0 text-right text-xs text-neutral-200">{valueFormat(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export const CHART_SERIES = SERIES;
