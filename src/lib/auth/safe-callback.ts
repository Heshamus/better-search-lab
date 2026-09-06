export const DEFAULT_CALLBACK_URL = "/overview";

/**
 * Only a same-origin app path may be used as a post-login destination.
 * Rejects protocol-relative ("//x"), backslash aliases ("/\x" — parsed as
 * "//x" by browsers), and API routes; falls back to /overview.
 * The URL cross-check catches any other spelling that resolves off-origin.
 *
 * An absolute http(s) URL is first reduced to its pathname + search. Auth.js's
 * `authorized` redirect stamps `callbackUrl` with the ABSOLUTE original URL,
 * which inside a container is the internal origin (http://localhost:3000/...),
 * so rejecting absolutes outright sent every login to /overview. Only the path
 * is kept and it is then held to exactly the same rules, so the host is
 * irrelevant: a path on our own origin is harmless wherever it was copied from.
 */
export function safeCallback(input: string | undefined): string {
  let raw = input;
  if (raw && /^https?:\/\//i.test(raw)) {
    try {
      const abs = new URL(raw);
      raw = abs.pathname + abs.search;
      // A bare origin ("https://evil.com" -> "/") names no destination.
      if (raw === "/") return DEFAULT_CALLBACK_URL;
    } catch {
      return DEFAULT_CALLBACK_URL;
    }
  }
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return DEFAULT_CALLBACK_URL;
  if (raw === "/api" || raw.startsWith("/api/")) return DEFAULT_CALLBACK_URL;
  try {
    const base = "http://bsl.invalid";
    const u = new URL(raw, base);
    if (u.origin !== base) return DEFAULT_CALLBACK_URL;
  } catch {
    return DEFAULT_CALLBACK_URL;
  }
  return raw;
}
