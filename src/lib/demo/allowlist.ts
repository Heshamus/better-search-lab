export const READ_ONLY_DEMO_MESSAGE = "This is a read-only demo.";

/**
 * The demo boundary (spec §13) is an ALLOWLIST, not a "non-GET" rule: the Google
 * OAuth callback is a GET that writes. Everything under /api/** that is not
 * listed here is refused with 403, whatever the method. GET, HEAD and OPTIONS
 * are the only methods ever treated as reads (the plan's Global Constraints
 * list all three); every other method is refused outright.
 *
 * `/api/projects` (exact) and everything under `/api/keywords/` are read by
 * the demo UI on every page load (site-switcher, rankings) — without them the
 * boundary breaks the app it's supposed to protect, not just writes to it.
 */
export function isDemoAllowed(method: string, pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  const m = method.toUpperCase();
  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") return false;
  return (
    pathname === "/api/health" ||
    pathname === "/api/selftest" ||
    pathname === "/api/projects" ||
    pathname.startsWith("/api/jobs/") ||
    pathname.startsWith("/api/keywords/") ||
    pathname.startsWith("/api/mcp/") ||
    pathname === "/api/settings/integrations"
  );
}
