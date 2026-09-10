# Daylight — light redesign — design

**Date:** 2026-09-10 · **Status:** approved in conversation (prototype signed off) · **Scope:** a full visual redesign of the Better Search Lab web app, from the dark "Signal" system to a light, airy, mobbin-inspired system ("Daylight"). This is a v1.1 design pass; it changes appearance only, not behaviour, data, routes, or copy semantics.

**Visual reference (the approved direction):** the Overview prototype at https://claude.ai/code/artifact/a8203e2f-7a76-4e5c-9d78-022d31dbc876 — its palette, typography, spacing, and component treatments are the source of truth. Where this spec and the prototype disagree, the prototype wins; where the prototype is silent (a screen it doesn't show), apply the conventions below.

## Motivation

The current "Signal" system is dark-first: a near-black cool-ink ground with a green radial glow, a signal-green accent used throughout, and monospace tabular figures for the "instrument" feel. It reads as high-contrast, accent-heavy, AI-maximalist. The redesign moves to the opposite thesis: light, airy, near-monochrome, generous whitespace, hairline borders, one confident typeface, colour reserved for data. The point is to stop looking machine-generated and read as a considered product.

## Decisions

| Topic | Decision |
|---|---|
| Theme | **Light only.** Flip `color-scheme` to light and remove the dark ground/glow. A dark-mode toggle is explicitly out of scope for this pass (see Deferred). |
| Accent | **Near-monochrome chrome.** Primary actions and the active nav are ink (near-black); the signal-green survives only as a whisper (one logo bar, positive-delta figures). Colour otherwise carries **data only** (up/down deltas, KD heat, chart series), never brand. |
| Typography | **Hanken Grotesk** as the single UI voice (via `next/font/google`), weight-driven hierarchy. Numerals use the sans with `tabular-nums`, not a mono face — the old mono "instrument" figures are dropped. Geist Mono is retained only for literal code blocks (the MCP config snippet). |
| Surfaces | White cards on a cool off-white ground, 1px hairline borders, soft radius (12px), near-shadowless (one very soft shadow; a slightly stronger one on hover). "Not everything is a card" — the headline metrics are a hairline-divided strip, not six boxes. |
| Token strategy | Redefine the shared tokens/utilities in `src/app/globals.css` to the Daylight palette, **redirecting the neutral ramp to the conventional light direction** (50 = lightest, 950 = ink), then migrate components off the dark-assuming classes per the mapping below. |
| Rollout | Built on a branch as v1.1, reviewed against the prototype, merged, then the HF demo image is rebuilt and the README screenshots re-captured. The live app/demo are not touched until the branch is approved and merged. |

## Design tokens (`src/app/globals.css`, `@theme`)

Replace the Signal palette with Daylight. Exact values from the prototype:

```
/* Cool-gray neutral ramp — LIGHT direction (50 lightest → 950 ink). */
--color-neutral-50:  #f6f7f9;   /* app ground            */
--color-neutral-100: #eef0f3;   /* hover fill, sunken     */
--color-neutral-200: #e7e9ee;   /* hairline border        */
--color-neutral-300: #d9dce3;   /* strong border          */
--color-neutral-400: #b8bec9;   /* disabled, faint rule   */
--color-neutral-500: #8b93a0;   /* tertiary text / labels */
--color-neutral-600: #6b7280;   /* — */
--color-neutral-700: #565e6b;   /* secondary text         */
--color-neutral-800: #2b313b;   /* — */
--color-neutral-900: #161a20;   /* primary text / ink CTA */
--color-neutral-950: #0c0f14;   /* — */

/* Brand: kept only as a data-positive / whisper accent, not chrome. */
--color-accent: #157f5c;         /* evergreen (positive, active mark) */
--color-accent-strong: #10684c;
--color-accent-tint: #e9f4ef;    /* positive-chip background */
--color-at-risk: #b7791f;        /* warning (muted amber)    */
--color-at-risk-tint: #f7f0e2;

/* Data-viz (light-tuned): deltas, KD heat, chart series. */
--color-up: #157f5c;   --color-down: #c24457;
--color-kd-easy: #157f5c; --color-kd-medium: #b7791f; --color-kd-hard: #c24457;
--color-series-1: #2f6b5e; --color-series-2: #3b7ea4; --color-series-3: #7a6cc4; --color-series-4: #b7791f;

--radius-xl: 12px;
--shadow-1: 0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.04);
--shadow-pop: 0 4px 14px rgba(16,24,40,.08);
```

Base layer changes:
- `html { color-scheme: light; }`.
- `body`: `background-color: var(--color-neutral-50)`; **remove** the radial-gradient glow and `background-attachment: fixed`; text defaults to `--color-neutral-900`.
- `::selection` → `rgba(21,127,92,.16)`; `:focus-visible` outline → `var(--color-neutral-900)` (ink), not green.
- Scrollbars → light track/thumb (`#d9dce3` thumb, hover `#b8bec9`).
- `.tnum` and `.num`: drop the mono `font-family`; use the sans with `font-variant-numeric: tabular-nums` and `letter-spacing:-0.01em`. (Metrics become airy sans figures.)
- `@utility panel`: white surface, `1px solid var(--color-neutral-200)`, `border-radius: var(--radius-xl)`, `box-shadow: var(--shadow-1)`.
- `@utility eyebrow`: unchanged structure; colour `var(--color-neutral-500)`.

## Typography (`src/app/layout.tsx`)

- Load `Hanken_Grotesk` from `next/font/google` (weights 400/500/600/700), expose it as `--font-sans` (replacing GeistSans in the `@theme` `--font-sans` mapping). Keep GeistMono as `--font-mono` for code blocks only.
- Scale (from the prototype): page title 25px/600/-0.02em; section headings 15px/600; body 15px/1.5/weight 450–500; metric values 23–26px/600/-0.03em; labels/eyebrows 11px/600/uppercase/0.06–0.1em tracking; `text-wrap: balance` on headings.

## Component conventions

- **Buttons.** Primary = ink (`bg-neutral-900 text-white`, hover `#2a3138`); secondary/"ghost" = white surface, `border-neutral-300`, ink text, `shadow-1`. Replace every `bg-accent` CTA with the ink primary. The Refresh-data button keeps its small pulse dot in `--color-accent`.
- **Nav (sidebar).** Inactive items: `text-neutral-700`, transparent, hover `bg-neutral-100`. Active item: **raised white pill** — `bg-white`, `shadow-1`, `text-neutral-900`, weight 600 (no green highlight, no left accent rail).
- **Metric strip.** One `panel` divided by vertical hairlines (`border-left: 1px solid var(--color-neutral-200)`), not separate cards. Values in `.num`. Deltas use `--color-up`/`--color-down` with ▲/▼.
- **Cards / list items** (opportunities, health tiles, etc.): `panel` + generous padding; hover lifts to `--shadow-pop` and `border-neutral-300`. Numbered indices are small tertiary-gray figures, not accent bubbles.
- **Chips.** Default: `bg-neutral-100`, `text-neutral-700`. Type chip: `bg-neutral-100`, `text-neutral-900`, 600. "Grounded in Search Console": `bg-[--color-accent-tint]`, `text-[--color-accent]`. Upside: borderless tertiary-gray tabular text.
- **Tables** (rankings, keywords, competitors): white surface, hairline row rules (`border-neutral-200`), ink headers in the eyebrow style, tabular figures, hover row `bg-neutral-50`. Position/KD tiers use the data-viz colours as small chips or text, not full-cell fills.
- **Charts / sparklines**: stroke + faint fill in `--color-up`/series colours; grid lines `--color-neutral-200`; axis/label text `--color-neutral-500`; emphasize the endpoint. No glow.
- **Empty states, banners, badges**: light surfaces; the demo banner becomes a quiet light chip (`bg-neutral-50`/white, hairline) with the whisper-green dot, not the green-tinted bar.
- **App icon** (`src/app/icon.svg`) and any brand mark: recolour to the prototype's ink bars + one evergreen bar on a light/transparent ground.

## Migration mapping (dark class → Daylight)

The bulk of the work. Apply per component, verifying each screen against the prototype. The neutral ramp is redefined (above), so some classes change value in place; others must be swapped:

| Old (dark assumption) | New | Notes |
|---|---|---|
| `text-white` | `text-neutral-900` | primary text → ink (~110 uses) |
| `text-neutral-100` / `-200` | `text-neutral-900` / `-800` | strong text |
| `text-neutral-300` / `-400` | `text-neutral-700` / `-600` | secondary text |
| `text-neutral-500` | `text-neutral-500` | tertiary (re-valued light) — keep, verify contrast |
| `bg-neutral-950` | (remove; ground is on `body`) or `bg-neutral-50` | app ground |
| `bg-neutral-900` / `-800` (surfaces) | `panel` or `bg-white` | cards |
| `bg-neutral-800` (hover/fill) | `bg-neutral-100` | subtle fills |
| `border-neutral-800` / `-700` | `border-neutral-200` / `-300` | hairlines (~113 uses) |
| `bg-accent` (CTA) | `bg-neutral-900 text-white` | ink primary (~70 uses; audit each: CTA vs tint) |
| `bg-accent/10` (tint) | `bg-[--color-accent-tint]` | positive tint only |
| `text-accent` (positive) | `text-[--color-accent]` | keep for positive/active; elsewhere → `text-neutral-900` (~39 uses) |
| `text-accent` (link/active nav) | `text-neutral-900` + pill | monochrome |
| `.tnum` / `.num` on figures | unchanged class; utility redefined to sans | airy figures |
| `at-risk`, `up`, `down`, `kd-*`, `series-*` | unchanged class; values re-tuned in `@theme` | data-viz stays, light-tuned |

An occurrence-level guard is impractical (the classes are legitimate post-migration), so correctness is verified **visually per screen against the prototype** and by a repo check that the dark grounds/glow are gone (below).

## Scope

Every rendered surface: the app shell (sidebar, top bar), all feature pages (overview, opportunities, rankings, keywords, keyword-overview, competitors, backlinks, audit, organic, ai-visibility, reddit, mcp, usage, settings/*), the setup wizard, login, empty states, and shared components under `src/components/**`. Plus `globals.css`, `layout.tsx`, `icon.svg`. After merge: rebuild the HF demo image (its snapshot restore is unaffected) and re-capture `docs/screenshots/*.png`.

## Out of scope / deferred

- **Dark-mode toggle.** Light only for v1.1; a token layer that supports both can come later.
- **Layout/IA changes** beyond spacing and component treatment — routes, nav structure, and what each page shows are unchanged.
- **Copy rewrites** — text stays; only type/colour/spacing change.
- **New charts or features.**

## Done criteria

1. `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm build` green; `cd mcp && npx vitest run` unaffected. Component tests that assert on text/labels still pass (the redesign changes classes, not copy); tests asserting specific dark classes/colours are updated to the new ones.
2. No dark-first remnants: `git grep` finds no `text-white` used as body text, no `bg-neutral-950`/`bg-neutral-900` as a page ground, no radial-glow `background-image`, and `color-scheme: dark` is gone from `globals.css`.
3. Every listed surface visually matches the Daylight language (spot-checked against the prototype): light ground, white hairline cards, ink CTAs, monochrome chrome, sans tabular figures, data-only colour.
4. The HF demo image rebuilt and the Space showing the new look; README screenshots re-captured.

## Rollout notes

Build on a `daylight` branch with the subagent-driven workflow, phased: (1) tokens + base layer + fonts + `panel`/`eyebrow` in `globals.css`/`layout.tsx`/`icon.svg`; (2) the app shell + shared primitives (`src/components/*` buttons, chips, empty state, banner, nav); (3) feature pages in groups; (4) setup wizard + login + settings; (5) demo image rebuild + screenshots. Each phase is reviewable against the prototype. Do not push or redeploy until the branch is approved.
