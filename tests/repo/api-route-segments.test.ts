import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The demo boundary lives in middleware (src/middleware.ts), whose matcher is
// `/((?!_next/|.*\..*).*)` — it skips ANY path containing a dot, so static
// files never wake it. That exclusion is also a hole: a mutating route with a
// dynamic segment that can hold a dot — a domain, a filename, an email —
// is never seen by the middleware, so `POST /api/sites/example.com/delete`
// would sail past the demo 403 with no error anywhere.
//
// Today every mutating route's dynamic segment holds an opaque id, which
// cannot contain a dot. This test pins that. If you add a mutating route with
// a NEW segment name, either
//   - name it after an id (and add the name below), or
//   - call `isDemoMode()` / `isDemoAllowed()` inside the handler and add the
//     name below with a note saying so,
// but do not just widen the list to make the test pass.
const DOT_FREE_SEGMENTS = new Set([
  "id", // project / user / keyword / job / opportunity ids — nanoid, no dots
  "convId", // reddit conversation id, same shape
  "group", // integration group key from a fixed registry (dataforseo, google, …)
  "...nextauth", // Auth.js's own catch-all: a fixed route set (callback/credentials, signout, …), and sign-in is on the demo allowlist on purpose
]);

const MUTATING = ["POST", "PUT", "PATCH", "DELETE"] as const;
const API_ROOT = "src/app/api";

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? routeFiles(join(dir, e.name)) : e.name === "route.ts" ? [join(dir, e.name)] : [],
  );
}

/**
 * Names bound by a top-level `export` — covering every form the app uses:
 * `export async function POST(`, `export const POST =`, `export { GET, POST }`
 * and `export const { GET, POST } = handlers` (the Auth.js route).
 */
function exportedNames(src: string): Set<string> {
  const names = new Set<string>();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var)?\s*(\{[^}]*\}|\w+)/gm)) {
    for (const raw of m[1].replace(/[{}]/g, "").split(",")) names.add(raw.trim().split(":").pop()!.trim());
  }
  return names;
}

const mutatingRoutes = routeFiles(API_ROOT)
  .map((file) => ({ file, exports: exportedNames(readFileSync(file, "utf8")) }))
  .filter((r) => MUTATING.some((m) => r.exports.has(m)))
  .map((r) => ({ ...r, segments: [...r.file.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]) }));

describe("mutating API routes cannot hide behind the middleware's dot exclusion", () => {
  // Guards the detector itself: a regex that stopped matching would make every
  // assertion below pass on an empty set.
  it("finds the mutating routes it is meant to inspect", () => {
    const byFile = new Map(mutatingRoutes.map((r) => [r.file, r]));
    expect(byFile.has(join(API_ROOT, "users/[id]/route.ts"))).toBe(true);
    expect(byFile.has(join(API_ROOT, "auth/[...nextauth]/route.ts")), "destructured export form").toBe(true);
    expect(byFile.has(join(API_ROOT, "health/route.ts")), "GET-only route").toBe(false);
    expect(mutatingRoutes.length).toBeGreaterThan(20);
  });

  it("uses only dynamic segment names that cannot contain a dot", () => {
    for (const { file, segments } of mutatingRoutes) {
      for (const s of segments) expect(DOT_FREE_SEGMENTS.has(s), `${file} → [${s}]`).toBe(true);
    }
  });
});
