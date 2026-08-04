import { fetchSite } from "@/lib/crawl/fetch-site";
import { runChecks, type AuditResult } from "@/lib/audit/checks";

// Crawl the site (our own SSRF-safe crawler — free) and run the on-page checks.
// Throws when the site can't be crawled at all, so the caller records a failed
// job with the real reason rather than an empty "0-issue" audit.
export async function runSiteAudit(
  domain: string,
  opts?: { fetchImpl?: typeof fetch; maxPages?: number },
): Promise<AuditResult> {
  const crawl = await fetchSite(domain, { fetchImpl: opts?.fetchImpl, maxPages: opts?.maxPages ?? 25 });
  if (crawl.failed || crawl.pages.length === 0) {
    throw new Error(crawl.reason ? `could not audit site: ${crawl.reason}` : "could not audit site: no pages crawled");
  }
  return runChecks(crawl.pages);
}
