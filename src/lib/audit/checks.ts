// Rule-based on-page SEO audit over crawled HTML. Runs on our own crawler (no
// per-check external cost), so an audit is free to re-run. Regex extraction is
// intentional — adequate for the technical on-page signals we check, and keeps
// the auditor dependency-free.

export type Severity = "error" | "warning" | "notice";

export interface AuditIssue {
  id: string;
  label: string;
  category: "Meta" | "Content" | "Structure" | "Indexability" | "Mobile";
  severity: Severity;
  count: number; // pages affected
  affected: string[]; // up to 8 sample URLs
  help: string;
}

export interface AuditResult {
  score: number;
  pagesCrawled: number;
  issues: AuditIssue[];
}

interface PageFacts {
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  wordCount: number;
  images: number;
  imagesNoAlt: number;
  hasCanonical: boolean;
  hasOgTitle: boolean;
  hasOgImage: boolean;
  hasJsonLd: boolean;
  hasViewport: boolean;
}

function textContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1] : null;
}

export function analyzePage(url: string, html: string): PageFacts {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;

  let metaDescription: string | null = null;
  let hasOgTitle = false;
  let hasOgImage = false;
  let hasViewport = false;
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const name = (attr(tag, "name") ?? "").toLowerCase();
    const prop = (attr(tag, "property") ?? "").toLowerCase();
    if (name === "description") metaDescription = attr(tag, "content")?.trim() ?? metaDescription;
    if (name === "viewport") hasViewport = true;
    if (prop === "og:title") hasOgTitle = true;
    if (prop === "og:image") hasOgImage = true;
  }

  const h1Count = [...html.matchAll(/<h1\b[^>]*>/gi)].length;

  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const imagesNoAlt = imgTags.filter((t) => {
    const a = attr(t, "alt");
    return a === null || a.trim() === "";
  }).length;

  const hasCanonical = /<link\b[^>]*rel\s*=\s*["']canonical["']/i.test(html);
  const hasJsonLd = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(html);

  const wordCount = textContent(html).split(/\s+/).filter(Boolean).length;

  return {
    url,
    title: title && title.length ? title : null,
    metaDescription: metaDescription && metaDescription.length ? metaDescription : null,
    h1Count,
    wordCount,
    images: imgTags.length,
    imagesNoAlt,
    hasCanonical,
    hasOgTitle,
    hasOgImage,
    hasJsonLd,
    hasViewport,
  };
}

const WEIGHT: Record<Severity, number> = { error: 22, warning: 10, notice: 3 };
const SAMPLE_CAP = 8;

export function runChecks(pages: { url: string; html: string }[]): AuditResult {
  const facts = pages.map((p) => analyzePage(p.url, p.html));
  const n = facts.length;
  const issues: AuditIssue[] = [];

  const add = (
    id: string,
    label: string,
    category: AuditIssue["category"],
    severity: Severity,
    matched: PageFacts[],
    help: string,
  ) => {
    if (matched.length === 0) return;
    issues.push({ id, label, category, severity, count: matched.length, affected: matched.slice(0, SAMPLE_CAP).map((f) => f.url), help });
  };

  // Meta / titles
  add("title-missing", "Missing page title", "Meta", "error", facts.filter((f) => !f.title), "Every page needs a unique <title> of ~50–60 characters.");
  add("title-long", "Title too long (>60 chars)", "Meta", "warning", facts.filter((f) => f.title != null && f.title.length > 60), "Titles over ~60 chars get truncated in search results.");
  add("title-short", "Title too short (<30 chars)", "Meta", "notice", facts.filter((f) => f.title != null && f.title.length < 30), "Short titles waste the space search engines give you.");
  add("meta-missing", "Missing meta description", "Meta", "warning", facts.filter((f) => !f.metaDescription), "Add a 120–160 char description to control the search snippet.");
  add("meta-long", "Meta description too long (>160)", "Meta", "notice", facts.filter((f) => f.metaDescription != null && f.metaDescription.length > 160), "Descriptions over ~160 chars get cut off.");

  // Duplicates (cross-page)
  const dupGroups = (pick: (f: PageFacts) => string | null) => {
    const by = new Map<string, PageFacts[]>();
    for (const f of facts) {
      const v = pick(f);
      if (!v) continue;
      const g = by.get(v) ?? [];
      g.push(f);
      by.set(v, g);
    }
    return [...by.values()].filter((g) => g.length > 1).flat();
  };
  add("title-duplicate", "Duplicate titles", "Meta", "warning", dupGroups((f) => f.title), "Two or more pages share a title — each should be distinct.");
  add("meta-duplicate", "Duplicate meta descriptions", "Meta", "notice", dupGroups((f) => f.metaDescription), "Reused descriptions dilute each page's snippet.");

  // Structure
  add("h1-missing", "Missing H1", "Structure", "error", facts.filter((f) => f.h1Count === 0), "Each page should have exactly one H1 describing its topic.");
  add("h1-multiple", "Multiple H1s", "Structure", "warning", facts.filter((f) => f.h1Count > 1), "More than one H1 muddies the page's main topic.");

  // Content
  add("thin-content", "Thin content (<300 words)", "Content", "warning", facts.filter((f) => f.wordCount < 300), "Pages under ~300 words rarely rank — add substantive copy.");
  add("img-alt", "Images missing alt text", "Content", "warning", facts.filter((f) => f.imagesNoAlt > 0), "Alt text helps accessibility and image search.");

  // Indexability / rich results
  add("canonical-missing", "Missing canonical tag", "Indexability", "notice", facts.filter((f) => !f.hasCanonical), "A canonical tag prevents duplicate-URL dilution.");
  add("jsonld-missing", "No structured data", "Indexability", "notice", facts.filter((f) => !f.hasJsonLd), "JSON-LD schema unlocks rich results (and AI citations).");
  add("og-missing", "Missing Open Graph tags", "Indexability", "notice", facts.filter((f) => !f.hasOgTitle || !f.hasOgImage), "og:title/og:image control how links preview when shared.");

  // Mobile
  add("viewport-missing", "Missing viewport meta", "Mobile", "warning", facts.filter((f) => !f.hasViewport), "Without a viewport tag the page won't render well on mobile.");

  // Score: 100 minus severity-weighted, prevalence-scaled penalties.
  const penalty = issues.reduce((sum, i) => sum + WEIGHT[i.severity] * (i.count / n), 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  // Most severe + most prevalent first.
  const order: Record<Severity, number> = { error: 0, warning: 1, notice: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);

  return { score, pagesCrawled: n, issues };
}
