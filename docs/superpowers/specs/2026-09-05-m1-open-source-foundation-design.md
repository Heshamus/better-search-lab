# M1 — Open-Source Foundation + Time-to-Wow — Design

> **Status:** design, owner-approved section by section on 2026-09-05. Terminal step of
> brainstorming → next is `writing-plans`.
> **Revised:** 2026-09-05 after owner review — first-admin locking (§9.1), session revocation
> (§9.5), persisted onboarding state (§11.1), config compatibility (§8), demo allowlist (§13),
> measurable install target (§21.1).
> **Date:** 2026-09-05
> **Repo:** `better-search-lab` (working folder `seo-platform`), product name **Better Search Lab**.
> **Scope of this document:** Milestone 1 of a four-milestone program that turns the internal
> tool into an open-source, self-hostable product. M2–M4 are outlined in §4 and get their own
> spec → plan → build cycles.

## 0. Decisions (owner-approved 2026-09-05)

| # | Decision |
|---|---|
| D1 | **Audience:** self-hosting SEO practitioners — indie founders, in-house SEOs, small agencies running it with their own DataForSEO key. Not open-core, not agents-first, not a showcase. |
| D2 | **"Spectacular" means all four:** time-to-wow, the engine as hero, breadth, visual craft + AI-native. |
| D3 | **Build order:** Foundation (M1) → Hero (M2) → Breadth (M3) → Craft (M4). The repo flips public after M1 at the earliest; the owner decides the exact moment. |
| D4 | **License:** AGPL-3.0-only. |
| D5 | **M1 configuration model:** in-app configuration with env override (a `settings` table + Integrations UI; env vars still win when set). Not env-only, not multi-tenant. |
| D6 | **Secrets at rest:** AES-256-GCM, key derived from `AUTH_SECRET` via HKDF, optional `ENCRYPTION_KEY` env override. |
| D7 | **Wizard:** DataForSEO is required before profiling; the AI assistant and competitor steps are skippable; a competitor-suggest endpoint is included; a `progress` column is added to `jobs`. |
| D8 | **LLM:** two adapters — `openai-compatible` (with presets) and a native `anthropic` adapter on the official SDK. **Email:** Resend + SMTP. **Demo:** two seeded projects, opportunities produced by the real engine. |
| D9 | **Docs:** in-repo markdown; `docs/superpowers/` design history stays, scrubbed. Single multi-stage Docker image, GHCR + npm publish on tag. |

## 1. Context

Better Search Lab is a ~15k-line Next.js 15 / React 19 / Drizzle / Postgres app with 16
dashboard views, a 14-handler job worker, an 11-tool MCP server, and 25 tables. At the start of
this work: 222 commits, `tsc` clean, 128 test files / 554 tests green. Its differentiated core is
the Opportunity Engine (8 detectors + relevance gate + LLM advisor), the AI-visibility scanner,
the Reddit "conversations worth joining" pipeline, and the MCP surface that lets coding agents
read all of it.

It was built as a single-tenant internal tool. An audit on 2026-09-05 found what stands between
it and a public release:

- `license: UNLICENSED`, no `LICENSE` file.
- Internal identity baked in: 107 "harperflow" mentions, 12 "supergenius", 8 "betterbrainlab";
  the MCP server's default URL is the private deployment; recorded DataForSEO fixtures contain
  the owner's real domain; `next.config.ts` hardcodes the private host in `allowedOrigins`.
- First-run experience: the README says "Phase 0 complete"; users are seeded by hand with a
  bcrypt hash (`seed.mjs`); the login page is unstyled inline HTML; `ALLOWLIST` is an env var.
- Every integration is one of 20+ env vars read through `loadEnv()` at 23 call sites, and the DB
  client calls `loadEnv()` at import, so even `next build` needs placeholder secrets.
- Providers are hard-wired: DeepSeek is the only LLM, Resend the only mailer.
- No CI, no `docker-compose.yml` in the repo, no `CONTRIBUTING`, no `CLAUDE.md`.
- Git history is clean: `.env` was never tracked and no secret-shaped strings appear in any
  commit, so no history rewrite is needed.

## 2. Goals

- **G1 — Five-minute install.** `git clone` → set `AUTH_SECRET` and `APP_URL` →
  `docker compose up` → browser wizard → populated dashboard: five minutes of the person's
  time, under ten minutes wall clock, no file editing after `.env`. The acceptance test is
  §21.1.
- **G2 — Configure in the app.** Every integration is set, tested, and changed from Settings →
  Integrations without a restart. Env vars still work and win when set.
- **G3 — Real users.** First-run admin, admin-managed users, two roles, hardened login. No
  hand-seeding, no allowlist env.
- **G4 — Provider choice.** Any OpenAI-compatible LLM or Anthropic natively; Resend or SMTP;
  DataForSEO stays the single data backbone.
- **G5 — Public demo.** `DEMO_MODE=true` boots a fully populated, read-only, two-project demo
  with zero external keys, for a hosted demo, screenshots, and try-before-configure.
- **G6 — A repo strangers can trust.** License, scrubbed history-safe code, CI, published image
  and npm package, README + docs, community files.
- **G7 — Zero-friction upgrade for the existing deployment.** Env untouched, every account
  keeps working after one re-sign-in (sessions gain a version, §9.5), the oldest user becomes
  admin automatically.

## 3. Non-goals (explicitly deferred)

- Multi-tenancy, organizations, workspaces, per-org integrations.
- SSO / OAuth login providers, email invites, magic links.
- Per-user MCP tokens (tokens stay global, admin-minted).
- New SEO features (M2/M3). Direct AI-visibility provider adapters replacing Eden AI (M3).
- Light mode, mobile layout, motion pass, chat panel (M4).
- A hosted docs site; automated screenshot pipeline.
- Changing the product name. "Better Search Lab" stays.

## 4. Program roadmap (each later milestone gets its own spec)

| Milestone | Theme | Headline items |
|---|---|---|
| **M1** (this spec) | Foundation + time-to-wow | License, scrub, CI, compose, docs, first-run admin, in-app integrations, setup wizard, live job progress, provider seams, demo mode. |
| **M2** | The engine as hero | One-click SERP-informed content briefs from an opportunity; weekly digest email; alerts on rank drops and lost SERP features; visible score breakdowns; upside forecasts. |
| **M3** | Breadth | Content engine (topical maps, drafts via `ChatProvider`); share of voice from competitor positions the SERP calls already return; optional DataForSEO On-Page deep audit; SERP viewer; page-level analysis; PDF reports. |
| **M4** | Craft + AI-native | Polish and motion pass, light mode, mobile, command palette, chat-with-your-data over the MCP tool surface, automated screenshots. |

## 5. Global constraints

Every task inherits these verbatim:

- **Env override compatibility.** Any setting reachable from the UI is also settable by env var, and env wins. The owner's current deployment must upgrade with its env file untouched.
- **Only `DATABASE_URL` and `AUTH_SECRET` are required env.** Everything else is optional env or in-app.
- **No secrets in the client bundle.** Secret values never leave the server; the UI sees only "set" / "not set" / "set via environment".
- **DataForSEO only through the existing injectable client seam**; every new call is fixture-tested with zero live spend and cost-logged via `estimateCost`/`logApiUsage`.
- **Server-reads / client-mutations architecture unchanged.** `(app)/*` pages are server components reading `src/lib/*`; mutations are client components calling session-guarded `/api/*` then `router.refresh()`.
- **Hermetic tests** via pglite; no real Postgres or network in tests.
- **Honesty is structural.** Absent, failed, or undecryptable data renders as such, never as a fabricated value. Progress text comes only from handlers.
- **No internal references** (company names, private hostnames, private paths) anywhere in the public tree.
- **Tailwind v4 tokens from `globals.css @theme`** ("Signal" design system) for every new surface.
- **Live-verification mandate.** M1 is not done until the §17 checklist is run against a real install and the real deployment.

## 6. Architecture

```
                     ┌──────────────────────────── env (wins when set) ────────────────────────────┐
                     │  DATABASE_URL  AUTH_SECRET  [ENCRYPTION_KEY]  [DEMO_MODE]  [APP_URL]  [LLM_*] …│
                     └──────────────┬───────────────────────────────────────────────┬───────────────┘
        bootstrap (loadEnv)         │                                               │ registry-mapped overrides
                                    ▼                                               ▼
   ┌──────────────┐        ┌────────────────┐   env > db > unset    ┌──────────────────────────┐
   │ lazy db      │◄───────│ settings table │◄──────────────────────│ src/lib/config/resolve   │──► AppConfig
   │ (Proxy)      │        │ (enc secrets)  │                       │ (30s cache, invalidate)  │      │
   └──────────────┘        └────────────────┘                       └──────────────────────────┘      │
                                    ▲                                                                 ▼
                     Settings → Integrations (admin) ── PUT /api/settings/integrations      src/lib/config/clients
                     Test-connection buttons ── POST …/[group]/test                          makeDataForSeoClient
                                                                                             makeChatProvider
   /setup wizard ──► account → dataforseo → ai → site → profile → competitors → build         makeEmailSender
        │                                        (existing jobs + jobs.progress)               makeEdenClient …
        ▼                                                                                          │
   /overview (populated)                       worker: re-reads AppConfig per job ◄────────────────┘
```

### 6.1 Slices

| Slice | Delivers | Depends on |
|---|---|---|
| **A** Bootstrap hygiene | Lazy DB client; bootstrap env shrunk to two vars; secret-free `next build`; `ALLOWLIST` removed | — |
| **B** Config service | `settings` table, typed registry, encryption, env override, `getConfig()`, client factories, call-site migration | A |
| **C** Auth & users | Locked first-run admin, users CRUD, roles + `requireAdmin`, per-request session validation, on-brand login without Server Actions, hardening | A |
| **D** Integrations UI | Settings tabs; per-integration forms; Test-connection routes; models dropdown | B, C |
| **E** Setup wizard | `/setup` with persisted onboarding state, `jobs.progress`, competitor suggest | B, C, D |
| **F** Provider seams | `ChatProvider` + two adapters, `EmailSender` + SMTP, `userData` wrapper, MCP default URL + npm bin | B |
| **G** Demo mode | Deterministic seeder, boot hook, write block, demo login, demo provider | B, C, E |
| **H** Repo & release | License, scrub, fixture sanitization, CI, Dockerfile, compose, docs, community files, versioning | H1 (license/scrub/CI) any time; H2 (compose/Dockerfile/docs) after A–G |

Build order: **A → B → C → D → E → F → G**, with **H1** in parallel from day one and **H2** last.

## 7. Slice A — Bootstrap hygiene

- **`src/db/client.ts`:** `db` becomes a lazy singleton behind a `Proxy` that instantiates
  `postgres()` + `drizzle()` on first property access. Import surface unchanged (`import { db }
  from "@/db/client"` everywhere still works). Nothing runs at module import.
- **`src/config/env.ts`:** `loadEnv()` validates only bootstrap env:

  | Var | Required | Meaning |
  |---|---|---|
  | `DATABASE_URL` | yes | Postgres connection string (`postgres://` or `postgresql://`, validated as a URL). |
  | `AUTH_SECRET` | yes | Auth.js JWT secret, ≥ 32 chars. Also the HKDF input for settings encryption. |
  | `ENCRYPTION_KEY` | no | 32-byte base64 key; when set, used instead of the derived key. |
  | `DEMO_MODE` | no | `true` boots the read-only demo (§13). |
  | `AUTH_TRUST_HOST` | no | Passed through to Auth.js; defaulted to `true` in the Docker image. |

  Every other variable moves to the registry (§8.2) as an *override*, including legacy aliases,
  so an existing `.env` keeps working.

  Which vars a person actually types depends on the install path: **compose** wires
  `DATABASE_URL` to its `db` service, so a compose user sets only `AUTH_SECRET` and `APP_URL`
  in `.env`; a **bare-metal** install sets `DATABASE_URL` and `AUTH_SECRET`, with `APP_URL`
  recommended. Every mention of "required env" elsewhere in this spec means this paragraph.
- **`ALLOWLIST` removed.** `src/lib/auth/allowlist.ts` and its test are deleted; the users
  table is the allowlist. `seed.mjs` is deleted (replaced by `/setup`).
- **Dockerfile** drops the placeholder-secrets block; `next build` runs with no env.
- **`next.config.ts`** drops `experimental.serverActions.allowedOrigins` (made unnecessary by
  §9.4).
- **Migrate ergonomics:** `src/db/migrate.ts` wraps `sql.end()` in `try/finally` (backlog item).

## 8. Slice B — Config service

### 8.1 Module layout — `src/lib/config/`

| File | Responsibility |
|---|---|
| `registry.ts` | The single declaration of every setting (§8.2). Exports `SETTINGS`, `GROUPS`, `SettingDef`, `settingByKey()`. |
| `crypto.ts` | `deriveKey(authSecret)` (HKDF-SHA256, info `"bsl-settings-v1"`, 32 bytes), `encrypt(plain, key)`, `decrypt(payload, key)`. Payload format: `v1:` + base64(iv ‖ ciphertext ‖ tag), AES-256-GCM, 12-byte random IV. |
| `store.ts` | `readAllSettings(db)`, `writeSettings(db, entries, updatedBy)`, `deleteSetting(db, key)`. Encrypts/decrypts per `SettingDef.secret`. A value that fails to decrypt is returned as `{ key, value: undefined, undecryptable: true }`. |
| `resolve.ts` | `getConfig(db, opts?: { fresh?: boolean })` → `AppConfig`. Resolution per key: env (registry `env` or any `legacyEnv`, non-empty) > db > unset. In-process cache with a 30 s TTL; `invalidateConfigCache()` called by `writeSettings`. `envOverriddenKeys()` for the UI. The cache is a web-process convenience only: the worker and the Test-connection routes always pass `fresh: true` (§8.4). Multiple web replicas may lag a save by up to 30 s; documented, accepted. |
| `clients.ts` | Factories returning `null` when the group is not `configured`: `makeDataForSeoClient(cfg)`, `makeChatProvider(cfg)`, `makeEmailSender(cfg)`, `makeEdenClient(cfg)`, `makeGoogleAuth(cfg)`, `makeRedditSource(cfg)`, `makeApifyClient(cfg)`. |
| `app-config.ts` | The `AppConfig` type: one object per group with typed fields plus a `configured: boolean` computed by the group's rule (§8.2). |

### 8.2 Registry

Each entry: `key`, `group`, `label`, `description`, `secret`, `env`, `legacyEnv[]`, `schema`
(zod), `placeholder`, `options` (for enums). The `configured` rule per group is listed last.

| Group | Key | Env (override) | Secret | Notes |
|---|---|---|---|---|
| app | `app.url` | `APP_URL` | no | Public base URL. Derives the Google redirect URI (unless `google.redirectUri` is set) and links in emails. No default: when unset, the features that need it show "set App URL" in their card rather than guessing. Compose and the demo file set it. |
| dataforseo | `dataforseo.login` | `DATAFORSEO_LOGIN` | no | |
| dataforseo | `dataforseo.password` | `DATAFORSEO_PASSWORD` | yes | *configured:* both set. |
| llm | `llm.provider` | `LLM_PROVIDER` | no | enum: `deepseek` `openai` `anthropic` `openrouter` `groq` `together` `gemini` `ollama` `custom`. Legacy: when unset and `DEEPSEEK_API_KEY` is present → `deepseek`. |
| llm | `llm.baseUrl` | `LLM_BASE_URL` | no | Filled by preset; editable for `custom`. Ignored for `anthropic`. |
| llm | `llm.apiKey` | `LLM_API_KEY` (legacy `DEEPSEEK_API_KEY`) | yes | May be empty for `ollama`. |
| llm | `llm.model` | `LLM_MODEL` | no | Preset default per provider (`deepseek-v4-pro`, `claude-opus-5`, …); free text allowed. |
| llm | `llm.effort` | `LLM_EFFORT` | no | enum `low` `medium` `high`; default `medium`. Used by the `anthropic` adapter only. *configured:* provider set and (apiKey set or provider is `ollama`) and model set. |
| google | `google.clientId` | `GOOGLE_CLIENT_ID` | no | |
| google | `google.clientSecret` | `GOOGLE_CLIENT_SECRET` | yes | |
| google | `google.serviceAccountKey` | `GOOGLE_SA_KEY` | yes | Raw or base64 JSON. |
| google | `google.redirectUri` | `GOOGLE_REDIRECT_URI` | no | Optional. An explicit value wins; otherwise derived as `${app.url}/api/google/callback`. If neither this nor `app.url` is set, the Google card disables Connect with "set App URL first" and `/api/google/connect` returns `?error=not_configured`. Kept so an untouched `.env` keeps its working OAuth setup (the callback also uses it to compute its own redirect origin). *configured:* SA key set, or clientId + clientSecret set. |
| edenai | `edenai.apiKey` | `EDENAI_API_KEY` | yes | *configured:* set. |
| edenai | `edenai.sonarModel` / `chatgptModel` / `geminiModel` | `EDEN_SONAR_MODEL` / `EDEN_CHATGPT_MODEL` / `EDEN_GEMINI_MODEL` | no | Existing defaults preserved. |
| email | `email.provider` | `EMAIL_PROVIDER` | no | enum `none` `resend` `smtp`. Legacy: unset + `RESEND_API_KEY` present → `resend`. |
| email | `email.resendApiKey` | `RESEND_API_KEY` | yes | |
| email | `email.smtpHost` / `smtpPort` / `smtpUser` / `smtpSecure` | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_SECURE` | no | |
| email | `email.smtpPassword` | `SMTP_PASSWORD` | yes | |
| email | `email.from` | `EMAIL_FROM` (legacy `REPORT_EMAIL_FROM`) | no | |
| email | `email.reportTo` | `REPORT_EMAIL_TO` | no | *configured:* provider ≠ none, provider's credentials set, `from` set. |
| reddit | `reddit.clientId` | `REDDIT_CLIENT_ID` | no | |
| reddit | `reddit.clientSecret` | `REDDIT_CLIENT_SECRET` | yes | |
| reddit | `reddit.userAgent` | `REDDIT_USER_AGENT` | no | *configured:* id + secret set. |
| apify | `apify.apiKey` | `APIFY_API_KEY` | yes | |
| apify | `apify.redditActor` | `APIFY_REDDIT_ACTOR` | no | Default `automation-lab~reddit-scraper` (a public third-party actor; not an internal reference). *configured:* apiKey set. |

`SERPAPI_API_KEY` is dropped (its feature was retired in commit `fe15da4`).

### 8.3 Data model

```
settings
  key         text primary key          -- registry key, e.g. "dataforseo.password"
  value       text not null             -- plaintext, or "v1:…" when the registry marks the key secret
  updated_at  timestamptz not null default now()
  updated_by  uuid null references users(id) on delete set null
```

### 8.4 Call-site migration

- The 14 integration-reading `loadEnv()` call sites under `src/` (pages, API routes, job
  handlers) switch to `getConfig(db)`; the 5 under `scripts/` too. `src/auth.ts` stops reading
  `ALLOWLIST`; `src/db/client.ts` and `src/db/migrate.ts` keep the bootstrap `loadEnv()`.
  `worker/index.ts` stops building clients at module scope and resolves them per job via
  `clients.ts` (§8.1) from `getConfig(db, { fresh: true })`. The worker is a separate process
  that the web process's cache invalidation cannot reach, so it never uses the 30 s cache; that
  fresh read is what makes "a key added in the UI takes effect on the next job without a
  restart" true. The cron `run()` reads fresh once per tick. Test-connection routes read fresh
  too, so a just-saved key is what gets tested.
- Feature gates: pages that render "not configured" copy (`ai-visibility`, `gsc`, `ga`,
  `trends`, Reddit) read `cfg.<group>.configured` and render a link to
  `/settings/integrations#<group>` with the integration's name.
- Every `fetchImpl` injection point stays so tests keep stubbing transport.

## 9. Slice C — Auth & users

### 9.1 First run

- `src/lib/auth/users.ts` → `createFirstAdmin(db, { email, password })` runs in one
  transaction: `SELECT pg_advisory_xact_lock(hashtext('bsl:users'))`, then
  `SELECT count(*) FROM users`, then the insert only when the count is zero; otherwise
  `AdminAlreadyExistsError`. A bare `INSERT … WHERE NOT EXISTS` is not enough: under
  READ COMMITTED two concurrent statements both snapshot an empty table and both insert
  (write skew), so two strangers racing a fresh public install would both become admin. The
  same advisory lock wraps every user-management mutation (§9.2), which is also what makes the
  last-admin invariants hold under concurrency. Verified by the real-Postgres suite in §18.
- `/login` (server component) redirects to `/setup` when `countUsers() === 0`; `/setup` redirects
  to `/login` when users exist and the visitor is unauthenticated. After creating the admin the
  wizard signs them in (client-side `signIn`, §9.4) and continues.
- **Migration for existing installs:** a custom drizzle migration promotes the oldest user to
  `admin` when no admin exists:
  `UPDATE users SET role = 'admin' WHERE id = (SELECT id FROM users ORDER BY created_at LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin');`

### 9.2 Roles and guards

| Capability | member | admin |
|---|---|---|
| All analysis pages, project CRUD, profile, competitors, weights, Reddit brief, refresh buttons | ✓ | ✓ |
| Settings → Integrations (read/write/test) | — | ✓ |
| Settings → Users | — | ✓ |
| Mint / revoke MCP tokens | — | ✓ |
| Settings → Account (own password) | ✓ | ✓ |

- `src/lib/api-guard.ts` gains `requireAdmin()`: resolves the session, re-reads `users.role`
  by id from the DB, returns `403` for non-admins (and `401` for no session). Role is also
  carried in the JWT for page-level rendering decisions, but authorization decisions use the DB
  read so demotion is immediate.
- Users API (admin): `GET /api/users`, `POST /api/users` `{ email, role, password }`,
  `PATCH /api/users/[id]` `{ role? , password? }`, `DELETE /api/users/[id]`.
  Invariants enforced in `users.ts`, each inside the `bsl:users` advisory-locked transaction:
  cannot demote or delete the last admin; cannot delete yourself; emails are normalized to
  lowercase and unique case-insensitively.
- Own account: `POST /api/account/password` `{ currentPassword, newPassword }`.
- `users.last_login_at timestamptz null` is added and stamped in `authorize()`.

### 9.3 Hardening

- Unique index `users_email_lower_idx` on `lower(email)`.
- `authorize()` runs `bcrypt.compare` against a fixed dummy hash when the email is unknown, so
  unknown and wrong-password paths take the same time.
- `src/lib/auth/rate-limit.ts`: in-process sliding window, 10 attempts / 15 min per
  `email` and per `ip`, applied in `authorize()`. Documented as per-process (one web process is
  the norm).
- Middleware runs on every path except `/_next/**` and static files (paths containing a dot).
  For app pages it redirects unauthenticated requests to `/login`; it passes `/login`, `/setup`,
  and `/api/**` through unauthenticated (API routes self-guard, as today); and on `/api/**` it
  applies the demo write-block (§13). This replaces the substring matcher that let any
  `/login-*` path bypass the guard.

### 9.4 Login without Server Actions

`src/app/(auth)/login/page.tsx` becomes a server component that resolves `first-run` /
`demo` / `normal` state and renders `src/components/login-form.tsx`, a client form calling
`signIn("credentials", { email, password, redirect: false })` from `next-auth/react`, then
`router.push(callbackUrl)`. This removes the only Server Action in the app, and with it the
`allowedOrigins` hack and the proxy-rewrites-host failure class. `stale-build-reloader` stays
(harmless). The page is rebuilt on the Signal system: centered panel, logo + wordmark, inline
error state, no signup link.

### 9.5 Sessions and revocation

Sessions stay JWT-based (Auth.js's Credentials provider supports only the JWT strategy), so
revocation is done by validating every request against the users table:

- `users.session_version integer not null default 1`. The JWT carries only `sub` (user id) and
  `sv` (the version at sign-in); it carries no role.
- `src/lib/auth/session.ts` → `resolveSessionUser()`: reads the JWT, loads `users` by id, and
  returns `{ id, email, role }` only when the row exists and `session_version` equals `sv`. One
  primary-key lookup per request. `requireSession()` and `requireAdmin()` use it, so a valid
  JWT for a deleted user gets `401` instead of being accepted as it is today
  (`src/lib/api-guard.ts`).
- Pages get the same check: `src/app/(app)/layout.tsx` becomes a server component that calls
  `resolveSessionUser()` and redirects an invalid session to `/login?reason=signed-out`, then
  renders the existing client shell (moved to `src/components/app-shell.tsx`, which keeps
  `usePathname`). Every `(app)` page is already `force-dynamic`, so the layout runs per
  request. Middleware still only verifies the JWT signature (it runs on the edge without a
  DB); it is a fast pre-filter, not the authority.
- Revocation events. **Delete user** → immediate, the row is gone. **Password reset** by an
  admin or by the user → `session_version` bumps, invalidating every session of that user
  including the current one for a self-change; the account page signs the user out with
  "Password changed — sign in again." **Role change** → effective on the next request, because
  role is always read from the DB. **MCP tokens** are unaffected; they have their own revoke in
  Settings → MCP.
- JWTs minted before this change carry no `sv` and are rejected, so every existing user signs in
  once after the upgrade (noted in `docs/upgrading.md`).

## 10. Slice D — Integrations UI

- Settings becomes tabbed sub-routes under `src/app/(app)/settings/`: `page.tsx` (Project —
  the existing edit/profile/competitors/weights/Reddit-brief content), `integrations/page.tsx`,
  `users/page.tsx`, `account/page.tsx`, `mcp/page.tsx` (existing token manager moved here).
  `src/components/settings-tabs.tsx` renders the strip; non-admin users see only Project and
  Account (the admin routes `403` server-side).
- `src/components/integrations-form.tsx` renders one card per registry group from the registry
  itself: label, description, fields (secret fields show "•••• set" + Replace; env-overridden
  fields are read-only with a "set via environment" badge and the env var name), Save, and
  Test. The LLM card shows a provider preset select that fills `baseUrl`/`model`, and a model
  combobox fed by `GET /api/settings/integrations/llm/models`.
- Routes (all `requireAdmin`):
  - `GET /api/settings/integrations` → per key: `{ set: boolean, source: "db" | "env" | null,
    value?: string }` (value only for non-secret keys).
  - `PUT /api/settings/integrations` `{ [key]: string | null }` → validates against the
    registry schema, writes, invalidates cache. `null` deletes.
  - `POST /api/settings/integrations/[group]/test` → `{ ok, detail }` within 10 s:

    | Group | Test |
    |---|---|
    | dataforseo | `userData()` → balance; detail `"Connected — $12.40 balance"` |
    | llm | one short chat completion (`"Reply with OK"`) via the adapter |
    | google | SA: mint a token; OAuth: validate client id/secret shape and show the redirect URI to register |
    | edenai | a minimal ask against the configured sonar model |
    | email | send a test message to the signed-in admin's address |
    | reddit | application-only OAuth token request |
    | apify | `GET /v2/users/me` |

  - `GET /api/settings/integrations/llm/models` → the provider's model list (`/v1/models` for
    OpenAI-compatible, `client.models.list()` for Anthropic); `[]` when unavailable.
- Test results render inline under the card; they never spend meaningfully (one row / one
  short completion).

## 11. Slice E — Setup wizard

### 11.1 Route and state machine

`src/app/(auth)/setup/page.tsx` (server) picks the first step whose **persisted** state is
pending and renders `src/components/setup-wizard.tsx` (client) at that step; completed steps
are revisitable. State is recorded explicitly rather than inferred from data, because inferred
predicates cannot tell "skipped" from "not done" and cannot tell a half-finished build from a
finished one:

- **Global steps** live in `settings` under a reserved, non-secret, hidden-from-Integrations
  group: `setup.llmStep` = `done | skipped`, `setup.completedAt`. Steps 1 and 2 need no record:
  "no users" and `!cfg.dataforseo.configured` are exact.
- **Per-project steps** live in `projects.onboarding jsonb`:
  `{ profile: "pending"|"done", competitors: "pending"|"skipped"|"done",
  build: "pending"|"running"|"done"|"failed", buildJobs: { refreshAll?, audit?, backlinks?,
  organic? } }` (job ids). `null` means a project created before M1 and is read as all-done, so
  existing projects never enter the wizard.

| Step | Pending when | Action → state written | Skippable |
|---|---|---|---|
| 1 Account | no users | `POST /api/setup/admin` → sign in | no |
| 2 DataForSEO | `!cfg.dataforseo.configured` | Test & save via Integrations routes; shows balance, signup link, one-line cost expectation | no — an "Exit setup" link goes to `/overview` (empty state points back) |
| 3 AI assistant | `setup.llmStep` unset | preset + key + model, Test → `done`; Skip → `skipped` | yes |
| 4 Your site | no projects, or `?step=site` | name, domain, a market select from the curated `MARKETS` table (`src/lib/markets.ts`, sets `defaultLocationCode` + `defaultLanguageCode`), device → `POST /api/projects` initializes `onboarding` as all-pending; the new project becomes current (`sp_project` cookie) so steps 5–7 act on it | no |
| 5 Profile | `onboarding.profile = pending` | `POST /api/projects/[id]/profile` (existing job) with live progress → existing `ProfileReview`; confirming (or adding manual keywords) → `done` | no |
| 6 Competitors | `onboarding.competitors = pending` | existing `CompetitorManager` + **Suggest** (§11.3); Continue → `done`, Skip → `skipped` | yes |
| 7 Build | `onboarding.build ∈ {pending, running, failed}` | Start → `running` + job ids for `refresh-all`, then `audit`, plus `backlinks`/`organic` when the checkbox "Also fetch backlinks and organic keywords (≈ $X)" (`estimateCost`) is on; the wizard polls the **recorded** ids, so closing the tab and returning resumes polling instead of enqueuing again; all done → `done`; any failed → `failed`, and Retry re-enqueues only the failed ones | no |
| Done | nothing pending | `setup.completedAt` set on first completion; redirect `/overview` | — |

- A skipped optional step never reappears in the wizard; it stays reachable in Settings.
- `/setup` is public only while no users exist; steps 2+ require an authenticated admin (step
  4+ any authenticated user, since members may add sites).
- Settings → Project gains an **Add a site** link to `/setup?step=site`; `ProjectCreateForm`
  and its test are removed.

### 11.2 Live progress

- `jobs.progress text null`.
- `JobHandler` ctx gains `progress: (message: string) => Promise<void>`; `drainOnce` and
  `runJob` supply an implementation that writes `jobs.progress` at most once per second (last
  write wins; the final message is always flushed).
- Handlers that loop call it: `rank-refresh` ("Checking keyword 42 of 150"), `profile-site`
  ("Crawling…", "Extracting seeds…", "Expanding 7 of 10 seeds…"), `competitor-intel`,
  `backlinks-refresh`, `organic-keywords-refresh`, `site-audit` ("Auditing page 12 of 25"),
  `gap-refresh`, `weekly-opportunities` ("Scoring…").
- `GET /api/jobs/[id]` returns `progress`; `useJob()` exposes `progress`; a shared
  `src/components/job-progress.tsx` renders it under every existing refresh button and inside
  the wizard.

### 11.3 Competitor suggest

- `src/lib/dataforseo/labs.ts` → `competitorsDomain(target, { limit: 10 })` wrapping
  `POST /v3/dataforseo_labs/google/competitors_domain/live`, fixture
  `competitors-domain-live.json` (recorded once, sanitized), cost-logged.
- `POST /api/projects/[id]/competitors/suggest` (session) → `{ suggestions: [{ domain,
  intersections, avgPosition }] }`, excluding the project's own domain and existing competitors.
- UI: `src/components/competitor-suggestions.tsx` — a Suggest button that renders rows with an
  Add action reusing the existing competitor `POST`; also mounted in `CompetitorManager` on the
  Competitors page.

## 12. Slice F — Provider seams

### 12.1 LLM — `src/lib/llm/`

| File | Content |
|---|---|
| `provider.ts` | `interface ChatProvider { chat(messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<string> }`; `ChatMessage` (existing shape); `PRESETS` table (provider → baseUrl, default model, needsKey); `LlmError` (status, body). |
| `openai-compatible.ts` | The existing `DeepSeekClient` generalized: `{ baseUrl, apiKey?, model, fetchImpl? }`; keeps the reasoning-model handling (reads `content`, ignores `reasoning_content`, generous `max_tokens`) and retry/backoff on 429/5xx. `deepseek.ts` is deleted. |
| `anthropic.ts` | Native adapter on `@anthropic-ai/sdk` (new dependency): `{ apiKey, model = "claude-opus-5", effort }`, calls the beta messages endpoint with `output_config: { effort }` and the server-side refusal fallback enabled (`fallbacks: "default"` + its beta header) so a policy decline reruns on a fallback model inside the same call; maps the system message to `system`, returns the concatenated text blocks; a final `stop_reason === "refusal"` throws `LlmError` with the `stop_details` category so callers degrade honestly. Typed SDK errors are mapped to `LlmError`. |
| `models.ts` | `listModels(cfg)` for the Integrations combobox. |

Consumers (`advisor.ts`, `profile-site`, `reddit/judge.ts`, `reddit/draft.ts`,
`ai-visibility-scan`) already take an injected chat function; they receive
`makeChatProvider(cfg)?.chat` with no other change.

### 12.2 Email — `src/lib/email/`

`sender.ts` defines `interface EmailSender { send(msg: { to, subject, html, text }): Promise<{
sent: boolean; reason?: string }> }`; `resend.ts` (existing) and `smtp.ts` (new, on
`nodemailer`) implement it; `makeEmailSender(cfg)` picks by `email.provider`. The AI-visibility
weekly report and the Reddit digest take an `EmailSender`.

### 12.3 DataForSEO

`src/lib/dataforseo/appendix.ts` → `userData()` wrapping `GET /v3/appendix/user_data` →
`{ balance, limits }`, fixture `user-data-live.json` (sanitized). Used by Test-connection and a
"Balance" line on the Usage page. Plus `competitorsDomain` (§11.3). No other wrapper changes.

### 12.4 MCP package

- `mcp/server.ts`: `DEFAULT_BSL_URL = "http://localhost:3000"`.
- `mcp/package.json`: name `@better-search-lab/mcp`, `bin: { "better-search-lab-mcp":
  "dist/server.js" }`, `files: ["dist"]`, `license: AGPL-3.0-only`, `publishConfig.access:
  public`. README rewritten around `npx @better-search-lab/mcp` with `BSL_URL` + `BSL_TOKEN`.

## 13. Slice G — Demo mode

- **Flag:** `DEMO_MODE=true` (bootstrap env). `src/lib/demo/mode.ts` → `isDemoMode()`.
- **Boot hook:** `src/instrumentation.ts` `register()` (guarded to `NEXT_RUNTIME === "nodejs"`)
  calls `ensureDemoSeeded(db)` when in demo mode: if the demo admin does not exist, runs the
  seeder; any failure is logged and recorded in memory so `/login` shows "Demo data failed to
  seed: <reason>" instead of the app crash-looping.
- **Seeder — `src/lib/demo/`:** `prng.ts` (mulberry32, fixed seed), `generators.ts` (rank
  random walks, metrics, GSC/GA daily series, backlinks, audit, AI-visibility, Reddit threads,
  usage rows), `seed.ts` (writes through existing store functions where they exist:
  `createProject`, `addCompetitor`, `addKeywords`, `saveGapRows`, the organic-keywords
  replace-all store, audit/backlinks/AI-visibility/Reddit stores; raw inserts for
  `rank_snapshots`, `keyword_metrics`, `gsc_daily`/`ga_daily`, `api_usage`, `jobs`).
  Dates are anchored to real "now"; values are deterministic.
  - Project 1 **Northwind Outdoor** (`northwind-outdoor.example`): 140 tracked keywords, 90
    days of daily snapshots, 3 competitors with intel + gaps, 12 weekly backlink snapshots, an
    audit, organic keywords, 90 days GSC + GA, 8 weekly AI-visibility scans, 6 Reddit
    conversations.
  - Project 2 **Harbor & Vale Legal** (`harborvale-law.example`): 40 keywords, 2 competitors,
    the same table coverage at smaller scale.
  - Opportunities: the seeder runs `assembleOpportunities` (the real engine) over the generated
    signals and stores the result, so the shortlist is consistent with the data behind it.
  - Demo admin `demo@example.com`, password `demo-password`, role `admin`.
- **Read-only, by allowlist.** When `DEMO_MODE` is set, middleware lets through only:
  `/api/auth/**` (any method), `GET /api/health`, `GET /api/selftest`, `GET /api/jobs/*`,
  `GET /api/mcp/**` (bearer-guarded, read-only), and `GET /api/settings/integrations`
  (read-only view). Every other `/api/**` request, **any method**, gets
  `403 { error: "This is a read-only demo." }`. An allowlist rather than a "non-GET" rule
  because the Google OAuth callback is a GET handler that writes (`upsertConnection` in
  `src/app/api/google/callback/route.ts`); it is session-guarded and returns before any write
  when Google is unconfigured, but the demo boundary must not depend on that. The root layout
  wraps the app in a `DemoProvider`; `useDemo()` lets refresh/track/dismiss/connect buttons
  render disabled with a "Read-only demo" tooltip. Integrations renders every group as
  "Connected (demo)" with no fields; Users shows the demo admin only. The worker exits
  immediately in demo mode (the demo compose file does not start it).
- **Demo MCP token.** Token minting is blocked like every other write, so the seeder inserts an
  `api_tokens` row for a fixed, documented token `bsl_demo_readonly` (hash stored, label
  "Demo"). Settings → MCP in demo mode shows it read-only, and `docs/mcp.md` lists it. Publishing
  it is safe because every `/api/mcp/*` route is read-only and the demo data is synthetic.
- **Demo login:** `/login` shows a single **Explore the demo** button that signs in with the
  demo credentials. A `src/components/demo-banner.tsx` strip sits above the header with a
  link to the repo.
- **Tests:** the seeder runs in pglite; a smoke test asserts every page loader (`computeDashboard`,
  `listOpportunities`, rankings, gaps, audit, backlinks, GSC, GA, AI-visibility, Reddit, usage)
  returns non-empty data for both projects and that the engine produced ≥ 10 opportunities for
  project 1. Determinism test: two seeds into two databases produce identical opportunity sets.

## 14. Slice H — Repo & release

### 14.1 License, scrub, fixtures (H1 — can start immediately)

- `LICENSE` = AGPL-3.0-only text; `package.json` and `mcp/package.json` `license` fields.
  Version → `1.0.0-rc.1` now, `1.0.0` at launch.
- Replace every "harperflow"/"HarperFlow", "supergenius", "betterbrainlab" occurrence in
  `src/`, `scripts/`, `mcp/`, `README.md`, `docs/` with neutral wording (e.g. "brand accent",
  "the AI-visibility engine", "your deployment"). `docs/superpowers/phase-2-deploy-notes.md` is
  deleted; its generic content moves into `docs/install.md`. Specs and plans under
  `docs/superpowers/` are kept and scrubbed of hostnames, paths, and company names; a
  `docs/superpowers/README.md` explains the spec → plan → build convention.
- Fixtures: `harperflow.io` → `example-site.com` in
  `src/lib/dataforseo/fixtures/{domain-intersection-live,serp-organic-live}.json`, shapes
  otherwise unchanged; tests updated to match.
- `.env.example` rewritten to the two required vars + optional `DEMO_MODE`, `APP_URL`,
  `ENCRYPTION_KEY`, with a comment pointing at Settings → Integrations for everything else.

### 14.2 CI (H1)

- `.github/workflows/ci.yml` on push/PR: pnpm install (frozen), `tsc --noEmit`, `vitest run`,
  the `tests/postgres/` suite against a Postgres 16 service container (`TEST_DATABASE_URL`),
  `next build` **with no env**, `cd mcp && npm ci && npx vitest run && npm run build`,
  `docker build`, then `docker compose -f docker-compose.demo.yml up -d` → poll `/api/health`
  → assert `/login` contains "Explore the demo" → `down`.
- `.github/workflows/release.yml` on `v*` tags: multi-arch (amd64/arm64) image to
  `ghcr.io/<org>/better-search-lab:<tag>` and `:latest`; `npm publish` for `mcp/`; a GitHub
  release with the changelog section.
- `.github/dependabot.yml`: monthly, npm (root + mcp) and github-actions.

### 14.3 Image and compose (H2)

- **Dockerfile** (multi-stage): `deps` (pnpm install, frozen) → `build` (`next build`, no env)
  → `runner` (`node:22-alpine`, `pnpm install --prod --frozen-lockfile`, copies `.next`,
  `public`, `src`, `drizzle`, `worker`, `package.json`, `pnpm-lock.yaml`, `next.config.ts`,
  `tsconfig.json`). `tsx` remains a production dependency (worker + migrate). Env defaults:
  `NODE_ENV=production`, `AUTH_TRUST_HOST=true`, `PORT=3000`. Web entrypoint:
  `pnpm db:migrate && pnpm start`; worker command: `pnpm worker`.
- **`docker-compose.yml`:** `db` (`postgres:16-alpine`, named volume, healthcheck),
  `web` (image or `build: .`, `depends_on: db: condition: service_healthy`, ports `3000`,
  env `DATABASE_URL`, `AUTH_SECRET=${AUTH_SECRET:?set AUTH_SECRET}`, `APP_URL`), and `worker`
  (same image, `pnpm worker`). All three start with a plain `docker compose up`.
  **`docker-compose.demo.yml`:** a standalone file with `db` + `web` only, `web` carrying
  `DEMO_MODE=true` and a fixed `AUTH_SECRET`, for the hosted demo, CI, and local
  try-before-configure. `.env.example` pairs with the main file.
- **`GET /api/health`** → `{ ok: true, version, db: "ok" | "error" }` (unauthenticated).
- Railway configs stay, updated to the new entrypoints, documented as the one-click alternative.

### 14.4 Docs and community files (H2)

- `README.md`: demo screenshot hero → what it is (one paragraph) → features with screenshots →
  compose quickstart → MCP section → **Costs** (what DataForSEO charges per feature, with the
  in-app meter as the honesty story) → architecture sketch → contributing → license.
- `docs/`: `install.md`, `configuration.md` (**generated** by `scripts/gen-config-docs.ts` from
  the registry; CI fails if stale), `integrations/{dataforseo,llm,google,email,reddit,ai-visibility}.md`,
  `mcp.md`, `upgrading.md` (incl. `ALLOWLIST` removal, legacy env aliases, first-admin
  promotion, one-time re-sign-in because sessions gain a version), `architecture.md`, `costs.md`, `faq.md`,
  `screenshots/` (captured from demo mode).
- `CONTRIBUTING.md` (dev setup, `docker compose up db`, test commands, spec → plan → build,
  conventional commits), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md`,
  `CHANGELOG.md` (Keep a Changelog; `1.0.0` entry), `.github/ISSUE_TEMPLATE/{bug,feature}.yml`,
  `.github/PULL_REQUEST_TEMPLATE.md`, `CLAUDE.md` (stack, conventions, test commands, the
  honesty invariant, where specs live).

## 15. Data-model changes (all additive; generated via drizzle-kit, one custom SQL migration)

| Change | Purpose |
|---|---|
| new table `settings` (§8.3) | in-app configuration |
| `jobs.progress text null` | live progress |
| `users.last_login_at timestamptz null` | Users page |
| `users.session_version integer not null default 1` | session revocation (§9.5) |
| `projects.onboarding jsonb null` | persisted wizard state (§11.1); `null` = pre-M1 project, read as complete |
| unique index `users_email_lower_idx` on `lower(email)` | hardening |
| custom migration: promote oldest user to admin if none (§9.1) | upgrade path |

## 16. Route and guard matrix (new routes)

| Route | Guard |
|---|---|
| `POST /api/setup/admin` | none; succeeds only when `users` is empty |
| `GET/PUT /api/settings/integrations`, `POST …/[group]/test`, `GET …/llm/models` | `requireAdmin` |
| `GET/POST /api/users`, `PATCH/DELETE /api/users/[id]` | `requireAdmin` |
| `POST /api/account/password` | `requireSession` |
| `POST /api/projects/[id]/competitors/suggest` | `requireSession` |
| `GET /api/health` | none |
| every `/api/**` request not on the demo allowlist (§13), any method | `403` in demo mode (middleware) |

## 17. Error handling

- **Config:** a missing or invalid setting never throws on a page; the group is `configured:
  false` and the page links to Integrations. An undecryptable value reads as unset, is logged
  once per process, and Integrations shows a "could not decrypt — re-enter" banner on that
  field. An env override that fails the registry schema is reported by Test and logged at
  startup; it does not crash boot.
- **Test-connection:** always `{ ok: false, detail }` with the provider's own message; 10 s
  timeout; never a generic "failed".
- **Wizard:** each job step shows the job's real `error`; Retry re-enqueues; Skip only where
  §11.1 allows. Progress text is only ever what a handler reported.
- **First run:** the advisory-locked transaction; the loser sees "An admin already exists —
  sign in."
- **Sessions:** an invalid session (deleted user, bumped version, pre-upgrade token) is a plain
  `401` on API routes and a redirect to `/login?reason=signed-out` with a one-line notice on
  pages. Never a stack trace, never a half-rendered page.
- **Demo:** seeder failure at boot → app starts, `/login` shows the reason. Mutations → `403`
  with a clear message.
- **Boot:** a migration failure exits non-zero (serving a mismatched schema is worse than being
  down). The worker's per-job config read failing (DB unreachable) fails that job with the real
  reason via the existing runner path.
- **LLM:** a refusal or provider error degrades exactly as today — advisor falls back to each
  opportunity's `why`; niche extraction falls back to heuristic seeds; the Reddit judge fails
  closed.

## 18. Testing

- **Pure units:** registry (every key has a unique env name; schemas validate); `crypto`
  round-trip, tamper detection, key derivation stability; `resolve` (env > db > unset, legacy
  aliases, cache invalidation, `envOverriddenKeys`); rate limiter window; dummy-hash path in
  `authorize`; seeder PRNG determinism; `userData` and `competitorsDomain` parsing against
  fixtures; OpenAI-compatible adapter (stubbed fetch, reasoning-content quirk, retries);
  Anthropic adapter (mocked SDK client, refusal mapping); SMTP adapter (stubbed transport);
  `PRESETS` completeness; the middleware demo-allowlist decision function (every listed path
  and method passes, everything else is refused, including `GET /api/google/callback`).
- **pglite integration:** settings routes (admin OK, member 403, secrets never echoed, env
  override read-only); `createFirstAdmin` refuses once any user exists; session validation
  (deleted user → `401` on API and redirect on pages; bumped `session_version` → `401`;
  demoted admin → `403` on the next admin call; a token without `sv` → `401`); wizard step
  selection from persisted state (skipped steps do not reappear; a `null` `onboarding` is
  complete; mid-build resume polls the recorded job ids instead of re-enqueuing; Retry
  re-enqueues only failed jobs); users invariants (last admin, self-delete); first-admin
  promotion migration; `jobs.progress` written and returned;
  `/api/health`; competitor suggest excludes own + existing domains; demo seeder feeds every
  loader and the engine (§13); lazy `db` Proxy instantiates once.
- **Component tests:** login form (states: normal, error, first-run redirect, demo button);
  wizard renders the correct step for each DB state and shows progress; integrations form
  (masking, env badge, preset fill, models combobox); users manager (invariants surfaced);
  settings tabs by role; job-progress.
- **Real-Postgres concurrency — `tests/postgres/`**, run only when `TEST_DATABASE_URL` is set
  (CI provides a Postgres 16 service container; locally `docker compose up db`). pglite is a
  single-connection engine and cannot reproduce a race, so these open two connections and run
  the calls concurrently: two `createFirstAdmin` → exactly one admin row; two demotions of the
  only two admins → at least one admin remains; two `writeSettings` on the same key → the last
  committed value wins and no torn value is ever read.
- **Build/packaging as tests:** `next build` with an empty environment in CI; the compose demo
  smoke in CI; `scripts/gen-config-docs.ts --check` in CI.
- Run `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm build`, and `cd mcp && npx
  vitest run` and read the actual output before claiming green.

## 19. Live verification checklist (LIVE-VERIFICATION MANDATE — owner-run, recorded in the plan's ledger)

1. Fresh machine: run the §21.1 acceptance test end to end, recording wall clock, active time,
   and meter spend; `/api/health` OK first.
2. During that run: balance shown at step 2; profile produces candidates; suggest lists real
   competitors; progress messages visible throughout; close the tab mid-build and reopen
   `/setup` → it resumes polling the same jobs rather than starting new ones.
3. Every Test-connection button with real credentials (DataForSEO, one OpenAI-compatible
   provider, Anthropic, SMTP, Resend, Google SA, Reddit, Apify, Eden AI).
4. Add a member user; confirm the member cannot reach Integrations/Users; change own password.
5. Upgrade the existing deployment with its env untouched: users sign in, oldest is admin,
   Integrations shows "set via environment" on every previously env-configured key, a scheduled
   worker tick still runs.
6. `DEMO_MODE=true` on a clean database: two projects, every page populated, every mutation
   blocked; `npx @better-search-lab/mcp` against it lists both projects.
7. Published image pulls and runs on amd64 and arm64.

## 20. Build order

A → B → C → D → E → F → G, with H1 (license, scrub, fixtures, CI) in parallel from the first
day and H2 (Dockerfile, compose, README, docs, community files) last. `writing-plans` may split
this into two plans at the F/G boundary if the task count warrants it.

## 21. Success criteria (M1 is done when all hold)

1. The install acceptance test (§21.1) passes.
2. `DEMO_MODE=true` boots a populated two-project demo with no keys and every mutation blocked.
3. The owner's deployment upgrades in place: users work, the oldest user is admin, integrations show "set via environment".
4. CI green on typecheck, tests, secret-free `next build`, MCP tests, Docker build, compose demo smoke, and the generated-docs check.
5. No internal references remain; `LICENSE` present; README and `docs/` complete; `configuration.md` generated.
6. `npx @better-search-lab/mcp` registers against a local instance.
7. The §19 checklist is complete.

### 21.1 Install acceptance test (repeatable; the numbers go into the README's cost section)

**Starting conditions.** A laptop with git and Docker Compose v2 on a residential connection;
nothing else installed. A DataForSEO account with at least $5 balance. A live site of at least
20 crawlable pages that already ranks for at least 50 keywords (the owner's own domain is the
reference site for M1 verification; any site meeting the bound is valid). No LLM key.

**Steps.** `git clone` → `cp .env.example .env` → set `AUTH_SECRET` (`openssl rand -base64 32`)
and `APP_URL` → `docker compose up -d` → open `APP_URL` → wizard: create admin; enter DataForSEO
credentials and Test; **Skip** the AI step; enter the site; Profile and confirm the candidates
(cap the tracked set at 150 keywords); add two competitors from Suggest; Build with the
backlinks/organic checkbox **off**; land on Overview.

**Pass criteria.**

| Measure | Bound |
|---|---|
| Person's active time (typing and clicking) | ≤ 5 min |
| Wall clock from `docker compose up` to a populated Overview | ≤ 10 min |
| DataForSEO spend for the run, as reported by the in-app meter | ≤ $1.00 for ≤ 150 tracked keywords (list-price estimate: profile ≈ $0.13, suggest $0.012, SERP 150 × $0.002 = $0.30, gaps 2 × $0.012, metrics ≤ $0.03 ≈ $0.50) |
| Files edited after `.env` | 0 |
| Overview after Build | Search Console/Analytics headline honestly "not connected"; "Do this next" non-empty; all four health tiles populated |

Run it three times (fresh volumes each time) during live verification; all three must pass.

## 22. Owner prerequisites (outside the code)

- A GitHub home the account suspension does not block — most likely a GitHub organization named
  for the product; the `<org>` in image and workflow names is filled in then.
- An npm organization `@better-search-lab`.
- Optionally a domain for the hosted demo.
- Recording two DataForSEO fixtures once (`competitors_domain`, `user_data`) with the owner's
  account, then sanitizing them.

## 23. Deferred (tracked, not in M1)

SSO and email invites; per-user MCP tokens; direct AI-visibility provider adapters; a docs site;
automated screenshots; DB-backed login rate limiting for multi-process deployments; a
`mustChangePassword` flow for admin-set passwords.
