// SSRF-safe fetcher: homepage + a few same-host internal links, host-literal
// guarded (block loopback/private/link-local + octal/hex/decimal IP encodings),
// scheme-restricted to http(s), redirect:manual, size- and time-capped. This is
// a host-literal guard (no DNS resolution) — adequate for a single-tenant tool
// pointed at domains the operator types, not a hostile-input boundary.
const BLOCKED_LITERAL = new Set(["localhost", "::1", "0.0.0.0"]);

function ipToLong(host: string): number | null {
  // Accept decimal (2130706433), dotted, octal (0177.), hex (0x7f.) forms.
  if (/^\d+$/.test(host)) return Number(host) >>> 0;
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(p)) n = parseInt(p, 16);
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8);
    else if (/^\d+$/.test(p)) n = Number(p);
    else return null;
    if (n < 0 || n > 255) return null;
    out = (out << 8) | n;
  }
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
  const h = hostname.toLowerCase().trim();
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
const UA = "Mozilla/5.0 (compatible; seo-platform-profiler/1.0)";

function toUrl(domain: string): URL | null {
  const raw = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  try { return new URL(raw); } catch { return null; }
}

async function fetchHtml(url: string, fetchImpl: typeof fetch): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": UA },
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || (ct && !ct.includes("html"))) return "";
    const text = await res.text();
    return text.slice(0, MAX_BYTES);
  } finally { clearTimeout(t); }
}

function sameHostLinks(html: string, base: URL, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    let u: URL;
    try { u = new URL(m[1], base); } catch { continue; }
    if (u.hostname !== base.hostname) continue;
    if (!/^https?:$/.test(u.protocol)) continue;
    const key = u.pathname;
    if (key === base.pathname || seen.has(key)) continue;
    seen.add(key); out.push(u.toString());
    if (out.length >= limit) break;
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
  } catch (e: any) {
    return { pages: [], failed: true, reason: String(e?.message ?? e) };
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
