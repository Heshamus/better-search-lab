// Data-viz primitives — the design system's signature. Numbers are the product,
// so every metric gets a considered mono/tabular treatment plus, where it helps,
// a compact inline visual (difficulty heat, volume bar, position tier, trend line).
// All presentational + server-renderable (no hooks), pure SVG/CSS.
import { IconArrowUp, IconArrowDown } from "@/components/icons";

/** Big/medium tabular-mono number. em-dash when null, muted. */
export function Stat({ value, className = "" }: { value: string | number | null; className?: string }) {
  const isEmpty = value == null || value === "—" || value === "";
  return (
    <span className={`tnum ${isEmpty ? "text-neutral-600" : ""} ${className}`}>{isEmpty ? "—" : value}</span>
  );
}

function kdTier(kd: number): { color: string; label: string } {
  if (kd <= 33) return { color: "var(--color-kd-easy)", label: "Easy" };
  if (kd <= 66) return { color: "var(--color-kd-medium)", label: "Medium" };
  return { color: "var(--color-kd-hard)", label: "Hard" };
}

/** Keyword-difficulty heat meter: a filled track coloured by tier + the value. */
export function KdMeter({ kd }: { kd: number | null }) {
  if (kd == null) return <span className="tnum text-xs text-neutral-600">—</span>;
  const { color } = kdTier(kd);
  const pct = Math.max(4, Math.min(100, kd));
  return (
    <span className="inline-flex items-center gap-1.5" title={`Difficulty ${kd} · ${kdTier(kd).label}`}>
      <span className="relative h-1.5 w-9 overflow-hidden rounded-full bg-neutral-800">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="tnum text-xs" style={{ color }}>{kd}</span>
    </span>
  );
}

/** Position tier badge: rank 1–3 top, 4–10 page-one, 11–20 close, 20+ far, null unranked. */
export function PositionBadge({ pos }: { pos: number | null }) {
  if (pos == null) {
    return <span className="tnum rounded-md bg-neutral-800/60 px-1.5 py-0.5 text-xs text-neutral-500">—</span>;
  }
  const cls =
    pos <= 3
      ? "bg-up/15 text-up"
      : pos <= 10
        ? "bg-accent/15 text-accent"
        : pos <= 20
          ? "bg-at-risk/15 text-at-risk"
          : "bg-neutral-800/60 text-neutral-400";
  return <span className={`tnum rounded-md px-1.5 py-0.5 text-xs font-medium ${cls}`}>#{pos}</span>;
}

/** A horizontal volume bar (relative to `max`) with the mono figure alongside. */
export function VolumeBar({ value, max }: { value: number | null; max: number }) {
  if (value == null) return <span className="tnum text-xs text-neutral-600">—</span>;
  const pct = max > 0 ? Math.max(3, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-neutral-800">
        <span className="absolute inset-y-0 left-0 rounded-full bg-series-2/70" style={{ width: `${pct}%` }} />
      </span>
      <span className="tnum text-xs text-neutral-300">{Intl.NumberFormat("en", { notation: "compact" }).format(value)}</span>
    </span>
  );
}

/** Signed trend delta with a direction arrow. Positive = climbed = good (green). */
export function Delta({ value }: { value: number | null }) {
  if (value == null || value === 0) return <span className="tnum text-xs text-neutral-600">—</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 tnum text-xs font-medium ${up ? "text-up" : "text-down"}`}>
      {up ? <IconArrowUp /> : <IconArrowDown />}
      {Math.abs(value)}
    </span>
  );
}

/**
 * Inline sparkline (pure SVG). `values` left→right; an area fill under the line.
 * `invert` for position series where lower is better, so a downward raw series
 * still reads as an upward (good) shape.
 */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  color = "var(--color-accent)",
  invert = false,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  invert?: boolean;
}) {
  if (values.length < 2) return <span className="text-xs text-neutral-600">—</span>;
  const series = invert ? values.map((v) => -v) : values;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pad = 2;
  const stepX = (width - pad * 2) / (series.length - 1);
  const pts = series.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${height} L${pts[0][0].toFixed(1)} ${height} Z`;
  const gid = `sg-${Math.round(pts[0][1])}-${series.length}-${Math.round(max)}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={color} />
    </svg>
  );
}
