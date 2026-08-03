// SSRF-safe fetcher: homepage + a few same-host internal links, host-literal
// guarded (block loopback/private/link-local + octal/hex/decimal IP encodings),
// scheme-restricted to http(s), redirect:manual, size- and time-capped. This is
// a host-literal guard (no DNS resolution) — adequate for a single-tenant tool
// pointed at domains the operator types, not a hostile-input boundary.
const BLOCKED_LITERAL = new Set(["localhost", "::1", "0.0.0.0"]);

function parseNumericToken(tok: string): number | null {
  if (/^0x[0-9a-f]+$/i.test(tok)) return parseInt(tok, 16);
  if (/^0[0-7]+$/.test(tok)) return parseInt(tok, 8);
  if (/^\d+$/.test(tok)) return Number(tok);
  return null;
}

function ipToLong(host: string): number | null {
  // inet_aton-style parsing: 1-4 dot-separated parts (each decimal, 0x-hex, or
  // 0-octal), with the last part absorbing the remaining bits. Covers bare
  // whole-address tokens ("2130706433", "0x7f000001", "017700000001") and
  // dotted shorthand ("127.1", "127.0.1" both == 127.0.0.1), not just full
  // 4-octet dotted quads.
  const parts = host.split(".");
  if (parts.length < 1 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    const n = parseNumericToken(p);
    if (n === null) return null;
    nums.push(n);
  }
  if (nums.length === 1) {
    const [a] = nums;
    if (a > 0xFFFFFFFF) return null;
    return a >>> 0;
  }
  if (nums.length === 2) {
    const [a, b] = nums;
    if (a > 0xFF || b > 0xFFFFFF) return null;
    return ((a << 24) | (b & 0xFFFFFF)) >>> 0;
  }
  if (nums.length === 3) {
    const [a, b, c] = nums;
    if (a > 0xFF || b > 0xFF || c > 0xFFFF) return null;
    return ((a << 24) | (b << 16) | (c & 0xFFFF)) >>> 0;
  }
  const [a, b, c, d] = nums;
  if (a > 0xFF || b > 0xFF || c > 0xFF || d > 0xFF) return null;
  let out = 0;
  for (const n of nums) out = (out << 8) | n;
  return out >>> 0;
}

function isPrivateLong(n: number): boolean {
  const oct = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  if (oct[0] === 10 || oct[0] === 127 || oct[0] === 0) return true;         // 10/8, loopback, 0/8
  if (oct[0] === 172 && oct[1] >= 16 && oct[1] <= 31) return true;          // 172.16/12
  if (oct[0] === 192 && oct[1] === 168) return true;                        // 192.168/16
  if (oct[0] === 169 && oct[1] === 254) return true;                        // link-local
  return false;
}

export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().trim().replace(/\.+$/, ""); // strip trailing dots first
  if (BLOCKED_LITERAL.has(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.includes(":")) return true; // any IPv6 literal — refuse rather than parse
  const long = ipToLong(h);
  if (long !== null) return isPrivateLong(long); // an IP literal: allow only public
  return false; // a normal hostname
}

export interface CrawledPage { url: string; html: string; }
export interface CrawlResult { pages: CrawledPage[]; failed: boolean; reason?: string; }

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const UA = "Mozilla/5.0 (compatible; seo-platform-profiler/1.0)";

function toUrl(domain: string): URL | null {
  const raw = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  try { return new URL(raw); } catch { return null; }
}

async function fetchHtml(url: string, fetchImpl: typeof fetch): Promise<string> {
  // redirect:"manual" + a hand-rolled hop loop (not redirect:"follow") so every
  // hop's target host is re-validated via isBlockedHost BEFORE it is fetched —
  // a public URL that 3xx-redirects to a blocked host (e.g. 169.254.169.254)
  // must never be requested, not just never returned.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let currentUrl = url;
    for (let redirects = 0; ; redirects++) {
      const res = await fetchImpl(currentUrl, {
        redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": UA },
      });

      const isRedirect = res.status >= 300 && res.status < 400;
      const location = isRedirect ? res.headers.get("location") : null;
      if (isRedirect && location) {
        if (redirects >= MAX_REDIRECTS) return ""; // hop budget exhausted
        let next: URL;
        try { next = new URL(location, currentUrl); } catch { return ""; }
        if (!/^https?:$/.test(next.protocol)) return "";
        if (isBlockedHost(next.hostname)) return ""; // re-validate before following
        currentUrl = next.toString();
        continue;
      }

      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || (ct && !ct.includes("html"))) return "";
      const text = await res.text();
      return text.slice(0, MAX_BYTES);
    }
  } finally { clearTimeout(t); }
}

function sameHostLinks(html: string, base: URL, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    if (out.length >= limit) break; // check the bound BEFORE adding, not after
    const href = m[1].split("#")[0]; // strip fragment, keep the path (e.g. /pricing#s2 -> /pricing)
    if (!href) continue;
    let u: URL;
    try { u = new URL(href, base); } catch { continue; }
    if (u.hostname !== base.hostname) continue;
    if (!/^https?:$/.test(u.protocol)) continue;
    const key = u.pathname;
    if (key === base.pathname || seen.has(key)) continue;
    seen.add(key); out.push(u.toString());
  }
  return out;
}

export async function fetchSite(
  domain: string,
  opts?: { fetchImpl?: typeof fetch; maxPages?: number },
): Promise<CrawlResult> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const maxPages = opts?.maxPages ?? 8;
  const base = toUrl(domain);
  if (!base) return { pages: [], failed: true, reason: "invalid domain" };
  if (isBlockedHost(base.hostname)) return { pages: [], failed: true, reason: "blocked/private host" };

  let homeHtml: string;
  try {
    homeHtml = await fetchHtml(base.toString(), fetchImpl);
  } catch (e) {
    return { pages: [], failed: true, reason: String((e as { message?: unknown })?.message ?? e) };
  }
  if (!homeHtml) return { pages: [], failed: true, reason: "homepage returned no HTML" };

  const pages: CrawledPage[] = [{ url: base.toString(), html: homeHtml }];
  for (const link of sameHostLinks(homeHtml, base, maxPages - 1)) {
    try {
      const html = await fetchHtml(link, fetchImpl);
      if (html) pages.push({ url: link, html });
    } catch { /* skip a bad internal link, keep the rest */ }
  }
  return { pages, failed: false };
}
