# Daylight Light Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the whole Better Search Lab web app from the dark "Signal" design system to the light, near-monochrome, mobbin-inspired "Daylight" system — appearance only, no behaviour/data/route/copy changes.

**Architecture:** Redefine the shared design tokens and base layer in `src/app/globals.css` (flip `color-scheme` to light, redirect the neutral ramp to the conventional light direction, demote green to a data/whisper accent), swap the UI typeface to Hanken Grotesk, then migrate every page and component off the dark-assuming utility classes per the spec's migration table. The neutral ramp is redefined in place, so many classes change value without changing name; others (`text-white`, `bg-neutral-950`, `bg-accent` CTAs) must be swapped. Correctness is verified per screen against the approved prototype plus a repo guard that the dark remnants are gone.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind v4 (`@theme`/`@utility` in `globals.css`), Vitest 4 (jsdom per-file for component tests), `@fontsource-variable/hanken-grotesk` (bundled, offline-safe), `geist/font/mono` (retained for code blocks only).

**Spec:** `docs/superpowers/specs/2026-09-10-daylight-light-redesign-design.md` — read it before starting. Its palette, typography, component conventions, and migration table are the authority. **Visual reference (source of truth where it and the spec disagree):** the Overview prototype at https://claude.ai/code/artifact/a8203e2f-7a76-4e5c-9d78-022d31dbc876

## Global Constraints

Every task's requirements implicitly include this section.

- **Light only.** No dark-mode toggle, no `data-theme`. `color-scheme: light`. Do not add a theme layer.
- **Appearance only.** Do not change routes, nav structure, component props, data flow, copy text, or what any page shows. Only type/colour/spacing/class treatment changes. If a change would alter behaviour or copy, stop and rule per subagent-driven-development.
- **Colour carries data, not brand.** Primary actions and active nav are ink (`neutral-900`). Green (`--color-accent`, evergreen `#157f5c`) survives only as a whisper (the logo, positive-delta figures) and as the data-positive/`--color-up` value. Everywhere else, former-accent chrome becomes ink or neutral.
- **The neutral ramp is redefined light** (50 lightest `#f6f7f9` → 950 ink `#0c0f14`). A class like `text-neutral-500` keeps its name but renders a new value — verify contrast, don't blindly swap the number.
- **Numerals are sans + `tabular-nums`.** The old mono "instrument" figures are dropped. `.tnum`/`.num` keep their class names; their utility definition drops `font-family: var(--font-mono)`. Geist Mono stays ONLY for literal code blocks (the MCP config snippet).
- **Semantic data classes keep their names.** `text-accent`, `text-at-risk`, `up`, `down`, `kd-easy/medium/hard`, `series-1..4` are re-tuned centrally in `@theme`; do NOT rename or rewrite them at call sites (e.g. leave `text-accent` on a positive delta — it now renders evergreen). This keeps `tests/components/rankings-table.test.tsx` and `tests/components/trend-card.test.tsx` green without edits.
- **Migration mapping (apply in every migration task — Tasks 4–13).** Copied from the spec's "Migration mapping" table:
  | Old (dark assumption) | New | Notes |
  |---|---|---|
  | `text-white` (body text) | `text-neutral-900` | primary text → ink |
  | `text-neutral-100` / `-200` | `text-neutral-900` / `-800` | strong text |
  | `text-neutral-300` / `-400` | `text-neutral-700` / `-600` | secondary text |
  | `text-neutral-500` | `text-neutral-500` | tertiary — keep, verify contrast |
  | `bg-neutral-950` | remove (ground is on `body`) or `bg-neutral-50` | app ground |
  | `bg-neutral-900` / `-800` (surface) | `panel` or `bg-white` | cards |
  | `bg-neutral-800` (hover/fill) | `bg-neutral-100` | subtle fills |
  | `border-neutral-800` / `-700` | `border-neutral-200` / `-300` | hairlines |
  | opacity suffixes on the above (e.g. `/40`, `/60`, `/70`) | drop the suffix; use the solid light token | dark used translucency for depth; light uses solid hairlines/surfaces |
  | `bg-accent` (CTA) | `bg-neutral-900 text-white` (hover `#2a3138`) | ink primary — audit each: CTA vs tint |
  | `bg-accent/10` `/12` `/15` `/20` (tint) | `bg-[--color-accent-tint]` | positive tint only; else `bg-neutral-100` |
  | `text-accent` (positive/active-data) | keep `text-accent` | renders evergreen |
  | `text-accent` (link / active nav / chrome) | `text-neutral-900` | monochrome chrome |
  | `.tnum` / `.num` | unchanged class | utility redefined to sans in Task 2 |
  | `at-risk`, `up`, `down`, `kd-*`, `series-*` | unchanged class | values re-tuned in `@theme` |
- **Per-task gates:** `pnpm exec tsc --noEmit` and `pnpm exec vitest run` must be green after EVERY task. `pnpm build` is run at structural/phase boundaries (end of Tasks 3, 5, 6, 11, 13, 14) — class-only edits can't break the build, so a per-task build is wasteful; a per-task `tsc`+`vitest` is the fast net. `cd mcp && npx vitest run` is unaffected (do not run per task).
- **Visual verification:** each migration task ends with a spot-check of its screen(s) against the prototype (light ground, white hairline cards, ink CTAs, monochrome chrome, sans tabular figures, data-only colour). There is no unit test for "looks right" — the guard test + build + this spot-check are the net.
- **Do not push or redeploy.** Build on the `daylight` branch. The live app, HF demo, and screenshots are untouched until the branch is approved and merged (Task 15 is explicitly post-approval).
- **Commit trailer:** end each commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

**Foundation (own the design system):**
- `src/app/globals.css` — tokens (`@theme`), base layer, `panel`/`eyebrow` utilities, `.tnum`/`.num`. Single source of the palette.
- `src/app/layout.tsx` — root layout; loads fonts, mounts the CSS-var classNames.
- `src/app/icon.svg` — favicon brand mark.
- `src/components/icons.tsx` — `Logo` brand mark + nav icons (icons are `currentColor`-driven).

**App shell & shared primitives:**
- `src/components/app-shell.tsx`, `app-nav.tsx`, `site-switcher.tsx` — the frame + nav.
- `src/components/empty-state.tsx`, `demo-banner.tsx`, `job-progress.tsx`, the `refresh-*-button.tsx` and `run-*-button.tsx` families — shared buttons/chips/banners.

**Data viz:**
- `src/components/charts.tsx`, `viz.tsx`, `dashboard-charts.tsx`, `rank-sparkline.tsx`, `backlinks-trends.tsx`, `health-strip.tsx`.

**Feature pages** (each `src/app/(app)/<route>/page.tsx` + its feature components under `src/components/`) and **auth/settings** (`src/app/(auth)/*`, `src/app/(app)/settings/*`) — enumerated per task below.

**Tests:**
- `tests/repo/daylight.test.ts` (new, Task 1) — foundation invariants.
- `tests/repo/daylight-sweep.test.ts` (new, Task 14) — whole-app "no dark remnants" guard.

---

## Task 1: Daylight foundation guard test

Write the repo guard that locks the foundation end-state. It FAILS now (the app is still dark) and goes green after Tasks 2–3. Repo guards live in `tests/repo/` and run in the default `node` environment (no jsdom docblock needed) — see the existing `tests/repo/*.test.ts`.

**Files:**
- Create: `tests/repo/daylight.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks; it is a standing regression guard.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Daylight foundation", () => {
  const css = read("src/app/globals.css");

  it("uses a light color-scheme, not dark", () => {
    expect(css).toMatch(/color-scheme:\s*light/);
    expect(css).not.toMatch(/color-scheme:\s*dark/);
  });

  it("drops the dark radial-gradient glow from the body ground", () => {
    expect(css).not.toMatch(/radial-gradient/);
  });

  it("redefines the neutral ramp to the light direction (50 lightest, 950 ink)", () => {
    expect(css).toMatch(/--color-neutral-50:\s*#f6f7f9/i);
    expect(css).toMatch(/--color-neutral-900:\s*#161a20/i);
    expect(css).toMatch(/--color-neutral-950:\s*#0c0f14/i);
  });

  it("demotes the accent to evergreen and defines the data + whisper tokens", () => {
    expect(css).toMatch(/--color-accent:\s*#157f5c/i);
    expect(css).toMatch(/--color-accent-tint:\s*#e9f4ef/i);
    expect(css).toMatch(/--color-up:\s*#157f5c/i);
    expect(css).toMatch(/--color-down:\s*#c24457/i);
  });

  it("makes .tnum / .num sans tabular figures (no mono family)", () => {
    // Isolate the .tnum and .num rule bodies and assert neither pins the mono font.
    const tnum = css.match(/\.tnum\s*\{[^}]*\}/)?.[0] ?? "";
    const num = css.match(/\.num\s*\{[^}]*\}/)?.[0] ?? "";
    expect(tnum).not.toMatch(/font-mono/);
    expect(num).not.toMatch(/font-mono/);
    expect(tnum).toMatch(/tabular-nums/);
  });

  it("loads Hanken Grotesk as the UI voice", () => {
    const layout = read("src/app/layout.tsx");
    const combined = css + layout;
    expect(combined).toMatch(/[Hh]anken/);
  });

  it("recolours the favicon off the old dark-navy ground", () => {
    const icon = read("src/app/icon.svg");
    expect(icon).not.toMatch(/#0f172a/i); // old dark chip ground is gone
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm exec vitest run tests/repo/daylight.test.ts`
Expected: FAIL — every assertion trips against the current dark `globals.css`/`layout.tsx`/`icon.svg`.

- [ ] **Step 3: Commit**

```bash
git add tests/repo/daylight.test.ts
git commit -m "test(daylight): guard the light-redesign foundation end-state"
```

---

## Task 2: Daylight tokens + base layer + primitives (`globals.css`)

Replace the Signal palette and base layer with Daylight. Values are verbatim from the spec's "Design tokens" section.

**Files:**
- Modify: `src/app/globals.css` (the whole `@theme`, `@layer base`, and `@utility panel`/`eyebrow` blocks)

**Interfaces:**
- Consumes: `--font-sans`/`--font-mono` mapping wired in Task 3 (this task references them; Task 3 makes `--font-sans` resolve to Hanken).
- Produces: the Daylight token set every later task's classes resolve against; `panel`, `eyebrow`, `.tnum`, `.num` utilities.

- [ ] **Step 1: Replace the `@theme` block** with the Daylight palette

```css
@theme {
  --font-sans: "Hanken Grotesk Variable", ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, "SF Mono", monospace;

  /* Cool-gray neutral ramp — LIGHT direction (50 lightest → 950 ink). */
  --color-neutral-50:  #f6f7f9;
  --color-neutral-100: #eef0f3;
  --color-neutral-200: #e7e9ee;
  --color-neutral-300: #d9dce3;
  --color-neutral-400: #b8bec9;
  --color-neutral-500: #8b93a0;
  --color-neutral-600: #6b7280;
  --color-neutral-700: #565e6b;
  --color-neutral-800: #2b313b;
  --color-neutral-900: #161a20;
  --color-neutral-950: #0c0f14;

  /* Brand: kept only as a data-positive / whisper accent, not chrome. */
  --color-accent: #157f5c;
  --color-accent-strong: #10684c;
  --color-accent-tint: #e9f4ef;
  --color-at-risk: #b7791f;
  --color-at-risk-tint: #f7f0e2;

  /* Data-viz (light-tuned): deltas, KD heat, chart series. */
  --color-up: #157f5c;
  --color-down: #c24457;
  --color-kd-easy: #157f5c;
  --color-kd-medium: #b7791f;
  --color-kd-hard: #c24457;
  --color-series-1: #2f6b5e;
  --color-series-2: #3b7ea4;
  --color-series-3: #7a6cc4;
  --color-series-4: #b7791f;

  --radius-xl: 12px;
  --shadow-1: 0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.04);
  --shadow-pop: 0 4px 14px rgba(16,24,40,.08);
}
```

- [ ] **Step 2: Replace the `@layer base` block** (light ground, no glow, light scrollbars, ink focus, sans figures)

```css
@layer base {
  html {
    color-scheme: light;
  }
  body {
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    background-color: var(--color-neutral-50);
    color: var(--color-neutral-900);
  }

  /* Figures are sans tabular now — aligned columns without the mono instrument look. */
  .tnum {
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1;
    letter-spacing: -0.01em;
  }
  .num {
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1;
    letter-spacing: -0.01em;
  }

  ::selection {
    background: rgba(21, 127, 92, 0.16);
  }

  * {
    scrollbar-width: thin;
    scrollbar-color: #d9dce3 transparent;
  }
  *::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  *::-webkit-scrollbar-thumb {
    background: #d9dce3;
    border: 2px solid transparent;
    background-clip: padding-box;
    border-radius: 9999px;
  }
  *::-webkit-scrollbar-thumb:hover {
    background: #b8bec9;
    background-clip: padding-box;
  }

  :focus-visible {
    outline: 2px solid var(--color-neutral-900);
    outline-offset: 2px;
    border-radius: 4px;
  }
}
```

- [ ] **Step 3: Replace the `@utility` blocks** (white surface, hairline border, soft shadow)

```css
@utility panel {
  background-color: #ffffff;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-1);
}
@utility eyebrow {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-neutral-500);
}
```

- [ ] **Step 4: Update the leading comment** so it describes Daylight, not Signal (replace the "Signal: a precision search-visibility instrument" block with a short Daylight description: light, near-monochrome, green demoted to data, sans tabular figures).

- [ ] **Step 5: Run the guard + full suite**

Run: `pnpm exec vitest run tests/repo/daylight.test.ts && pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: the guard's CSS assertions now PASS except the two font/icon ones (Task 3); `tsc` clean; full suite green (component tests assert copy/structure, not computed colour). If any component test fails, it asserted a class this task didn't touch — investigate, don't mass-edit.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(daylight): Daylight tokens, light base layer, white panel primitives"
```

---

## Task 3: Fonts (Hanken Grotesk) + favicon recolour

Swap the UI typeface to Hanken Grotesk via the bundled Fontsource package (offline-safe, matches the existing `geist` pattern). Recolour the favicon and confirm the `Logo` mark reads on light.

> **Deviation from spec, flagged for the owner:** the spec says "Hanken Grotesk via `next/font/google`". This plan uses `@fontsource-variable/hanken-grotesk` instead, because the repo deliberately bundles fonts (the `geist` package) so the Docker image never fetches fonts at build time, and `--frozen-lockfile` keeps builds reproducible. Same typeface, same self-hosted result, preserved offline build. If the owner wants `next/font/google` regardless, swap Step 2 for a `Hanken_Grotesk` import from `next/font/google` exposing `--font-sans`.

**Files:**
- Modify: `package.json` (add dependency), `src/app/layout.tsx`, `src/app/icon.svg`
- Modify: `src/components/icons.tsx` (verify `Logo` on light)

**Interfaces:**
- Consumes: `--font-sans` mapping from Task 2 (`"Hanken Grotesk Variable"` is first in the stack).
- Produces: Hanken as the resolved UI font app-wide.

- [ ] **Step 1: Add the bundled font**

Run: `pnpm add @fontsource-variable/hanken-grotesk`
Expected: `package.json` + `pnpm-lock.yaml` updated; the package provides the `"Hanken Grotesk Variable"` family via a CSS side-effect import.

- [ ] **Step 2: Wire it in `layout.tsx`** — import the font CSS, keep Geist Mono for code, drop Geist Sans

Replace the font imports and the `<html>` className. The new `layout.tsx` head:

```tsx
import "./globals.css";
import "@fontsource-variable/hanken-grotesk";
import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { StaleBuildReloader } from "@/components/stale-build-reloader";
import { DemoProvider } from "@/components/demo-provider";
import { DemoBanner } from "@/components/demo-banner";
import { isDemoMode } from "@/lib/demo/mode";
```

and the element (only `GeistMono.variable` remains on `<html>`; `--font-sans` now resolves to Hanken from `@theme`):

```tsx
    <html lang="en" className={GeistMono.variable}>
```

Update the layout comment to say Hanken (UI) is bundled via Fontsource and Geist Mono (code) via the `geist` package — both local, so the Docker build never fetches fonts over the network.

- [ ] **Step 3: Recolour the favicon** `src/app/icon.svg` — light/transparent ground, ink bars, one evergreen bar

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="7" fill="#f6f7f9"/>
  <rect x="7" y="18" width="4" height="7" rx="1" fill="#161a20" opacity="0.85"/>
  <rect x="14" y="12" width="4" height="13" rx="1" fill="#161a20" opacity="0.85"/>
  <rect x="21" y="7" width="4" height="18" rx="1" fill="#157f5c"/>
</svg>
```

- [ ] **Step 4: Verify the `Logo` mark on light** — `src/components/icons.tsx` `Logo()` already draws with `var(--color-accent)`, which is now evergreen on a light ground; it reads as the one whisper-green mark. Leave the geometry unchanged. Only bump the container legibility if needed: the `fillOpacity="0.12"` tint on white is faint but intentional (whisper) — keep it. Do NOT introduce new colours here.

- [ ] **Step 5: Run the guard + build**

Run: `pnpm exec vitest run tests/repo/daylight.test.ts && pnpm exec tsc --noEmit && pnpm build`
Expected: the Daylight foundation guard is now fully GREEN (font + icon assertions pass); `tsc` clean; `pnpm build` succeeds and completes without any network fetch for fonts.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/app/layout.tsx src/app/icon.svg src/components/icons.tsx
git commit -m "feat(daylight): Hanken Grotesk UI font (bundled) + light favicon"
```

---

## Task 4: App shell + navigation

Migrate the dashboard frame to the light system: white/off-white sidebar, hairline borders, the active-nav **raised white pill** (no green tint, no left rail), light sticky header.

**Files:**
- Modify: `src/components/app-shell.tsx`, `src/components/app-nav.tsx`, `src/components/site-switcher.tsx`
- Modify (if it carries classes): `src/app/(app)/layout.tsx`, `src/app/page.tsx`

**Interfaces:**
- Consumes: Daylight tokens/utilities (Tasks 2–3); `NAV`/`AppNav`/`SiteSwitcher` public shapes are unchanged.
- Produces: the migrated frame every feature page renders inside.

- [ ] **Step 1: Migrate `app-nav.tsx`** — replace the active/inactive treatment. The active branch changes from `bg-accent/10 font-medium text-white` + green left-rail span + green icon, to a raised white pill with ink text and no rail:

```tsx
                className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-white font-semibold text-neutral-900 shadow-[0_1px_2px_rgba(16,24,40,.05),0_1px_3px_rgba(16,24,40,.04)]"
                    : "font-medium text-neutral-700 hover:bg-neutral-100"
                }`}
```

Delete the left-rail `<span … bg-accent />` entirely (Daylight has no accent rail). Recolour the icon to monochrome:

```tsx
                <Icon className={isActive ? "text-neutral-900" : "text-neutral-500 transition-colors group-hover:text-neutral-700"} />
```

(The `eyebrow` group headings already re-tune via Task 2.)

- [ ] **Step 2: Migrate `app-shell.tsx`** — frame, sidebar, header, sign-out button. Apply the mapping:
  - Root wrapper `text-neutral-100` → `text-neutral-900`.
  - Sidebar `border-r border-neutral-800/70 bg-neutral-900/40 backdrop-blur-xl` → `border-r border-neutral-200 bg-white` (drop the blur/translucency; solid light surface).
  - Brand title `text-white` → `text-neutral-900`; subtitle `text-neutral-500` stays (re-tuned).
  - User email `text-neutral-300` → `text-neutral-700`.
  - Sign-out button `border-neutral-700 text-neutral-300 hover:bg-neutral-800/60` → `border-neutral-300 text-neutral-700 hover:bg-neutral-100`.
  - Header `border-b border-neutral-800/60 bg-neutral-950/70 backdrop-blur-xl` → `border-b border-neutral-200 bg-white/80 backdrop-blur`; `h1` `text-white` → `text-neutral-900`.

- [ ] **Step 3: Migrate `site-switcher.tsx`** — apply the mapping to its surfaces/borders/text (read the file; swap dark surfaces to `bg-white`/`panel`, `border-neutral-*` to `-200/-300`, `text-white`/`-100`/`-200` to ink, dropdown hover `bg-neutral-800` → `bg-neutral-100`). Keep any `bg-accent` that marks the *selected* site as a data/positive signal only if it reads as selection state; otherwise use `bg-neutral-100` + `font-medium text-neutral-900`.

- [ ] **Step 4: Check `src/app/(app)/layout.tsx` and `src/app/page.tsx`** — apply the mapping to any classes they carry (many are logic-only; if no dark classes, no change).

- [ ] **Step 5: Run gates + build**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: green; build succeeds.

- [ ] **Step 6: Visual spot-check** — run `pnpm dev`, open any page: sidebar is white with hairline border, the active item is a raised white pill (no green, no rail), icons monochrome, header light. Compare the frame to the prototype.

- [ ] **Step 7: Commit**

```bash
git add src/components/app-shell.tsx src/components/app-nav.tsx src/components/site-switcher.tsx src/app/\(app\)/layout.tsx src/app/page.tsx
git commit -m "feat(daylight): light app shell + raised white-pill active nav"
```

---

## Task 5: Shared primitives — buttons, chips, banner, empty state, job progress

Migrate the reused controls so every page inherits Daylight buttons/chips. **Ink primary CTAs**, quiet light demo banner, neutral empty-state glyph.

**Files:**
- Modify: `src/components/refresh-data-button.tsx`, `refresh-gaps-button.tsx`, `refresh-rankings-button.tsx`, `run-ai-visibility-button.tsx`, `run-audit-button.tsx`, `run-backlinks-button.tsx`, `run-conversations-scan-button.tsx`, `run-ga-sync-button.tsx`, `run-gsc-sync-button.tsx`, `run-organic-keywords-button.tsx`
- Modify: `src/components/empty-state.tsx`, `demo-banner.tsx`, `job-progress.tsx`

**Interfaces:**
- Consumes: Daylight tokens; button/component props unchanged.
- Produces: the ink primary button, `IntegrationLink`, `EmptyState`, `IntegrationLink`, `DemoBanner`, `JobProgress` in Daylight form — consumed by every feature page.

- [ ] **Step 1: Convert every primary CTA from accent to ink.** The pattern in the `refresh-*`/`run-*` buttons is `bg-accent … text-neutral-900` (or `text-neutral-950`) → ink primary:

```tsx
        className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#2a3138] disabled:cursor-default disabled:opacity-50"
```

Apply to each button file (read each — most are one `<button>`/`<a>` with this class). Preserve every non-class attribute (`onClick`, `disabled`, `aria-live`, `title`, text). Where a button shows a small running/pulse dot, keep that dot `bg-[--color-accent]` (the one place the button keeps a whisper of green).

- [ ] **Step 2: Migrate `empty-state.tsx`** — glyph tile and links:
  - Glyph tile `bg-accent/10 text-accent` → `bg-neutral-100 text-neutral-500` (chrome, not data → monochrome).
  - `h1` `text-white` → `text-neutral-900`; description `text-neutral-400` → `text-neutral-600`.
  - `IntegrationLink` `bg-accent … text-neutral-900 hover:opacity-90` → `bg-neutral-900 … text-white hover:bg-[#2a3138]`.
  - `EmptyState` already uses `panel` (now white) — keep it.

- [ ] **Step 3: Migrate `demo-banner.tsx`** — from green-tinted bar to a quiet light chip with a whisper-green dot:

```tsx
    <div role="note" className="flex flex-wrap items-center justify-center gap-x-2 border-b border-neutral-200 bg-neutral-50 px-4 py-1.5 text-center text-xs text-neutral-700">
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[--color-accent]" />
      <span>Read-only demo with synthetic data — every write is disabled.</span>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-neutral-900 underline underline-offset-2">Install your own →</a>
    </div>
```

- [ ] **Step 4: Migrate `job-progress.tsx`** — apply the mapping (progress text `text-neutral-400`→`-600`, any `text-accent` running state stays as positive-data green, error text keeps its semantic colour, any dark fill → light). Read the file and apply per mapping.

- [ ] **Step 5: Run gates + build**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: green.

- [ ] **Step 6: Visual spot-check** — the "Refresh data" button is ink with white text; the demo banner (in demo mode) is a quiet light chip with a small green dot; an empty state reads as a calm light card. Compare to prototype button/banner treatments.

- [ ] **Step 7: Commit**

```bash
git add src/components/refresh-data-button.tsx src/components/refresh-gaps-button.tsx src/components/refresh-rankings-button.tsx src/components/run-*-button.tsx src/components/empty-state.tsx src/components/demo-banner.tsx src/components/job-progress.tsx
git commit -m "feat(daylight): ink primary buttons, quiet demo banner, light empty state"
```

---

## Task 6: Data visualization (charts, sparklines, gauges, heat)

Re-tune the SVG viz for light: light grid lines, white endpoint halo, drop mono tick labels, no glow. Series/KD/up-down colours already re-tune via `@theme` (Task 2).

**Files:**
- Modify: `src/components/charts.tsx`, `viz.tsx`, `dashboard-charts.tsx`, `rank-sparkline.tsx`, `backlinks-trends.tsx`, `health-strip.tsx`

**Interfaces:**
- Consumes: `--color-series-*`, `--color-up/down`, `--color-kd-*`, `--color-neutral-*` (all light-tuned in Task 2).
- Produces: light-native charts consumed by overview/rankings/backlinks/etc.

- [ ] **Step 1: Migrate `charts.tsx`** — the dark-assuming literals:
  - Grid lines `stroke="rgba(255,255,255,0.05)"` → `stroke="var(--color-neutral-200)"`.
  - Area/line default `color = "var(--color-accent)"` stays (evergreen data).
  - Endpoint halo `circle … stroke="var(--color-neutral-950)"` → `stroke="#ffffff"` (white ground halo, so the dot reads on a white card).
  - Y-tick `text … fontFamily="var(--font-mono)"` → remove the `fontFamily` attribute (ticks inherit the sans; figures are no longer mono). Keep `fill="var(--color-neutral-500)"`.
  - Gauge track `circle … stroke="var(--color-neutral-800)"` → `stroke="var(--color-neutral-200)"`.
  - Any remaining dark ground fills/halos → light equivalents (`#ffffff` halo, `--color-neutral-200` rules).

- [ ] **Step 2: Migrate `viz.tsx`** — read it; the `kd*`/tier helpers reference `--color-kd-*`/`--color-up`/`--color-down` (auto re-tuned). Migrate any surrounding chip/pill classes per the mapping (dark chip bg → `bg-neutral-100`, `text-white` → ink). Position/KD tiers become small chips or text, not full-cell fills, per the spec — if a helper currently emits a full saturated cell background, reduce it to a text/chip treatment using the data-viz colour.

- [ ] **Step 3: Migrate `dashboard-charts.tsx`, `rank-sparkline.tsx`, `backlinks-trends.tsx`, `health-strip.tsx`** — apply the same rules: light grid, white endpoint halo, no `rgba(255,255,255,*)` strokes/fills, no mono tick font, dark surfaces → `panel`/white, dark borders → hairline. `rank-sparkline` stroke stays a data colour (up/down or accent). `health-strip` per spec is a hairline-divided strip, not separate cards — if it already is, keep; ensure dividers are `border-neutral-200`.

- [ ] **Step 4: Run gates + build**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: green. (Charts have snapshot/structure tests, not colour tests; they stay green.)

- [ ] **Step 5: Visual spot-check** — charts on a white card: faint light grid, coloured line with soft fill, an emphasized endpoint dot ringed in white, no glow, axis labels in tertiary gray sans. Compare to the prototype's sparkline/chart treatment.

- [ ] **Step 6: Commit**

```bash
git add src/components/charts.tsx src/components/viz.tsx src/components/dashboard-charts.tsx src/components/rank-sparkline.tsx src/components/backlinks-trends.tsx src/components/health-strip.tsx
git commit -m "feat(daylight): light-tuned charts — hairline grid, white endpoint halo, sans ticks"
```

---

## Task 7: Overview + Opportunities pages

The Overview is the prototype's subject — match it closely (metric strip, cards, chips).

**Files:**
- Modify: `src/app/(app)/overview/page.tsx`, `src/components/overview-headline.tsx`
- Modify: `src/app/(app)/opportunities/page.tsx`, `src/components/opportunity-card.tsx`, `src/components/opportunity-actions.tsx`

**Interfaces:**
- Consumes: Daylight shell/primitives/viz (Tasks 4–6).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Migrate the Overview** — `page.tsx` + `overview-headline.tsx`. Apply the mapping. Per the prototype: the headline metrics are a **hairline-divided strip** (one `panel` split by `border-left: 1px solid var(--color-neutral-200)` between cells), NOT six separate cards — if the current markup uses separate cards, consolidate to a divided strip. Values use `.num` (now sans tabular). Deltas keep `text-accent`(up)/`text-at-risk` or `text-up`/`text-down` — leave as-is. "Grounded in Search Console"-style chips → `bg-[--color-accent-tint] text-[--color-accent]`.

- [ ] **Step 2: Migrate Opportunities** — `page.tsx`, `opportunity-card.tsx`, `opportunity-actions.tsx`. Cards → `panel` with generous padding; hover lifts to `--shadow-pop` and `border-neutral-300` (`hover:shadow-[…] hover:border-neutral-300`). Numbered indices → small `text-neutral-500` figures, not accent bubbles. Action buttons → ink primary / white-ghost secondary (`bg-white border-neutral-300 text-neutral-900 shadow-[--shadow-1]`).

- [ ] **Step 3: Run gates**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: green.

- [ ] **Step 4: Visual spot-check** — open `/overview` and `/opportunities` next to the prototype. The Overview should read as the prototype: light ground, one metric strip, white hairline cards, ink chrome, data-only colour.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/overview/page.tsx src/components/overview-headline.tsx src/app/\(app\)/opportunities/page.tsx src/components/opportunity-card.tsx src/components/opportunity-actions.tsx
git commit -m "feat(daylight): Overview metric strip + Opportunities cards"
```

---

## Task 8: Rankings + Keywords + Keyword Overview

**Files:**
- Modify: `src/app/(app)/rankings/page.tsx`, `src/components/rankings-table.tsx`, `src/components/rankings-summary.tsx`
- Modify: `src/app/(app)/keywords/page.tsx`, `src/components/keyword-manager.tsx`
- Modify: `src/app/(app)/keyword-overview/page.tsx`, `src/components/keyword-overview.tsx`

**Interfaces:**
- Consumes: Daylight shell/primitives/viz.
- Produces: nothing downstream.

- [ ] **Step 1: Migrate the tables** — apply the spec's table convention: white surface, hairline row rules (`border-neutral-200`), ink headers in the `eyebrow` style, `.tnum` figures, hover row `bg-neutral-50`. Position/KD tiers are small chips/text (data-viz colours), not full-cell fills. In `rankings-table.tsx` the delta cells assert `text-accent` (improved) / `text-at-risk` (dropped) — **leave those class names unchanged** (they re-tune to evergreen/amber), so `tests/components/rankings-table.test.tsx` stays green.

- [ ] **Step 2: Migrate `keyword-manager.tsx`, `keyword-overview.tsx`, `rankings-summary.tsx`, and the three pages** — apply the mapping (dark surfaces → `panel`/white, borders → hairline, `text-white`/`-100`/`-200` → ink, `bg-accent` CTAs → ink, tint chips → `bg-neutral-100`/accent-tint).

- [ ] **Step 3: Run gates**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: green — including `tests/components/rankings-table.test.tsx` unchanged.

- [ ] **Step 4: Visual spot-check** — `/rankings`, `/keywords`, `/keyword-overview` vs the `rankings` prototype/screenshot language: light tables, hairline rules, tabular figures, delta arrows in data colour.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/rankings/page.tsx src/components/rankings-table.tsx src/components/rankings-summary.tsx src/app/\(app\)/keywords/page.tsx src/components/keyword-manager.tsx src/app/\(app\)/keyword-overview/page.tsx src/components/keyword-overview.tsx
git commit -m "feat(daylight): Rankings/Keywords/Keyword-Overview tables in light"
```

---

## Task 9: Competitors + Backlinks

**Files:**
- Modify: `src/app/(app)/competitors/page.tsx`, `src/components/competitor-dashboard.tsx`, `competitor-intel-panel.tsx`, `competitor-manager.tsx`, `competitor-suggestions.tsx`, `gap-table.tsx`
- Modify: `src/app/(app)/backlinks/page.tsx`, `src/components/backlinks-report.tsx`

**Interfaces:** Consumes Daylight shell/primitives/viz; produces nothing downstream.

- [ ] **Step 1: Migrate competitors** — pages + the five competitor components + `gap-table.tsx`. Apply the mapping. `gap-table` follows the table convention (Task 8's rules). Competitor cards → `panel` with hover lift.

- [ ] **Step 2: Migrate backlinks** — `page.tsx` + `backlinks-report.tsx`. Apply the mapping; charts within already re-tuned (Task 6).

- [ ] **Step 3: Run gates**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: green.

- [ ] **Step 4: Visual spot-check** — `/competitors` (vs the `competitors` prototype/screenshot) and `/backlinks`.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/competitors/page.tsx src/components/competitor-dashboard.tsx src/components/competitor-intel-panel.tsx src/components/competitor-manager.tsx src/components/competitor-suggestions.tsx src/components/gap-table.tsx src/app/\(app\)/backlinks/page.tsx src/components/backlinks-report.tsx
git commit -m "feat(daylight): Competitors + Backlinks in light"
```

---

## Task 10: Audit + Organic Keywords + AI Visibility + Trends + Research + Reddit

**Files:**
- Modify: `src/app/(app)/audit/page.tsx`, `src/components/audit-report.tsx`
- Modify: `src/app/(app)/organic-keywords/page.tsx`, `src/components/organic-keywords-table.tsx`
- Modify: `src/app/(app)/ai-visibility/page.tsx`, `src/components/ai-visibility-dashboard.tsx`
- Modify: `src/app/(app)/trends/page.tsx`, `src/components/trend-card.tsx`
- Modify: `src/app/(app)/research/page.tsx`, `src/components/research-explorer.tsx`
- Modify: `src/components/reddit-conversations.tsx`, `src/components/reddit-brief-editor.tsx`

**Interfaces:** Consumes Daylight shell/primitives/viz; produces nothing downstream.

- [ ] **Step 1: Migrate each page + component** per the mapping. Tables follow Task 8's convention; cards → `panel`. In `trend-card.tsx` the Δ chip asserts `text-accent`(positive)/`text-at-risk`(negative) — **leave those class names unchanged** so `tests/components/trend-card.test.tsx` stays green. `ai-visibility-dashboard` and `audit-report` are chart/score-heavy — rely on Task 6's re-tuned viz; migrate surrounding surfaces/text/chips.

- [ ] **Step 2: Run gates**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: green — including `tests/components/trend-card.test.tsx` unchanged.

- [ ] **Step 3: Visual spot-check** — `/audit`, `/organic-keywords`, `/ai-visibility` (vs the `ai-visibility` screenshot), `/trends`, `/research`, and wherever Reddit conversations render.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/audit/page.tsx src/components/audit-report.tsx src/app/\(app\)/organic-keywords/page.tsx src/components/organic-keywords-table.tsx src/app/\(app\)/ai-visibility/page.tsx src/components/ai-visibility-dashboard.tsx src/app/\(app\)/trends/page.tsx src/components/trend-card.tsx src/app/\(app\)/research/page.tsx src/components/research-explorer.tsx src/components/reddit-conversations.tsx src/components/reddit-brief-editor.tsx
git commit -m "feat(daylight): Audit/Organic/AI-Visibility/Trends/Research/Reddit in light"
```

---

## Task 11: Search Console + Analytics + Usage + MCP

**Files:**
- Modify: `src/app/(app)/gsc/page.tsx`, `src/components/gsc-dashboard.tsx`
- Modify: `src/app/(app)/ga/page.tsx`, `src/components/ga-dashboard.tsx`, `src/components/ga-property-picker.tsx`
- Modify: `src/app/(app)/usage/page.tsx`, `src/components/usage-report.tsx`
- Modify: `src/app/(app)/settings/mcp/page.tsx`, `src/components/mcp-token-manager.tsx`, `src/components/demo-mcp-token.tsx`, `src/components/demo-integrations.tsx`

**Interfaces:** Consumes Daylight shell/primitives/viz; produces nothing downstream.

- [ ] **Step 1: Migrate each page + component** per the mapping. **Exception — code blocks stay mono:** the MCP config snippet in `settings/mcp` / `mcp-token-manager.tsx` is a literal code block; keep `font-mono` (Geist Mono) there. Its surface becomes a light code surface (`bg-neutral-100` or `bg-neutral-50`, `border-neutral-200`, `text-neutral-800`) rather than a dark terminal — verify the snippet reads on light. Usage cost figures use `.num`.

- [ ] **Step 2: Run gates + build** (last feature-page phase — build to catch anything)

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: green.

- [ ] **Step 3: Visual spot-check** — `/gsc`, `/ga`, `/usage`, `/settings/mcp` (vs the `integrations` screenshot language). Confirm the MCP code snippet is a light code surface, still monospace.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/gsc/page.tsx src/components/gsc-dashboard.tsx src/app/\(app\)/ga/page.tsx src/components/ga-dashboard.tsx src/components/ga-property-picker.tsx src/app/\(app\)/usage/page.tsx src/components/usage-report.tsx src/app/\(app\)/settings/mcp/page.tsx src/components/mcp-token-manager.tsx src/components/demo-mcp-token.tsx src/components/demo-integrations.tsx
git commit -m "feat(daylight): Search Console/Analytics/Usage/MCP in light"
```

---

## Task 12: Setup wizard + Login

**Files:**
- Modify: `src/app/(auth)/setup/page.tsx`, `src/components/setup-wizard.tsx`, `src/components/create-admin-form.tsx`, `src/components/profile-review.tsx`
- Modify: `src/components/setup/admin-only.tsx`, `build-step.tsx`, `competitors-step.tsx`, `dataforseo-step.tsx`, `done-step.tsx`, `llm-step.tsx`, `profile-step.tsx`, `site-step.tsx`
- Modify: `src/app/(auth)/login/page.tsx`, `src/components/login-form.tsx`, `src/components/password-form.tsx`

**Interfaces:** Consumes Daylight tokens/primitives; produces nothing downstream.

- [ ] **Step 1: Migrate the auth surfaces** — the login and setup screens render *outside* the app shell, so they set their own ground: ensure the page background is the light ground (`bg-neutral-50` or inherit from `body`; remove any `bg-neutral-950`/`bg-neutral-900` page ground). Cards → `panel`. Form inputs → white surface, `border-neutral-300`, ink text, ink focus ring (via the base `:focus-visible`); labels in `eyebrow`/tertiary. Primary buttons → ink. Step indicators/progress → monochrome (active step ink, done step accent-tint or neutral). Apply the mapping across the wizard steps.

- [ ] **Step 2: Run gates**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: green (setup-page/route tests assert copy/flow, not colour).

- [ ] **Step 3: Visual spot-check** — `/login` and `/setup`: light ground, white card, ink primary, readable inputs. No dark remnants.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(auth\)/setup/page.tsx src/components/setup-wizard.tsx src/components/create-admin-form.tsx src/components/profile-review.tsx src/components/setup/*.tsx src/app/\(auth\)/login/page.tsx src/components/login-form.tsx src/components/password-form.tsx
git commit -m "feat(daylight): setup wizard + login in light"
```

---

## Task 13: Settings (shell, account, integrations, users)

**Files:**
- Modify: `src/app/(app)/settings/layout.tsx`, `src/app/(app)/settings/page.tsx`, `src/components/settings-tabs.tsx`
- Modify: `src/app/(app)/settings/account/page.tsx`, `src/components/settings-form.tsx`, `src/components/project-edit-form.tsx`
- Modify: `src/app/(app)/settings/integrations/page.tsx`, `src/components/integrations-form.tsx`
- Modify: `src/app/(app)/settings/users/page.tsx`, `src/components/users-manager.tsx`

**Interfaces:** Consumes Daylight tokens/primitives; produces nothing downstream. (`settings/mcp` was done in Task 11.)

- [ ] **Step 1: Migrate the settings shell + pages** — `settings-tabs.tsx` tab treatment → active tab ink/underline or raised pill, inactive `text-neutral-700 hover:bg-neutral-100` (mirror the nav pill language). Forms follow Task 12's input convention. Integration cards → `panel`; a "connected" state chip may use `bg-[--color-accent-tint] text-[--color-accent]` (positive data), a "not connected" chip stays neutral. Destructive actions (remove user) keep a semantic warning colour (`--color-down`/`--color-at-risk`) — do not neutralize meaning.

- [ ] **Step 2: Run gates + build** (last migration phase)

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: green.

- [ ] **Step 3: Visual spot-check** — `/settings`, `/settings/account`, `/settings/integrations` (vs the `integrations` screenshot), `/settings/users`.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/settings/layout.tsx src/app/\(app\)/settings/page.tsx src/components/settings-tabs.tsx src/app/\(app\)/settings/account/page.tsx src/components/settings-form.tsx src/components/project-edit-form.tsx src/app/\(app\)/settings/integrations/page.tsx src/components/integrations-form.tsx src/app/\(app\)/settings/users/page.tsx src/components/users-manager.tsx
git commit -m "feat(daylight): Settings shell, account, integrations, users in light"
```

---

## Task 14: Whole-app "no dark remnants" sweep guard

Now that every surface is migrated, author the guard that locks the sweep-complete invariant (spec done-criteria #2), catch any straggler it finds, and go green.

**Files:**
- Create: `tests/repo/daylight-sweep.test.ts`
- Modify: any straggler files the guard catches.

**Interfaces:** Consumes nothing; standing regression guard.

- [ ] **Step 1: Write the guard**

```ts
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";

// Count occurrences of a pattern under src/ via git grep (fast, respects .gitignore).
// Returns 0 when git grep finds nothing (it exits non-zero → we map to 0).
function count(pattern: string): number {
  try {
    const out = execSync(`git grep -oE '${pattern}' -- 'src/**/*.tsx' 'src/**/*.ts' 'src/**/*.css'`, {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    return out.trim() ? out.trim().split("\n").length : 0;
  } catch {
    return 0; // no matches
  }
}

describe("Daylight — no dark-first remnants", () => {
  it("has no text-white used as a utility class", () => {
    expect(count("text-white")).toBe(0);
  });
  it("has no bg-neutral-950 (the old app ground)", () => {
    expect(count("bg-neutral-950")).toBe(0);
  });
  it("has no dark radial-glow background-image", () => {
    expect(count("radial-gradient")).toBe(0);
  });
  it("has no color-scheme: dark", () => {
    expect(count("color-scheme:\\s*dark")).toBe(0);
  });
  it("has no bg-accent used as a solid CTA background", () => {
    // bg-accent/NN tints were converted to accent-tint; a bare bg-accent CTA
    // must have become bg-neutral-900. Any remaining bare `bg-accent ` (solid)
    // is a missed CTA.
    expect(count("bg-accent(?![-/])")).toBe(0);
  });
});
```

- [ ] **Step 2: Run it; fix any stragglers it catches**

Run: `pnpm exec vitest run tests/repo/daylight-sweep.test.ts`
Expected: ideally PASS. If a count is non-zero, `git grep` the pattern, migrate the straggler file per the mapping, and re-run until green. (`text-white` inside a literal code-block string that documents CSS, if any, should be reworded; there should be none.)

- [ ] **Step 3: Full gates + build**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: all green; build succeeds. This is the whole-branch regression checkpoint.

- [ ] **Step 4: Commit**

```bash
git add tests/repo/daylight-sweep.test.ts src/
git commit -m "test(daylight): guard against dark-first remnants; fix stragglers"
```

---

## Task 15: (POST-APPROVAL ONLY) Rebuild HF demo image + re-capture screenshots

**Do NOT run this task during the automated plan execution.** It ships outward-facing changes (redeploys the public HF demo, replaces README screenshots) and is gated on the owner approving and merging the `daylight` branch. Left here so the plan is complete; the executor stops after Task 14 and hands off.

**Files:**
- Modify: `docs/screenshots/overview.png`, `opportunities.png`, `rankings.png`, `competitors.png`, `ai-visibility.png`, `integrations.png` (re-captured)
- Rebuild: the HF demo image (its seed-restore path is unaffected by a visual redesign).

- [ ] **Step 1:** After merge, rebuild + redeploy the HF demo per the established flow (the GitLab `publish-image` pipeline on the tag, then the HF Space picks up the image; or `hf upload` per the demo deploy notes). Verify the live Space shows Daylight.
- [ ] **Step 2:** Re-capture the six screenshots at the same viewport as the originals (they were captured manually — no script exists), against the seeded demo data, and replace the PNGs. Keep filenames identical so `README.md` and `tests/repo/docs-links.test.ts` stay valid.
- [ ] **Step 3:** Run `pnpm exec vitest run tests/repo/docs-links.test.ts` (scans `.md` only) — green.
- [ ] **Step 4:** Commit the screenshots; push per the owner's sync flow (GitLab origin + GitHub mirror).

---

## Self-Review

**1. Spec coverage:**
- Light-only / `color-scheme` flip → Task 2 + guard (Task 1). ✓
- Near-monochrome accent, green as whisper/data → mapping in Global Constraints, applied Tasks 4–13; logo/favicon Task 3; buttons Task 5. ✓
- Hanken Grotesk, sans tabular figures, mono for code only → Task 3 (font) + Task 2 (`.tnum`/`.num`) + Task 11 (code block stays mono). ✓
- White cards, hairline borders, soft radius/shadow, "not everything is a card" (metric strip) → Task 2 (`panel`) + Task 7 (Overview strip). ✓
- Token strategy + neutral-ramp flip → Task 2. ✓
- Component conventions (buttons, nav pill, metric strip, cards, chips, tables, charts, empty/banner/badges, app icon) → Tasks 3–13 map each. ✓
- Migration mapping table → Global Constraints (verbatim) + applied every migration task. ✓
- Scope (every surface enumerated) → Tasks 4–13 cover all 24 pages/layouts + ~70 components; coverage cross-checked below. ✓
- Done-criteria: gates green (every task) ✓; no dark remnants (Task 14 guard) ✓; every surface matches Daylight (per-task visual check) ✓; demo rebuilt + screenshots (Task 15, post-approval) ✓.

**2. Component coverage cross-check** (every `src/components/*.tsx` assigned): app-shell/app-nav/site-switcher→T4; refresh-*/run-*/empty-state/demo-banner/job-progress→T5; charts/viz/dashboard-charts/rank-sparkline/backlinks-trends/health-strip→T6; overview-headline/opportunity-card/opportunity-actions→T7; rankings-table/rankings-summary/keyword-manager/keyword-overview→T8; competitor-*/gap-table/backlinks-report→T9; audit-report/organic-keywords-table/ai-visibility-dashboard/trend-card/research-explorer/reddit-*→T10; gsc-dashboard/ga-dashboard/ga-property-picker/usage-report/mcp-token-manager/demo-mcp-token/demo-integrations→T11; setup-wizard/setup/*/create-admin-form/profile-review/login-form/password-form→T12; settings-tabs/settings-form/project-edit-form/integrations-form/users-manager→T13; icons(Logo)→T3. Logic-only (no dark classes to migrate): demo-provider, stale-build-reloader, use-job. ✓ No orphans.

**3. Placeholder scan:** foundation tasks (1–3, 14) carry full literal code; migration tasks carry the exact file list + the shared mapping (Global Constraints) + task-specific worked before/afters (nav pill, CTA, banner, chart literals, metric strip, code-block exception). No "TBD"/"handle edge cases"/"similar to Task N". ✓

**4. Type/name consistency:** no new functions/types introduced; component props and public shapes (`NAV`, `AppNav`, `EmptyState`, `IntegrationLink`, `DemoBanner`, `JobProgress`, chart components) are unchanged by design (appearance-only). Token names used in tasks (`--color-accent-tint`, `--color-up/down`, `--shadow-1`, `--shadow-pop`, `panel`, `eyebrow`) all defined in Task 2. ✓
