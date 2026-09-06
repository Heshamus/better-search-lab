export const DEFAULT_CALLBACK_URL = "/overview";

/**
 * Only a same-origin app path may be used as a post-login destination.
 * Rejects protocol-relative ("//x"), backslash aliases ("/\x" — parsed as
 * "//x" by browsers), absolute URLs, and API routes; falls back to /overview.
 * The URL cross-check catches any other spelling that resolves off-origin.
 */
export function safeCallback(raw: string | undefined): string {
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
