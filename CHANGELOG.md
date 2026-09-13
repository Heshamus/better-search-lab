# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.1] - 2026-09-13

### Fixed
- AI-assistant setup could fail for every provider with a mix of errors (an empty answer, or 400/404). Four causes, each fixed: the connection test capped the reply at 20 tokens, so reasoning models spent the whole budget thinking and returned no text; the OpenAI-compatible client always sent `max_tokens`, which OpenAI's `gpt-5`/o-series reject in favour of `max_completion_tokens`; the Anthropic client always sent enhanced parameters the API can reject; and the DeepSeek preset defaulted to a non-existent `deepseek-flash` model. Now the test proves connectivity on any clean response, the OpenAI-compatible client retries with `max_completion_tokens` when a provider requires it, the Anthropic client falls back to a plain Messages call, and DeepSeek defaults to `deepseek-chat`.

## [1.1.0] - 2026-09-13

### Added
- Optional single-user / no-auth mode (`BSL_SINGLE_USER=1`) for localhost self-hosters: skips login and the account setup step, auto-provisions one built-in admin, and shows a persistent "don't expose this server to a network" banner. Default off; ignored in demo mode.
- Self-service account reset: on a sole-user install, a "Delete account" action (Settings → Account) removes your login and returns the app to first-run setup for a fresh admin. Your data is untouched.
- Self-host update lifecycle: a daily, fail-soft check against the latest GitLab release, an admin "update available" banner, a Settings → Running & updates panel, a one-time first-run guidance card, and an opt-in Watchtower auto-update overlay (`docker-compose.watchtower.yml`). Checks are inert in demo mode and dismissible per install.

### Changed
- The entire app interface moved to the light "Daylight" design — app shell, navigation, charts, tables, Overview, Opportunities, Rankings, Audit, Competitors, Backlinks, AI Visibility, Search Console, Analytics, Usage/MCP, login, the setup wizard, and Settings. Dark styling has been removed.
- The DeepSeek assistant preset now defaults to `deepseek-flash`.

### Fixed
- The Docker stack now restarts automatically after a host reboot (`restart: unless-stopped`).

## [1.0.0] - 2026-09-09

The first public release.

### Added
- In-app configuration for every integration (Settings → Integrations) with encrypted storage; environment variables still override.
- Real user accounts with admin and member roles, a locked first-run admin, session revocation, login rate limiting.
- A setup wizard: account, DataForSEO, AI assistant, site, profile, competitor suggestions, first build — with live job progress.
- Provider-pluggable AI assistant (OpenAI-compatible and Anthropic) and email (Resend, SMTP).
- Read-only demo mode with two synthetic sites (`DEMO_MODE=true`).
- `/api/health`, a three-stage Docker image, `docker-compose.yml`, `docker-compose.demo.yml`.
- The MCP server (`@better-search-lab/mcp`), attached to every release as a tarball that `npx` runs from its URL.
- Generated configuration docs, install and upgrade guides.

### Changed
- *Migration:* `ALLOWLIST` is removed; the oldest user becomes admin; everyone signs in again once.
- *Migration:* emails must be unique case-insensitively.
- Report emails require a configured recipient (no hardcoded fallback).

[Unreleased]: https://gitlab.com/betterbrainlab/better-search-lab/-/compare/v1.1.1...main
[1.1.1]: https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.1.1
[1.1.0]: https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.1.0
[1.0.0]: https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.0.0
