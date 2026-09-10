# Self-host lifecycle — design

**Date:** 2026-09-10 · **Status:** approved in conversation · **Scope:** help a self-hoster keep Better Search Lab running across reboots and up to date, within what a containerized web app can actually do. Functional feature, **separate from the Daylight visual redesign** (`2026-09-10-daylight-light-redesign-design.md`).

## The constraint this design respects

The app runs inside a Docker container. It **cannot** start the Docker daemon or Docker Desktop, and it **cannot** change its own containers' restart policy, from within — those are host concerns. The only way to give the app that reach is to mount the host Docker socket into the container, which is effectively host root and a container-escape risk on a machine the user also uses. **We do not mount the Docker socket into the app.** So everything here either (a) is configured on the host (compose/docs), (b) informs the user in-app and hands them the command, or (c) is a separate, well-known opt-in tool the user knowingly runs.

Already shipped (prerequisite): `restart: unless-stopped` on `db`/`web`/`worker` in both compose files (commit 3945658), so the stack returns whenever the Docker daemon starts.

## Capabilities

### 1. Update notifier (in-app, informational)

- **Check:** a daily worker cron job (`src/lib/jobs/`, registered in the scheduler) fetches the latest published version from the **public** GitLab releases API — `GET $GITLAB/api/v4/projects/betterbrainlab%2Fbetter-search-lab/releases/permalink/latest` (no auth). It reads the tag (e.g. `v1.1.0`), and stores `latestVersion` + `checkedAt` in a new `updates` settings group. Fail-soft: a network error leaves the last known value and never surfaces an error to the user (respects offline installs).
- **Compare:** the app's own version comes from `package.json` (as `/api/health` already does). A small pure `isNewer(current, latest)` semver compare (unit-tested) decides.
- **Surface:** when `latestVersion` > current and the admin hasn't dismissed *that* version, show a quiet, dismissible banner (admin-only) — "Better Search Lab v1.1.0 is available" + the update command + a link to the release notes. Dismissal stores the dismissed version (re-appears on the next new version). Styled in Daylight.
- **Toggle & privacy:** a setting `updates.checkEnabled` (default **on**). This is the app's only outbound call; a self-hoster who wants zero external traffic turns it off and the job no-ops. Documented as such.

### 2. Settings → "Running & updates" panel (admin-only)

A new settings page/section that is honest guidance, not host control:
- **Version status:** current version, "up to date" or "update available: vX".
- **Update:** the command, with a copy button — `cd better-search-lab && docker compose pull && docker compose up -d` — and a note that migrations run automatically on start and data persists in the `db-data` volume.
- **Keeping it running:** explains the stack now uses `restart: unless-stopped`; on a VPS it returns on boot automatically; on Docker Desktop (Mac/Windows) also enable "start on login." Copy buttons for manual `docker compose up -d` / `down`.
- **Update notifications toggle** (writes `updates.checkEnabled`).
- **Hands-off auto-update:** documents the opt-in Watchtower option (below) with the snippet, clearly labeled as running Watchtower with the Docker socket by the user's choice.
- A plain sentence that the app runs in Docker and can't start Docker or change these settings itself — these are commands you run on the host.

### 3. First-login prompt (one-time, admin)

On the first admin session, a single dismissible card (dismissal stored in the existing onboarding jsonb, like other one-time UI): a two-line summary — the app auto-restarts as long as Docker starts (link to the panel for the Docker-Desktop-on-login step), and update notifications are on (with a link to turn them off). Not a wizard step; a quiet card that never returns once dismissed.

### 4. Opt-in Watchtower (hands-off auto-update, host-level)

- A committed **overlay** `docker-compose.watchtower.yml` (used as `docker compose -f docker-compose.yml -f docker-compose.watchtower.yml up -d`) plus docs, defining a Watchtower service that watches the registry image and recreates `web`/`worker` when a new `:latest` is pushed. **Off by default** — nothing runs it unless the user composes it in.
- Watchtower needs the Docker socket; that is Watchtower's design and the user's explicit opt-in, and is entirely separate from our app, which never gets the socket. The panel and `docs/upgrading.md` explain the trade-off (hands-off vs. an extra privileged container).

## Data & interfaces

- New settings group `updates` in `src/lib/config/registry.ts`: `checkEnabled: boolean` (default true), `latestVersion: string | null`, `checkedAt: timestamp | null`, `dismissedVersion: string | null`. Run `pnpm docs:config` after editing the registry.
- Pure helper `isNewer(current, latest): boolean` in `src/lib/updates/` (semver-ish compare of `x.y.z`), fully unit-tested.
- Worker job `checkForUpdate` in `src/lib/jobs/handlers/` + a daily schedule in the scheduler; guarded by `checkEnabled`; the GitLab fetch goes through a thin, fixture-tested client (no network in tests).
- Server reads current version from `package.json` (shared helper) and the stored `updates.*` for the banner and panel; the toggle and dismissal are session-guarded admin API routes, like other settings mutations.

## Testing

- `isNewer` unit tests (equal, older, newer, missing/malformed).
- The update-check client against a recorded GitLab-releases fixture; asserts fail-soft on a non-2xx / network error (no throw, no surfaced error).
- Component tests: the banner shows only when newer + not dismissed + admin; the panel renders the commands and the toggle.
- No test performs real network I/O (repo rule).

## Scope / sequencing

- **Separate from Daylight.** Recommended order: land Daylight first, then build this in the new design (so the banner, panel, and card are Daylight-native and not restyled twice). If it lands first, its UI adopts Daylight tokens when the redesign sweeps through.
- Appearance of the new UI follows the Daylight conventions.

## Out of scope

- The app changing host Docker settings or restart policy directly (the socket line we won't cross).
- In-app "click to update" that recreates the app's own containers (that needs the socket; use Watchtower or the command).
- Non-Docker installs' lifecycle (bare metal / Railway manage their own restart & update; the panel notes this and shows the relevant command where it differs).

## Done criteria

1. Standard gates green; `pnpm docs:config` current after the registry change; no networked tests.
2. Update banner appears only for admins when a newer release exists and isn't dismissed; toggling checks off stops the job and the banner.
3. The Settings panel shows accurate version status and working copy-paste commands; the first-login card appears once.
4. `docker-compose.watchtower.yml` overlay composes cleanly and is documented as opt-in; the app itself never mounts the Docker socket.
