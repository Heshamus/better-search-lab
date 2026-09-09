# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://gitlab.com/betterbrainlab/better-search-lab/-/compare/v1.0.0...main
[1.0.0]: https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.0.0
