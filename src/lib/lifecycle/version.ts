import pkg from "../../../package.json";

export const APP_VERSION: string = pkg.version;

/** Parse "x.y.z" (optionally v-prefixed) into [x,y,z]; null if malformed. */
function parse(v: unknown): [number, number, number] | null {
  if (typeof v !== "string") return null;
  const m = v.trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** True iff `latest` is a strictly higher semver than `current`. Malformed → false. */
export function isNewer(current: string, latest: string): boolean {
  const a = parse(current);
  const b = parse(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (b[i] > a[i]) return true;
    if (b[i] < a[i]) return false;
  }
  return false;
}
