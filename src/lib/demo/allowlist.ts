export const READ_ONLY_DEMO_MESSAGE = "This is a read-only demo.";

/**
 * The demo boundary (spec §13) is an ALLOWLIST, not a "non-GET" rule: the Google
 * OAuth callback is a GET that writes. Everything under /api/** that is not
 * listed here is refused with 403, whatever the method.
 */
export function isDemoAllowed(method: string, pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  const m = method.toUpperCase();
  if (m !== "GET" && m !== "HEAD") return false;
  return (
    pathname === "/api/health" ||
    pathname === "/api/selftest" ||
    pathname.startsWith("/api/jobs/") ||
    pathname.startsWith("/api/mcp/") ||
    pathname === "/api/settings/integrations"
  );
}
