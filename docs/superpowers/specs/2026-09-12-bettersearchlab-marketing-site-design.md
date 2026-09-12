# Better Search Lab — Marketing Website Design Spec

> **For the implementing agent:** You may have **zero prior context** about Better Search Lab. This document is self-contained. Read it top to bottom. Section 2 tells you exactly what the product is; every fact, number, URL, and command in this spec is real and verified — **use them verbatim and never invent your own**. When you build, honor the product's core principle: *honesty is structural — never show a made-up number.* That principle governs this website too.

**Domain:** `bettersearchlab.com`
**Host:** Hostinger (agency plan), Apache/LiteSpeed with PHP — `.htaccess` is honored.
**Stack:** Custom PHP + HTML + one hand-written CSS file + one small JS file. **No framework, no build step, no npm.** It uploads and runs.
**Date:** 2026-09-12
**Status:** Approved direction; ready for implementation planning.

---

## 1. What this spec is, and how to use it

This is the complete design and content specification for the Better Search Lab marketing website. It exists so that an agent who has never seen the product can build a site that represents it correctly, ranks extremely well in classic search **and** in AI answer engines, and shows **zero "AI-generated website" tells**.

Deliverable: a small, fast, static-first PHP site of five pages plus one tiny backend endpoint, styled as a direct extension of the product's own "Daylight" design system, drawing its layout sensibility from [mobbin.com](https://mobbin.com) (light, near-monochrome, generous whitespace, product-forward, one confident typeface, colour reserved for data).

Two companion artifacts:
- **The screenshots already exist** as real product truth (Section 11.2). Reuse them; do not fabricate product imagery.
- **The brand assets do not exist yet** — you generate them (Section 11.1) under strict constraints so they do not themselves read as AI output.

---

## 2. The product, in one page (read this first)

**Name:** Better Search Lab.
**One-line description:** A self-hosted SEO and AI-search visibility tool for people who run their own websites.
**Tagline (use verbatim):** *Search & GEO visibility.* (GEO = Generative Engine Optimization — being visible in AI-generated answers.)
**Chrome eyebrow used in the product (reuse as a motif):** `SEARCH & GEO VISIBILITY`
**License:** AGPL-3.0-only. Free and open source. No paid tiers, no seats, no credits.
**Who it is for:** SEOs, founders, indie hackers, and site owners who want a real rank-tracking / research / audit tool they run themselves instead of renting a $99–$500/month SaaS seat.

**What it does** (these are the real product areas — the website's Features page maps to them):
- **Overview** — a Search Console + Analytics headline, a "do this next" list, and health tiles.
- **Opportunities** — the heart of the product. A weekly, scored shortlist: *striking-distance* keywords, *content decay*, *momentum*, *competitor gaps*, *SERP features*, *cannibalization*, and *CTR gaps* — each explained and actionable, grounded in real Search Console data.
- **Rankings & keywords** — daily positions with history, SERP features you own, tracked-keyword management, and bulk keyword overview.
- **Research** — keyword research and a keyword overview tool.
- **Competitors** — up to five per site, suggested from real overlap; their keywords, top pages, and the gaps you are missing.
- **Backlinks, site audit, organic keywords** — DataForSEO backlink snapshots with trends; an on-page audit from the product's own crawler (free); organic keyword lists.
- **Search Console & Analytics** — Google Search Console and GA connected in one place.
- **AI Visibility** — weekly scans of **Perplexity, ChatGPT, and Gemini**: are you named, are you cited, and who is instead. (This is the "GEO" half of the tagline.)
- **Trends**, **Usage & cost**, **Settings**.
- **Reddit conversations** — threads worth joining, judged for fit and drafted with citations.
- **MCP server** — a bundled Model Context Protocol server so a coding agent (Claude Code or any MCP client) gets read-only tools over your data.

**The full in-product left-nav, in order (do not reword these):** Overview, Opportunities, Rankings, Keywords, Organic Keywords, Research, Keyword Overview, Competitors, Site audit, Backlinks, Search Console, Analytics, AI Visibility, Trends, Usage & cost, Settings.

**How it is powered / the honesty angle:** The data backbone is the **DataForSEO** API, billed **pay-as-you-go** — no credit system. The product shows an **honest in-app cost meter** (the Usage page) with exactly what was spent, by day and endpoint. This candor is a selling point: the site states real prices out loud.

**Real costs (use these exact numbers; they are the site's proof of honesty):**
- A rank check: **$0.002** per keyword per refresh.
- Keyword research / competitor calls: about **$0.012** each.
- A backlinks refresh: about **$0.06**.
- First build of a 150-keyword site: about **$0.37**.
- A weekly refresh of that same site: about **$0.34**.

**Integrations (all optional except DataForSEO):** DataForSEO (required data backbone), an AI assistant (any LLM, for explanations and drafting), Google (Search Console + Analytics), Eden AI (powers the AI-visibility scans), Email (Resend or SMTP), Reddit API, Apify. Everything is configured inside the app under **Settings → Integrations**; each can also be set by environment variable, and the environment wins.

**How you get it (the install story — verbatim commands):**
- **One command (recommended):**
  ```
  curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh
  ```
  This creates a `better-search-lab` folder, generates a secret, starts Postgres + the app + the worker, and prints the address. Open `http://localhost:3000`; first run redirects to `/setup` (create admin, connect DataForSEO, profile your site, suggest competitors). Active setup time ~5 minutes.
- **Read-only demo variant (look before connecting anything):**
  ```
  curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh -s -- --demo
  ```
  Two synthetic sites, ninety days of history (`DEMO_MODE`).
- **From source:** clone the repo, `cp .env.example .env`, set `AUTH_SECRET`, then `docker compose up -d --build`.
- **Railway:** ships `railway.json` (web) and `railway.worker.json` (worker).
- **Bare metal:** Node 22, pnpm, Postgres 16; `pnpm install && pnpm db:migrate && pnpm build && pnpm start`, plus `pnpm worker`.
- **Only `DATABASE_URL` and `AUTH_SECRET` are required.** Everything else is optional.
- **Keeping it updated:** `docker compose pull && docker compose up -d`, or opt in to hands-off updates with Watchtower.

**The MCP server (for the developer-minded section):** package `@better-search-lab/mcp`, run via `npx` straight from the GitLab release download — no npm install. Mint a token under **Settings → MCP**, then register:
```json
{ "mcpServers": { "better-search-lab": { "command": "npx",
  "args": ["-y", "https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.0.0/downloads/better-search-lab-mcp.tgz"],
  "env": { "BSL_URL": "https://your-install.example.com", "BSL_TOKEN": "bsl_…" } } } }
```

**Canonical links (use these exact URLs everywhere):**
- Live demo: `https://thefamoushesham-better-search-lab-demo.hf.space`
- Source (canonical): GitLab — `https://gitlab.com/betterbrainlab/better-search-lab`
- Source (mirror, read-only): GitHub — `https://github.com/Heshamus/better-search-lab`
- Built by **Harperflow** (`https://harperflow.io`) and **Hesham** (`https://hesham.us`).

**Attribution & repo rules (important):** GitLab is the canonical home — issues and merge requests live there. GitHub is a **read-only mirror**; present it as secondary ("also on GitHub"), never as the primary link.

---

## 3. Goals and non-goals

**Goals**
1. Explain the product truthfully and specifically enough that a first-time visitor understands it in under a minute.
2. Two co-equal primary actions everywhere it matters: **Try the live demo** and **Self-host in one command**.
3. Rank for classic SEO **and** be quotable by AI answer engines (GEO/AEO).
4. Read as hand-built by an engineer with taste — never as a generated template.
5. Load near-instantly; pass Lighthouse ~100 across the board.
6. Capture optional "release updates" emails without dark patterns.

**Non-goals (do not build these)**
- No blog/CMS (may come later; leave URL room but build nothing).
- No pricing page — the product is free; costs are DataForSEO's and shown honestly on Install.
- No login, no app functionality, no user accounts on the marketing site.
- No fake testimonials, fake logo clouds, fake user counts, or invented metrics. (Forbidden — see Section 8.)
- No cookie-consent wall (the analytics choice in Section 15 avoids needing one).

---

## 4. Audience and the single job of each page

| Page | Primary visitor intent | The page's one job |
|---|---|---|
| Home `/` | "What is this and is it real?" | Prove it fast; send them to the demo or the install command. |
| Features `/features` | "Does it do the thing I need?" | Map each capability to a real screenshot and a plain sentence. |
| Install `/install` | "How do I run it, and what will it cost?" | Give copy-paste commands + honest costs; remove every excuse not to try. |
| FAQ `/faq` | "I have a specific objection/question." | Answer it in liftable, quotable prose (also feeds AI engines). |
| Privacy `/privacy` | "What do you do with my email / do you track me?" | Short, honest, human-readable privacy statement. |

---

## 5. Information architecture

```
bettersearchlab.com
├─ /                     index.php     Home
├─ /features             features.php  Capability deep-dive
├─ /install              install.php   Self-host guide + costs
├─ /faq                  faq.php       Q&A (FAQPage schema)
├─ /privacy              privacy.php   Privacy statement
├─ /subscribe            subscribe.php POST-only email handler (no GET page)
├─ 404                   404.php       Custom not-found
├─ /robots.txt          /sitemap.xml  /llms.txt   (SEO/GEO surface files)
└─ external (never pages): Demo · GitLab · GitHub
```

**URL rules:** lowercase, no trailing slash, no `.php` extension in links (`.htaccess` rewrites `/features` → `features.php`). Canonical host is the **apex** `https://bettersearchlab.com` (www and http both 301 to it).

**Global nav (every page, in this order):** Features · Install · FAQ · then two right-aligned actions: **Demo** (external, subtle) and **GitLab** (external, subtle). Logo/wordmark at left links to `/`. Mobile: a hamburger toggling the same links + a prominent "Try the demo" and "Self-host" pair.

**Global footer (every page):** three text columns —
1. *Product*: Features, Install, FAQ, Live demo.
2. *Source*: GitLab (canonical), GitHub (mirror), MCP server, License (AGPL-3.0).
3. *Made by*: Harperflow (harperflow.io), Hesham (hesham.us) + the one-line "release updates" email form + a link to Privacy.
Bottom line: `© <current year> Better Search Lab · AGPL-3.0-only · Self-hosted, honest, open source.`

---

## 6. Technical architecture (flat PHP + shared includes)

No framework. No build step. No package manager. Every page is a real PHP file that composes shared includes. This is the least a zero-context agent can get wrong, and it uploads straight to Hostinger.

### 6.1 File tree (create exactly this)

```
public_html/                         ← Hostinger web root
├─ index.php                         Home
├─ features.php
├─ install.php
├─ faq.php
├─ privacy.php
├─ subscribe.php                     POST-only email handler
├─ 404.php
├─ .htaccess                         rewrites, redirects, headers, caching, denials
├─ robots.txt
├─ sitemap.xml
├─ llms.txt
├─ site.webmanifest
├─ favicon.ico                       (generated, Section 11)
├─ inc/
│  ├─ config.php                     PUBLIC site constants (committed)
│  ├─ secrets.php                    SMTP creds etc. (gitignored; never committed)
│  ├─ secrets.sample.php             template for secrets.php (committed)
│  ├─ head.php                       <head>: meta, OG/Twitter, JSON-LD, preload, CSS
│  ├─ header.php                     skip-link, top nav, wordmark
│  ├─ footer.php                     footer nav, repo links, subscribe form, scripts
│  ├─ nav.php                        the nav link array (single source of truth)
│  └─ schema.php                     helper: emit_jsonld($data)
├─ assets/
│  ├─ css/styles.css                 one hand-written stylesheet
│  ├─ js/site.js                     mobile menu, copy-command, form enhancement
│  ├─ fonts/                         self-hosted Hanken Grotesk .woff2 (subset)
│  ├─ img/                           brand assets + web-optimized screenshots
│  └─ og/                            social share images
└─ data/                            gitignored + htaccess-denied
   └─ subscribers.csv                append-only email capture (created at runtime)
```

### 6.2 The include model

Every page follows this skeleton (example: `features.php`):

```php
<?php
require __DIR__ . '/inc/config.php';
$page = [
  'slug'        => 'features',
  'title'       => 'Features — Better Search Lab',
  'description' => 'Rank tracking, keyword and competitor research, audits, backlinks, AI-visibility, and a weekly opportunity engine — self-hosted.',
  'og_image'    => SITE_URL . '/assets/og/features.png',
  'jsonld'      => [ /* per-page structured data, see Section 14 */ ],
];
require __DIR__ . '/inc/head.php';     // opens <html><head>…</head><body>, then header
?>
<main id="main">
  <!-- page sections here -->
</main>
<?php require __DIR__ . '/inc/footer.php'; // footer + </body></html> ?>
```

- `config.php` defines site-wide constants and is safe to commit. Minimum contents:
  ```php
  <?php
  define('SITE_URL',     'https://bettersearchlab.com');
  define('SITE_NAME',    'Better Search Lab');
  define('TAGLINE',      'Search & GEO visibility');
  define('DEMO_URL',     'https://thefamoushesham-better-search-lab-demo.hf.space');
  define('GITLAB_URL',   'https://gitlab.com/betterbrainlab/better-search-lab');
  define('GITHUB_URL',   'https://github.com/Heshamus/better-search-lab');
  define('CONTACT_EMAIL','hello@bettersearchlab.com');
  define('ANALYTICS_PROVIDER', 'plausible');   // 'plausible' | 'ga4' | 'none'
  define('ANALYTICS_DOMAIN',   'bettersearchlab.com');
  // Install commands, kept in one place so copy is never duplicated:
  define('INSTALL_CMD',      'curl -fsSL ' . GITLAB_URL . '/-/raw/main/install.sh | sh');
  define('INSTALL_CMD_DEMO', INSTALL_CMD . ' -s -- --demo');
  ```
- `secrets.php` (gitignored) holds SMTP host/user/pass for the subscribe handler. `secrets.sample.php` documents the keys with empty values and is committed. `.gitignore` must include `inc/secrets.php` and `data/`.
- `head.php` reads `$page` and emits the full `<head>` (Section 12 + 14), then `require`s `header.php`. `footer.php` emits the footer, the analytics snippet, `assets/js/site.js`, and closes the document.
- **All dynamic output is escaped** with `htmlspecialchars(..., ENT_QUOTES, 'UTF-8')`. Provide one helper `function e($s){ return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }` in `config.php` and use it on every interpolated value.

### 6.3 What must NOT happen
- No secrets in committed files. No personal email addresses in the repo (use `hello@bettersearchlab.com`).
- No external JS/CSS/font CDNs — self-host everything (fonts, CSS, JS). The only permitted third-party network call is the analytics beacon (Section 15).
- No inline event handlers; `site.js` attaches listeners. Content Security Policy is set in `.htaccess` (Section 16) and the code must satisfy it.

---

## 7. Design system — "Daylight" (shared with the product)

The product already looks like mobbin: light, near-monochrome, quiet, with colour reserved for data. The site **is the same system**, so product and marketing feel like one thing. Pull these tokens verbatim into `:root` in `styles.css`.

### 7.1 Colour tokens

```css
:root{
  /* Cool-gray neutral ramp (50 lightest → 950 ink) */
  --n-50:#f6f7f9; --n-100:#eef0f3; --n-200:#e7e9ee; --n-300:#d9dce3;
  --n-400:#b8bec9; --n-500:#8b93a0; --n-600:#6b7280; --n-700:#565e6b;
  --n-800:#2b313b; --n-900:#161a20; --n-950:#0c0f14;

  /* Evergreen — DATA ONLY, never brand chrome */
  --accent:#157f5c; --accent-strong:#10684c; --accent-tint:#e9f4ef;
  --at-risk:#b7791f; --at-risk-tint:#f7f0e2;
  --up:#157f5c; --down:#c24457;

  --ground:var(--n-50); --ink:var(--n-900); --hairline:var(--n-200);
  --radius:12px;
  --shadow-1:0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.04);
  --shadow-pop:0 4px 14px rgba(16,24,40,.08);
  --maxw:1120px;
}
```

**Colour law (non-negotiable):** the page is neutral. Evergreen `--accent` appears **only on data** — a positive delta, a KD-easy pill, a tiny "live" dot, a sparkline stroke, a link underline on hover. Buttons, headings, nav, and section chrome are **ink/neutral**, never green. This is the single rule that most separates this site from generic SaaS pages. `--at-risk` (amber) and `--down` (rose) are also data-only.

**Theme:** the site is **light only** (the product is `color-scheme: light`). Set `color-scheme: light` and paint `body{background:var(--ground); color:var(--ink);}` explicitly. Do not build a dark theme.

### 7.2 Typography

- **Typeface:** **Hanken Grotesk**, self-hosted `.woff2` (weights 400/500/600/700; do **not** use Google Fonts CDN — self-host for speed, privacy, and no consent concern). Fallback stack: `"Hanken Grotesk", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. `font-display:swap`. `<link rel="preload">` the 400 and 600 files.
- **No second typeface.** One confident sans carries the whole site (this is a mobbin trait and an anti-tell — no serif display face).
- **Numerals:** any figure that sits in a row uses `font-variant-numeric: tabular-nums; letter-spacing:-.01em;` (class `.tnum`). This is the product's signature and it must show up on the metric strip and cost figures.
- **Type scale (rem, 16px base):** display 3.25 / h1 2.5 / h2 1.75 / h3 1.25 / body 1.0625 / small .9375 / eyebrow .6875. Line-height 1.15 for display/headings, 1.6 for body. Headings `text-wrap:balance`. Body measure capped ~68ch.
- **Eyebrow label (reused product motif):** `.eyebrow{ font-size:.6875rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--n-500); }`. Use it above section headings and as the `SEARCH & GEO VISIBILITY` lockup line.
- **Weights:** headings 600–700, body 400, UI labels 500. Never lighter than 400.

### 7.3 Layout & spacing

- Centered content column, `max-width:var(--maxw)`, `padding-inline: clamp(20px, 5vw, 40px)`.
- **8px spacing base.** Section vertical rhythm: `clamp(64px, 9vw, 120px)` top/bottom. Never cramped — whitespace is the aesthetic.
- **Left-aligned, asymmetric.** Do **not** center every block. Heros and sections are left-aligned with content set against generous right-side space or a screenshot. (Centered-everything is an AI-tell.)
- Grid via CSS grid/flex + `gap`; never per-element margins that collide.
- Hairline dividers (`1px solid var(--hairline)`) do a lot of the structural work — not shadows on everything.

### 7.4 Components

- **Buttons.** Primary = solid ink (`background:var(--n-900); color:#fff; border-radius:8px; padding:.7rem 1.15rem; font-weight:600;`). Secondary = white with hairline border + ink text. Hover: primary lightens to `--n-800`; secondary border darkens. Focus-visible: `outline:2px solid var(--n-900); outline-offset:2px;`. Never a green button. Never a gradient button.
- **Panel/card.** `background:#fff; border:1px solid var(--hairline); border-radius:var(--radius); box-shadow:var(--shadow-1);`. Use cards sparingly — "not everything is a card." Feature rows can be plain blocks separated by hairlines. Do **not** stamp a radius+shadow on every element, and **no accent bar/rail on cards** (that combo is a known AI-tell).
- **Screenshot frame.** Real screenshot inside a device-neutral frame: white, `border:1px solid var(--hairline); border-radius:var(--radius); box-shadow:var(--shadow-pop);` with a slim top bar of three neutral dots (window chrome). Always `width`/`height` set (no layout shift), `loading="lazy"` below the fold, `srcset` for 1x/2x.
- **Metric strip (signature element, HTML not image).** A single row of the product's Overview metrics — Clicks, Impressions, Avg position, Sessions, Engagement, Conversions — each as a small label + big `.tnum` value + a tiny delta in `--up`/`--down`. **Numbers must be real:** read the current values from the live demo (`DEMO_URL` → Overview) and caption the strip "From the live demo →" linking to it. Never invent these numbers. On mobile it becomes a 2- or 3-column grid; dividers only at the single-row breakpoint (`@media (min-width:900px)`), never on the wrapped grid.
- **Code block.** Dark-neutral surface (`--n-950` bg, `--n-100` text) OR light hairline surface — pick the light hairline surface to stay on-theme: `background:var(--n-100); border:1px solid var(--hairline); border-radius:8px; padding:1rem 1.1rem; font-family:ui-monospace, "SF Mono", monospace; overflow-x:auto;`. A **Copy** button sits top-right (JS in Section 15). The command text lives once in `config.php` (`INSTALL_CMD`).
- **Link style.** Ink text; underline appears/thickens on hover using `--accent` as the underline colour (data-colour used as an interaction whisper). Visited = same.
- **Pills/badges** (KD-easy, "free", "AGPL"): small, uppercase, `--accent-tint`/`--n-100` background with matching text; used only where they encode real state.

### 7.5 Motion (restrained)

- One tasteful page-load reveal: sections fade/rise from a **visible** resting state — never park content at `opacity:0` waiting on scroll (thumbnails and no-JS users must see everything). Prefer CSS `@keyframes` on load; if using IntersectionObserver, elements start visible and the observer only adds a subtle transform.
- Hover micro-interactions on buttons/links/cards only. No parallax, no autoplaying carousels, no animated gradient backgrounds.
- Respect `@media (prefers-reduced-motion: reduce)` — disable transitions/animations.

### 7.6 Responsive

Breakpoints: base (mobile-first) → `600px` → `900px` → `1120px`. Nav collapses to a hamburger below `760px`. Everything reflows to a single column on mobile; screenshots scale to full width; the page body never scrolls horizontally (wide code/tables get their own `overflow-x:auto`).

---

## 8. The AI-tell blocklist (read twice)

The single hardest requirement: **this site must not read as AI-generated.** That has two halves — how it looks, and how it talks. Both matter, and the copy half matters double because the product forbids fake data, so its website must be equally honest.

### 8.1 Visual tells — FORBIDDEN

- Warm cream `#F4F1EA` grounds, serif display faces, terracotta accents. (Not our palette.)
- Near-black backgrounds with a lone acid-green or vermilion "pop." (Our green is a muted evergreen used only on data, never a neon pop, never on chrome.)
- Purple→blue (or any) gradient hero. **No gradients anywhere.**
- Glassmorphism, frosted blur panels, 3D bevels, neumorphism, drop-shadowed glows.
- Everything centered in one narrow column. (We are left-aligned and asymmetric.)
- `border-radius` + shadow stamped on every block; an accent bar/rail down the side of rounded cards.
- Emoji as section markers or bullets. **No emoji anywhere** in UI or copy.
- Inter or Space Grotesk as the typeface. (We use Hanken Grotesk.)
- Three identical icon-topped feature cards in a row as the only structural device.
- Generic abstract hero illustrations (blobs, orbits, floating UI cards, isometric people).
- Stock "dashboard-in-a-laptop" mockups. (We use the real product screenshots.)
- A logo cloud of company logos we have no relationship with.

### 8.2 Copy / voice tells — FORBIDDEN

- Hype verbs and empty intensifiers: *supercharge, unlock, unleash, revolutionize, effortlessly, seamlessly, game-changing, cutting-edge, next-level, elevate, empower, harness the power of, take it to the next level.*
- "In seconds" / "in minutes" as a reflexive closer (we give the real ~5-minute setup once, with the real cost).
- Fabricated social proof: testimonials, star ratings, "trusted by 10,000 marketers," user counts, review quotes — **none of these exist; do not invent them.**
- Vague benefit-speak with no specifics ("drive more traffic," "boost your rankings"). Replace with the concrete mechanism ("a weekly shortlist of striking-distance keywords").
- Perfectly parallel triads and the rule-of-three cadence in every heading.
- Rhetorical-question subheads ("Ready to grow?"), and "Whether you're X or Y…" openers.
- Em-dash-heavy breathless sentences; exclamation marks; ALL-CAPS shouting (the one uppercase use is the small eyebrow label).
- "As a self-hosted solution, Better Search Lab leverages…" — no "leverage," no "solution," no "utilize." Say "tool" and "uses."

### 8.3 Do instead

Write like the README already does: plain, specific, quietly confident, occasionally dry. Lead with the concrete thing (a real command, a real number, a real tool name — Perplexity/ChatGPT/Gemini, DataForSEO, $0.37). Let specificity be the persuasion. If a sentence would survive being fact-checked against the product, keep it; if it is decoration, cut it.

---

## 9. Voice & copy guide

**Voice:** an experienced engineer who ships, explaining their own tool to a peer. Honest about costs and limits. No marketing gloss. Short declarative sentences. American spelling. Sentence case for headings (not Title Case, not ALL CAPS).

**Reusable proof points (drop these in verbatim where relevant):**
- "Self-hosted. Your data stays on your server."
- "Pay-as-you-go, no credit system. An honest cost meter shows every cent."
- "About $0.37 in DataForSEO spend to map a 150-keyword site."
- "Rank tracking in Google — and visibility in Perplexity, ChatGPT and Gemini."
- "A weekly opportunity engine: striking distance, decay, momentum, gaps, SERP features, cannibalization, CTR gaps — scored and explained."
- "AGPL-3.0. Free and open source. No seats, no lock-in."
- "One command to run it. Or click through the live demo first."

**Do-not-say list:** solution, leverage, utilize, seamless, effortless, supercharge, unlock, empower, revolutionize, robust, world-class, cutting-edge, best-in-class.

**Numbers are always `.tnum` and always real.** If you cannot verify a number against this spec or the live demo, do not print it.

---

## 10. Page-by-page specification (with final copy)

Copy below is the **copy to ship**. Where alternates are listed, the owner may swap; ship the first one by default. Do not paraphrase into hype. All headings are sentence case.

### 10.1 Home (`index.php`)

Sections, in order:

**A. Hero** (left-aligned; content left, screenshot right on ≥900px; stacked on mobile)
- Eyebrow: `SEARCH & GEO VISIBILITY`
- H1 (ship this): **"Your search visibility. Your AI visibility. Your server."**
  - Alternates: "See where you rank — in Google and in AI answers." / "The self-hosted SEO tool that tells you the truth."
- Subhead: "Better Search Lab is a self-hosted tool for rank tracking, keyword and competitor research, site audits, and backlinks — with a weekly opportunity engine that turns it all into a short list of what to do next, and AI-visibility scans across Perplexity, ChatGPT and Gemini. Powered by DataForSEO on pay-as-you-go pricing, with an honest cost meter. AGPL-licensed. No seats, no credits, no lock-in."
- Buttons (co-equal): **Try the live demo** (primary ink, → `DEMO_URL`, `target="_blank" rel="noopener"`) · **Self-host in one command** (secondary, → `/install`)
- Honest-cost line beneath buttons: "About **$0.37** in DataForSEO spend to map a 150-keyword site. See the exact costs →" (link → `/install#costs`)
- Hero visual: `assets/img/overview-*.png` (the real Overview screenshot) in a screenshot frame.

**B. Metric strip** (signature; real demo numbers, `.tnum`)
- Six metrics from the product Overview: Clicks · Impressions · Avg position · Sessions · Engagement · Conversions. Value + small delta (`--up`/`--down`).
- Caption: "From the live demo →" (→ `DEMO_URL`). **Read the actual current values off the demo; do not invent.**

**C. The opportunity engine** (the heart of the product; screenshot right/left alternating)
- Eyebrow: `THE WEEKLY SHORTLIST`
- H2: "It doesn't just show you data. It tells you what to do."
- Body: "Every week Better Search Lab scores your whole site and hands you a ranked shortlist: striking-distance keywords, decaying pages, momentum, competitor gaps, SERP features, cannibalization, and CTR gaps. Each item is explained and grounded in your real Search Console data — so you act instead of stare at charts."
- Visual: `opportunities-*.png` framed. Link: "See all opportunity types →" → `/features#opportunities`.

**D. Feature grid** (plain blocks separated by hairlines — NOT identical icon cards)
- Eyebrow: `WHAT'S INSIDE` · H2: "One place for the whole picture."
- Six to eight short items, each a bold label + one plain sentence (pull from Section 2). E.g.:
  - **Rankings & keywords** — Daily positions with history, the SERP features you own, and bulk keyword management.
  - **Research** — Keyword research and a fast keyword-overview tool.
  - **Competitors** — Up to five per site, suggested from real overlap; their keywords, top pages, and your gaps.
  - **Backlinks, audit, organic** — Backlink snapshots with trends, a free on-page audit from the built-in crawler, and organic keyword lists.
  - **Search Console & Analytics** — Google Search Console and GA, connected in one place.
  - **AI visibility** — Weekly scans of Perplexity, ChatGPT and Gemini: are you named, are you cited, and who is instead.
- Footer link: "Explore every feature →" → `/features`.

**E. How it works** (3 numbered steps — numbering is legitimate here because it is a real sequence)
1. **Run one command.** `curl -fsSL …/install.sh | sh` starts Postgres, the app, and the worker on your machine. (Show the real command in a copy block; value from `INSTALL_CMD`.)
2. **Connect DataForSEO.** First run walks you through setup, profiles your site, and suggests competitors. A $5 balance is plenty to start.
3. **Get your weekly shortlist.** The worker builds rankings, research, audits, and the opportunity list — and keeps them fresh.

**F. AI visibility** (the GEO half)
- Eyebrow: `GENERATIVE-ENGINE VISIBILITY` · H2: "Rankings are half the story now."
- Body: "Search is moving into AI answers. Better Search Lab scans Perplexity, ChatGPT and Gemini every week for the queries that matter to you — and tells you whether you're named, whether you're cited, and who's getting the mention when you're not."
- Visual: `ai-visibility-*.png` framed.

**G. Integrations** (original diagram, Section 11.1 #4)
- Eyebrow: `CONNECTS TO WHAT YOU ALREADY USE` · H2: "Optional integrations, all yours to configure."
- Body: "DataForSEO is the only thing you need. Everything else is optional and lives under Settings → Integrations: an AI assistant of your choice, Google Search Console and Analytics, Eden AI for the AI-visibility scans, email via Resend or SMTP, the Reddit API, and Apify."
- Visual: the integrations-map diagram (or reuse `integrations-*.png`).

**H. Honest costs** (proof of the honesty claim; real table)
- Eyebrow: `NO CREDITS. NO GUESSING.` · H2: "You pay DataForSEO directly. We show every cent."
- A small `.tnum` table: rank check $0.002/keyword · research & competitor ~$0.012 · backlinks refresh ~$0.06 · first build of a 150-keyword site ~$0.37 · weekly refresh ~$0.34.
- Line: "The in-app Usage page breaks spend down by day and endpoint." Link → `/install#costs`.

**I. For developers** (open source + MCP)
- Eyebrow: `OPEN SOURCE` · H2: "AGPL-licensed, and built to be read."
- Body: "The whole thing is on GitLab under AGPL-3.0. There's also a Model Context Protocol server so your coding agent can query your data read-only — run it straight from the release download with a single `npx` command."
- Buttons: **View source on GitLab** (→ `GITLAB_URL`) · secondary "Also on GitHub" (→ `GITHUB_URL`). Small MCP code block (from Section 2).

**J. FAQ teaser** — 3 questions with short answers (see Section 10.4 for the pool), then "Read the full FAQ →" → `/faq`.

**K. Final CTA band**
- H2: "Look first, or run it now." · Buttons: **Try the live demo** · **Self-host in one command**. One reassurance line: "Free, open source, and yours to keep."

### 10.2 Features (`features.php`)

- Intro: Eyebrow `FEATURES` · H1 "Everything Better Search Lab does." · one-sentence lede (from Section 2).
- Then one **capability row** per area (alternate screenshot left/right; plain blocks, hairline separators). Each row = H2 + 2–3 sentence plain description + the relevant real screenshot + (where useful) the in-product nav labels it covers. Use anchors so Home can deep-link (`#opportunities`, `#ai-visibility`, etc.).
  - **Overview** (`#overview`) — screenshot `overview`. "Your Search Console and Analytics headline, a 'do this next' list, and health tiles — the first thing you see each week."
  - **Opportunities** (`#opportunities`) — screenshot `opportunities`. Full list of the seven opportunity types, each named and explained in one clause. "Scored, explained, and grounded in your real Search Console data."
  - **Rankings & keywords** (`#rankings`) — screenshot `rankings`. Covers nav: Rankings, Keywords, Organic Keywords, Keyword Overview.
  - **Research** (`#research`) — "Keyword research and a fast keyword-overview tool for sizing an idea before you commit."
  - **Competitors** (`#competitors`) — screenshot `competitors`. "Up to five per site, suggested from real overlap; their keywords, their top pages, and the gaps you're missing."
  - **Backlinks, audit & organic** (`#backlinks`) — "Backlink snapshots with trends, a free on-page audit from the built-in crawler, and organic keyword lists."
  - **Search Console & Analytics** (`#google`) — "Connect Google once; your GSC and GA data lands alongside everything else."
  - **AI visibility** (`#ai-visibility`) — screenshot `ai-visibility`. "Weekly scans of Perplexity, ChatGPT and Gemini — named, cited, or neither."
  - **Reddit conversations** (`#reddit`) — "Threads worth joining, judged for fit and drafted with citations."
  - **MCP for agents** (`#mcp`) — the `npx` block; "read-only tools over your own data for Claude Code or any MCP client."
- Close with the Final CTA band (reuse from Home).

### 10.3 Install (`install.php`)

Purpose: remove every excuse. Copy-paste blocks with a Copy button; honest costs.

- Intro: Eyebrow `SELF-HOST` · H1 "Run Better Search Lab in about five minutes." · lede: "Docker and curl are the only requirements. One command creates a folder, generates a secret, starts Postgres, the app, and the worker, and prints the address."
- **One command (recommended)** — copy block `INSTALL_CMD`. Then: "Open `http://localhost:3000`. First run redirects to `/setup`: create your admin account, connect DataForSEO (a $5 balance is plenty), profile your site, and pick competitors. Active time ~5 minutes; ~$0.37 of DataForSEO spend for a 150-keyword site."
- **Just want to look? Demo mode** — copy block `INSTALL_CMD_DEMO`. "A read-only demo with two synthetic sites and ninety days of history — no keys required." Also link the hosted demo: "Or click through the hosted demo, no install →" (`DEMO_URL`).
- **From source** — "Clone the repo, `cp .env.example .env`, set `AUTH_SECRET`, then `docker compose up -d --build`." (code block).
- **Railway** — "The repo ships `railway.json` (web) and `railway.worker.json` (worker)."
- **Bare metal** — "Node 22, pnpm, Postgres 16: `pnpm install && pnpm db:migrate && pnpm build && pnpm start`, plus `pnpm worker`." (code block).
- **Required configuration** — "Only `DATABASE_URL` and `AUTH_SECRET` are required. Every integration is configured in the app; each can also be set by environment variable, and the environment wins."
- **Keeping it updated** — "`docker compose pull && docker compose up -d`, or opt in to hands-off updates with Watchtower." (code block).
- **Costs** (`id="costs"`) — the honest cost table (Section 2 numbers, `.tnum`) + "The in-app Usage page shows spend by day and endpoint."
- Buttons throughout point to `GITLAB_URL` for the repo and `DEMO_URL` for the demo. Close with Final CTA band.

### 10.4 FAQ (`faq.php`) — real Q&A, marked up as FAQPage (Section 14)

Answers are short, self-contained, and quotable (an answer engine should be able to lift any single answer). First sentence of each is a clean definition/answer. Ship these:

1. **What is Better Search Lab?** — "Better Search Lab is a free, self-hosted SEO and AI-search visibility tool. It does rank tracking, keyword and competitor research, site audits, and backlinks, and it runs a weekly opportunity engine that turns your data into a prioritized to-do list. You run it on your own machine or server."
2. **Is it really free?** — "Yes. Better Search Lab is open source under the AGPL-3.0 license. There are no seats, tiers, or credits. You pay only DataForSEO for the search data it fetches, on pay-as-you-go pricing, and the app shows exactly what you spend."
3. **What does it cost to run?** — "You pay DataForSEO directly. A rank check is about $0.002 per keyword, keyword and competitor research about $0.012 per call, and a backlinks refresh about $0.06. Mapping a 150-keyword site the first time costs about $0.37; a weekly refresh about $0.34."
4. **How is this different from Ahrefs, Semrush, or SE Ranking?** — "Those are hosted subscriptions billed per seat per month. Better Search Lab is software you run yourself: your data stays on your server, you pay only the underlying data cost, and you can read and modify the source. It also measures AI-answer visibility, which most classic tools don't."
5. **What do you mean by 'AI visibility' or GEO?** — "GEO is generative-engine optimization — being visible in AI answers. Better Search Lab scans Perplexity, ChatGPT and Gemini each week to check whether your site is named or cited for the queries you care about, and shows who's cited when you aren't."
6. **What do I need to install it?** — "Docker and curl. One command sets up Postgres, the app, and a background worker and prints the address. First run walks you through creating an admin account and connecting DataForSEO."
7. **Where does my data live?** — "On your own machine or server, in your own Postgres database. Better Search Lab is self-hosted; nothing is sent to us. The only outbound calls are to the data providers you connect (DataForSEO and any optional integrations)."
8. **Can I try it without installing anything?** — "Yes. There's a hosted, read-only demo with synthetic sites and ninety days of history, and a one-line demo install if you'd rather run it locally."
9. **Which integrations are supported?** — "DataForSEO is the only requirement. Optional: an AI assistant of your choice, Google Search Console and Analytics, Eden AI (for AI-visibility scans), email via Resend or SMTP, the Reddit API, and Apify. All are configured in the app."
10. **Does it work with my coding agent?** — "Yes. It ships a Model Context Protocol (MCP) server that exposes read-only tools over your data. Run it with a single npx command from the release download and register it with Claude Code or any MCP client."
11. **Can I deploy it to a server or Railway?** — "Yes. Use the one-command Docker install on a VPS, the included Railway configs, or a bare-metal setup with Node 22, pnpm, and Postgres 16."
12. **How do I get updates?** — "Pull the latest images and restart, or opt in to hands-off updates with Watchtower. The app also notices when a newer release is available."
13. **Who makes it?** — "Better Search Lab is built by Harperflow and Hesham and developed in the open on GitLab, with a read-only mirror on GitHub."

- After the list: a short "Still have a question?" line linking to the GitLab issues (`GITLAB_URL/-/issues`) and `hello@bettersearchlab.com`.

### 10.5 Privacy (`privacy.php`)

Short, human, honest. Sections:
- **What this page covers** — "This is the privacy statement for the marketing website bettersearchlab.com. The Better Search Lab application is self-hosted: when you run it, your data lives on your own server and never reaches us."
- **Email** — "If you enter your email to get release updates, we store it to email you about Better Search Lab releases and nothing else. No third-party marketing, no selling, ever. Ask us to remove it any time at hello@bettersearchlab.com."
- **Analytics** — "We use privacy-friendly, cookieless analytics to count visits and see which pages are useful. It sets no cookies, doesn't track you across sites, and doesn't collect personal information — which is why this site has no cookie banner." (If `ANALYTICS_PROVIDER` is later switched to GA4, this section and a consent banner must change — see Section 15.)
- **What we don't do** — "No advertising cookies. No cross-site trackers. No data brokers."
- **Contact** — `hello@bettersearchlab.com`. Last-updated date.

### 10.6 404 (`404.php`)

Ink heading "That page moved or never existed." + one plain line + two links: "Go home" (`/`) and "Try the live demo" (`DEMO_URL`). Set via `.htaccess` `ErrorDocument 404 /404.php`. Must send a real 404 status (`http_response_code(404)` at top).

---

## 11. Assets

### 11.1 Generate these (original) — with anti-tell constraints

All generated art obeys the Daylight palette (Section 7.1), is **flat and geometric**, uses **no gradients, no glassmorphism, no 3D, no emoji, no stock-illustration tropes**, and is delivered as **SVG where possible** (crisp, tiny, theme-consistent). Evergreen `--accent` appears only as a data/whisper accent, never as fill for the whole mark.

1. **Wordmark + logo mark.**
   - Wordmark: "Better Search Lab" set in Hanken Grotesk 600, tight tracking, ink (`--n-900`).
   - Mark (ship direction): a compact, geometric glyph suggesting *signal rising / visibility* — e.g. an ascending set of three quantized bars where the tallest doubles as a text-caret/position marker, ink with a single evergreen accent stroke on the leading edge. **Avoid:** magnifying glass, bullseye/target, rocket, brain, globe, gradient orb, generic bar-chart-in-a-circle.
   - Deliver as SVG (horizontal lockup + mark-only), plus the mark exported for favicons.
2. **Favicon set** from the mark: `favicon.ico` (32+16), `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` (+ maskable), referenced by `site.webmanifest`. Simple ink mark on transparent (and a solid `--ground` maskable variant).
3. **Social share images (Open Graph, 1200×630)** in `assets/og/`: one strong default (`default.png`) — `--ground` background, ink wordmark, the `SEARCH & GEO VISIBILITY` eyebrow, the H1 line, and a sliver of the Overview screenshot at the edge. Optional per-page variants (`home.png`, `features.png`, `install.png`, `faq.png`) reusing the layout with the page's H1. No gradients, no stock imagery.
4. **Diagrams (SVG):**
   - *How it works* — three quantized steps (install → connect DataForSEO → weekly shortlist), hairline connectors, ink labels.
   - *Integrations map* — Better Search Lab at center, DataForSEO emphasized as the backbone, the optional integrations (Google GSC/GA, Eden AI, AI assistant, Email, Reddit, Apify) as hairline-connected nodes. Neutral nodes; accent only on the DataForSEO/backbone edge.

### 11.2 Reuse these (real product truth — do not fabricate)

Six real screenshots already exist at `docs/screenshots/` in the product repo at 2880×1800:
`overview.png`, `opportunities.png`, `rankings.png`, `competitors.png`, `ai-visibility.png`, `integrations.png`.
- Copy them into `assets/img/` and produce web-optimized responsive sizes: a `@1x` (~1200w) and `@2x` (~2400w) WebP (with PNG fallback), plus set explicit `width`/`height`. Keep the real numbers intact — never retouch figures.
- If newer/cleaner captures are wanted, recapture from the live demo (`DEMO_URL`) at 1440×900@2x, but the numbers must remain the demo's real values.

### 11.3 Fonts

Self-host Hanken Grotesk `.woff2`, weights 400/500/600/700, subset to Latin. Place in `assets/fonts/`, declare with `@font-face` + `font-display:swap`, preload 400 and 600. (Do not hotlink Google Fonts.)

---

## 12. SEO plan (classic search)

- **Semantic HTML5:** one `<h1>` per page; logical heading order; `<header><nav><main><section><article><footer>`; a skip-link to `#main`; descriptive `alt` on every image; descriptive anchor text (never "click here").
- **Per-page metadata** (from each page's `$page` array). Unique title + description:

  | Page | `<title>` | Meta description |
  |---|---|---|
  | Home | Better Search Lab — self-hosted SEO & AI-search visibility | Self-hosted SEO tool: rank tracking, keyword & competitor research, audits, backlinks, a weekly opportunity engine, and AI-visibility scans across Perplexity, ChatGPT & Gemini. Free, open source. |
  | Features | Features — Better Search Lab | Everything Better Search Lab does: opportunities, rankings, research, competitors, backlinks, audits, Search Console, Analytics, AI visibility, and an MCP server. |
  | Install | Install & self-host — Better Search Lab | Run Better Search Lab in ~5 minutes with one command. Docker + curl. Honest DataForSEO costs (~$0.37 to map a 150-keyword site). Railway and bare-metal too. |
  | FAQ | FAQ — Better Search Lab | Answers on cost, self-hosting, AI visibility, integrations, the MCP server, and how it compares to hosted SEO subscriptions. |
  | Privacy | Privacy — Better Search Lab | How the Better Search Lab website handles email and cookieless analytics. The app is self-hosted; your data stays on your server. |

- **Canonical:** every page emits `<link rel="canonical" href="SITE_URL + path">` (apex, no trailing slash).
- **Open Graph + Twitter:** `og:type=website`, `og:site_name`, `og:title`, `og:description`, `og:url`, `og:image` (per-page from `$page['og_image']`, 1200×630, with `og:image:width/height`); `twitter:card=summary_large_image`, `twitter:title/description/image`.
- **`sitemap.xml`** — static, lists the five pages with `<lastmod>`; referenced from `robots.txt`.
- **`robots.txt`** — allow all, point to sitemap, and explicitly welcome AI crawlers (Section 13).
- **Internal linking:** Home deep-links into Features anchors; Features and Install cross-link; FAQ links to Install and the demo. Footer links every page.
- **Performance budget (target Lighthouse ~100):** total initial payload well under budget; one CSS file (minified), one small JS file (`defer`), self-hosted subset fonts (preload), lazy-loaded below-fold images with `srcset`/WebP and explicit dimensions (no CLS), no render-blocking third-party resources. HTTP caching + compression via `.htaccess` (Section 16).
- **Accessibility (WCAG AA):** ink-on-ground contrast passes; visible `:focus-visible`; keyboard-operable nav/menu/copy-button/form; `prefers-reduced-motion` honored; form inputs have labels; images have alt text.

---

## 13. GEO / AEO plan (be quotable by AI answer engines)

- **`llms.txt` at the site root** — a plain-text summary LLMs can read. Ship this content (update the year/links as needed):
  ```
  # Better Search Lab
  > A free, self-hosted SEO and AI-search (GEO) visibility tool. Rank tracking,
  > keyword and competitor research, site audits, backlinks, a weekly opportunity
  > engine, and AI-visibility scans across Perplexity, ChatGPT and Gemini.
  > Open source (AGPL-3.0). Powered by DataForSEO, pay-as-you-go, with an honest
  > in-app cost meter. You run it yourself; your data stays on your server.

  ## Key facts
  - License: AGPL-3.0-only. Free. No seats, tiers, or credits.
  - Install: one command (Docker + curl). ~5 minutes. ~$0.37 DataForSEO spend to map a 150-keyword site.
  - AI visibility: weekly scans of Perplexity, ChatGPT, Gemini (named / cited / neither).
  - Opportunity types: striking distance, decay, momentum, competitor gaps, SERP features, cannibalization, CTR gaps.
  - Integrations: DataForSEO (required), Google Search Console + Analytics, Eden AI, an AI assistant, Email (Resend/SMTP), Reddit, Apify.
  - MCP server: read-only tools over your data via npx.

  ## Links
  - Live demo: https://thefamoushesham-better-search-lab-demo.hf.space
  - Source (GitLab, canonical): https://gitlab.com/betterbrainlab/better-search-lab
  - Source (GitHub mirror): https://github.com/Heshamus/better-search-lab
  - Install & costs: https://bettersearchlab.com/install
  - FAQ: https://bettersearchlab.com/faq
  ```
- **`robots.txt`** must allow the major AI crawlers explicitly (so we can be cited):
  ```
  User-agent: *
  Allow: /

  User-agent: GPTBot
  Allow: /
  User-agent: OAI-SearchBot
  Allow: /
  User-agent: ChatGPT-User
  Allow: /
  User-agent: ClaudeBot
  Allow: /
  User-agent: Claude-Web
  Allow: /
  User-agent: PerplexityBot
  Allow: /
  User-agent: Google-Extended
  Allow: /

  Sitemap: https://bettersearchlab.com/sitemap.xml
  ```
- **Answer-shaped content (AEO):** the FAQ (Section 10.4) uses question H2/H3s and definition-first answers, marked up as `FAQPage`. Keep each answer self-contained (no "as mentioned above"), so a single answer is liftable. Home's "What is Better Search Lab?" framing and the FAQ's first answer both open with a clean, quotable definition sentence.
- **Fresh, dated content:** emit `dateModified` in the `WebSite`/`SoftwareApplication` schema and `<lastmod>` in the sitemap.

---

## 14. Structured data (JSON-LD) — exact blocks

`inc/schema.php` provides `function emit_jsonld(array $d){ echo '<script type="application/ld+json">' . json_encode($d, JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT) . '</script>'; }`. `head.php` calls it for `$page['jsonld']` (an array of one or more graph objects).

- **Every page:** `Organization` (or `WebSite`) —
  ```json
  {"@context":"https://schema.org","@type":"Organization","name":"Better Search Lab",
   "url":"https://bettersearchlab.com","logo":"https://bettersearchlab.com/assets/img/logo.png",
   "sameAs":["https://gitlab.com/betterbrainlab/better-search-lab","https://github.com/Heshamus/better-search-lab"]}
  ```
- **Home:** add `SoftwareApplication` —
  ```json
  {"@context":"https://schema.org","@type":"SoftwareApplication","name":"Better Search Lab",
   "applicationCategory":"BusinessApplication","operatingSystem":"Docker, Linux, macOS, Windows",
   "description":"Self-hosted SEO and AI-search visibility tool: rank tracking, research, competitors, audits, backlinks, a weekly opportunity engine, and AI-visibility scans.",
   "offers":{"@type":"Offer","price":"0","priceCurrency":"USD"},
   "license":"https://www.gnu.org/licenses/agpl-3.0.html",
   "url":"https://bettersearchlab.com","softwareHelp":"https://bettersearchlab.com/install"}
  ```
- **FAQ:** `FAQPage` with every Q&A from Section 10.4 as `mainEntity` `Question`/`acceptedAnswer` pairs (text must match the visible copy).
- **Features / Install / Privacy:** add `BreadcrumbList` (Home → this page). Optional on Home: none.
- Validate all output against Google's Rich Results Test and schema.org before done.

---

## 15. Backend: email capture + analytics

### 15.1 The subscribe form (front end)

A single low-key "release updates" form, in the footer (and optionally the Home final CTA). Honest framing: "Get an email when there's a new release. Nothing else." No "join thousands," no incentives.

```html
<form id="subscribe" action="/subscribe" method="post" novalidate>
  <label for="sub-email" class="eyebrow">Release updates</label>
  <div class="subscribe-row">
    <input id="sub-email" name="email" type="email" required autocomplete="email"
           placeholder="you@example.com" inputmode="email">
    <!-- honeypot: real users never fill this; hidden from view + a11y -->
    <input type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp">
    <input type="hidden" name="t" value="">           <!-- JS sets this to ms elapsed since page load -->
    <button type="submit">Notify me</button>
  </div>
  <p class="subscribe-msg" role="status" aria-live="polite"></p>
</form>
```
- `.hp{ position:absolute; left:-9999px; }` (off-screen, not `display:none`).
- Progressive enhancement in `site.js`: on submit, `fetch('/subscribe', {method:'POST', body:FormData})`, prevent default, show the JSON `message` in `.subscribe-msg`. **Without JS**, the plain POST still works and `subscribe.php` redirects back with `?subscribed=1` (or `?error=...`) which the footer reads to show a message.

### 15.2 `subscribe.php` (contract)

Behavior, in order:
1. Reject non-POST with `405`.
2. Honeypot: if `company` is non-empty → respond `200` success (silently drop; don't tell the bot).
3. Timing: JS sets `t` to milliseconds elapsed since page load at submit; if `t` is present and < 2000 → treat as bot (silently drop). Missing `t` is allowed (no-JS users). Using elapsed time keeps this server-clock-independent.
4. Validate `email` with `filter_var($email, FILTER_VALIDATE_EMAIL)`; on failure return `422` + `{"ok":false,"message":"That email doesn't look right."}`.
5. Rate-limit: max ~5 posts/IP/hour (a simple file/APCu counter). Over limit → `429` + friendly message.
6. **Store first (source of truth):** append `timestamp,email,ip_hash` to `data/subscribers.csv` with an exclusive lock (`fopen`/`flock`). `data/` is outside links and denied by `.htaccess`. De-dupe is not required (dedupe later).
7. **Notify (fail-soft):** try to email `CONTACT_EMAIL` via SMTP (PHPMailer, vendored at `inc/lib/PHPMailer/`, creds from `secrets.php`). If sending throws, **swallow the error** — the signup is already saved; the user still sees success. (Mirrors the product's fail-soft principle.)
8. Respond: JSON `{"ok":true,"message":"You're on the list. We'll only email about releases."}` for fetch; for a plain form post, `303` redirect to `/#subscribe?subscribed=1`.
9. All output escaped; no notice/warning leakage; `error_reporting` off in production.

`secrets.sample.php` keys: `SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE`. Real `secrets.php` is created on the server only, gitignored.

### 15.3 Analytics + consent stance

- **Default (`ANALYTICS_PROVIDER='plausible'`):** cookieless, privacy-friendly analytics loaded as one small async `defer` script in `footer.php`, scoped to `ANALYTICS_DOMAIN`. It sets **no cookies** and collects **no personal data**, so **no cookie-consent banner is required** and none is built. Self-hosting the analytics or using the hosted script are both fine; the script host must be added to the CSP (Section 16).
- **Fallback (`ANALYTICS_PROVIDER='ga4'`):** if the owner later chooses GA4 (which uses cookies), the implementer must add a minimal consent banner that blocks GA until consent, and update the Privacy page. Do **not** ship GA4 without that. Ship `plausible` by default.
- **`'none'`:** emit no analytics.

---

## 16. Security, headers, caching (`.htaccess`)

`.htaccess` at web root handles routing, canonical redirects, security headers, caching, and denials. Requirements (Apache/LiteSpeed on Hostinger):

- **HTTPS + apex canonical:** 301 `http://` → `https://`, and `www.` → apex `bettersearchlab.com`.
- **Clean URLs:** rewrite `/features` → `features.php` (etc.); 301 any `/*.php` request to the extensionless URL; strip trailing slashes.
- **Custom 404:** `ErrorDocument 404 /404.php`.
- **Deny sensitive paths:** return 403/404 for `/inc/`, `/data/`, `secrets.php`, dotfiles.
- **Security headers:**
  ```
  Header set X-Content-Type-Options "nosniff"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
  Header set X-Frame-Options "DENY"
  Header set Strict-Transport-Security "max-age=31536000; includeSubDomains" env=HTTPS
  Header set Permissions-Policy "geolocation=(), microphone=(), camera=(), interest-cohort=()"
  Header set Content-Security-Policy "default-src 'self'; script-src 'self' https://plausible.io; connect-src 'self' https://plausible.io; img-src 'self' data:; style-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  ```
  (Adjust the analytics host in `script-src`/`connect-src` to the chosen provider; if self-hosting analytics, use that host. **No `'unsafe-inline'`** — so no inline styles/scripts; JSON-LD `type="application/ld+json"` is data and is allowed.)
- **Caching + compression:** long `Cache-Control`/`Expires` for `assets/*` (fonts, css, js, images, immutable with hashed names or 1-year for static), short/no-cache for HTML; enable gzip/brotli via `mod_deflate` where available.

---

## 17. Deployment to Hostinger

1. **Domain & SSL:** point `bettersearchlab.com` at the Hostinger plan; issue the free SSL certificate in hPanel; enable "force HTTPS."
2. **Mailbox:** create `hello@bettersearchlab.com`; note its SMTP host/port/user/pass for `secrets.php`.
3. **Upload:** put the site in `public_html/` (hPanel File Manager, SFTP, or the plan's git deploy). Keep `inc/` and `data/` inside `public_html/` but denied by `.htaccess` (or above web root if the plan allows — `.htaccess` denial is the baseline).
4. **Secrets:** copy `inc/secrets.sample.php` → `inc/secrets.php` on the server and fill SMTP creds. Never commit it.
5. **Permissions:** ensure `data/` is writable by PHP (e.g. 0755 dir, 0644 file) so `subscribers.csv` can be created.
6. **Verify:** load all five pages over HTTPS; confirm apex/www + http redirects; submit the form (check CSV append + notification email + fail-soft when SMTP is off); run Lighthouse; validate schema (Rich Results Test) and `robots.txt`/`sitemap.xml`/`llms.txt`; confirm CSP has no console violations.
7. **Search:** submit `sitemap.xml` in Google Search Console (and Bing Webmaster Tools). Confirm `llms.txt`, `robots.txt`, and favicons resolve.

---

## 18. Definition of done (acceptance checklist)

- [ ] Five pages + 404 + `subscribe.php` build and render with the exact copy in Section 10.
- [ ] Two co-equal hero CTAs (demo + self-host) present and correct on Home; both resolve.
- [ ] Every product fact/number/URL/command matches Section 2 verbatim; **no invented numbers**; metric strip uses real demo values with a link to the demo.
- [ ] Daylight palette + Hanken Grotesk (self-hosted) applied; evergreen used only on data; light-only.
- [ ] Passes the Section 8 blocklist: no gradients, no emoji, not all-centered, no fake proof, no hype verbs, one typeface.
- [ ] Real screenshots reused (web-optimized, dimensioned, lazy); brand assets generated per Section 11 constraints.
- [ ] SEO: unique title/description per page, canonical (apex), OG/Twitter with 1200×630 image, `sitemap.xml`, semantic HTML, alt text, internal links.
- [ ] GEO/AEO: `robots.txt` welcomes AI crawlers, `llms.txt` present and accurate, FAQ is `FAQPage`-marked and answers are self-contained.
- [ ] JSON-LD validates (Organization + SoftwareApplication + FAQPage + BreadcrumbList) with text matching visible copy.
- [ ] Backend: honeypot + timing + validation + rate-limit + `flock` CSV append + fail-soft SMTP; works with and without JS; escapes all output.
- [ ] Analytics is cookieless (`plausible`) with no cookie banner; Privacy page matches; CSP allows only the analytics host.
- [ ] `.htaccess`: HTTPS + apex redirects, clean URLs, custom 404, denies `/inc` `/data` secrets/dotfiles, security headers + CSP (no `unsafe-inline`), caching/compression.
- [ ] No secrets committed; `inc/secrets.php` + `data/` gitignored; `secrets.sample.php` committed.
- [ ] Lighthouse ~100 (Performance/Accessibility/Best-Practices/SEO) on Home and one interior page; no CSP console errors; body never scrolls horizontally; `prefers-reduced-motion` respected.

---

## 19. Decisions locked (no TBDs)

- **Hero emphasis:** demo + self-host **co-equal** (two primary buttons).
- **Pages:** Home, Features, Install, FAQ, Privacy (+ 404). No blog, no pricing page.
- **Assets:** generate brand (logo/wordmark, favicons, OG, 2 diagrams); reuse the six real screenshots. No synthetic product shots.
- **Backend:** email capture (`subscribe.php`, fail-soft) **on**; analytics **on** and **cookieless by default** (`plausible`), so **no cookie banner**. GA4 is a documented, banner-requiring fallback, not shipped.
- **Contact address:** `hello@bettersearchlab.com` (role mailbox), never a personal address.
- **Fonts:** Hanken Grotesk, self-hosted `.woff2` (not a CDN).
- **Canonical host:** apex `https://bettersearchlab.com`.
- **Repo framing:** GitLab canonical/primary; GitHub "also on GitHub" secondary.

---

*Companion facts an implementer will want in one place:* tagline "Search & GEO visibility"; install `curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh` (append ` -s -- --demo` for demo mode); demo `https://thefamoushesham-better-search-lab-demo.hf.space`; GitLab `https://gitlab.com/betterbrainlab/better-search-lab`; GitHub `https://github.com/Heshamus/better-search-lab`; built by Harperflow (harperflow.io) + Hesham (hesham.us); AGPL-3.0-only; DataForSEO pay-as-you-go, ~$0.37 to map a 150-keyword site.
