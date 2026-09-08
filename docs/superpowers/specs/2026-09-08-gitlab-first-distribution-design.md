# GitLab-first distribution — design

**Date:** 2026-09-08 · **Status:** approved by the owner in conversation · **Scope:** stream A of the release plan (the M1 spec's §22 assumed GitHub; this note replaces that assumption).

## Decisions

| Topic | Decision |
|---|---|
| Canonical repository | `https://gitlab.com/betterbrainlab/better-search-lab` (the existing `origin`). Issues, merge requests, CI, releases and the container registry live here. |
| GitHub | A read-only push mirror at `https://github.com/Heshamus/better-search-lab`, kept in sync by GitLab's built-in repository mirroring (owner configures it once). It exists for discovery only: issues, wiki and projects are turned off on GitHub, and the `.github/` folder in the tree only redirects people to GitLab. |
| Image | `registry.gitlab.com/betterbrainlab/better-search-lab:{version,latest}`, multi-arch (amd64, arm64), built by the tag pipeline. A Docker Hub copy is pushed when `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` CI variables exist; otherwise the job says so and continues. |
| MCP package | `@better-search-lab/mcp` on npmjs, published by the tag pipeline with `NPM_TOKEN` and npm provenance (GitLab CI/CD is a supported provenance source). |
| Releases | GitLab Releases, created by the tag pipeline from the matching `CHANGELOG.md` section. |
| Install | One command, Docker the only requirement: `curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh \| sh` (add `-s -- --demo` for the read-only demo). Compose stays underneath; cloning the repository remains the "from source" path. |
| Organisation name | `betterbrainlab` becomes public and leaves the internal-names blocklist. The other blocked terms stay blocked. |
| Security reports | GitLab confidential issues (`/-/issues/new?issue[confidential]=true`) instead of GitHub private vulnerability reporting. |
| Dependency bots | Dependabot is GitHub-only and is removed with the workflows. Renovate on GitLab is left for later. |

## Why these

- GitLab gives CI, a registry, releases and issue templates in one place with nothing to install; the owner's remote already points there.
- A mirror that accepts issues or pull requests splits the community; redirect-only keeps one queue.
- The install script removes the clone, the copy of `.env.example` and the secret generation from the first-run path, which is where most self-host abandonment happens.
- Deriving the image name from `CI_REGISTRY_IMAGE` and letting `install.sh` read `BSL_IMAGE` means forks work without editing anything.

## Out of scope here

The self-contained demo image, the demo hosting (VPS, Hugging Face Space), the Codeberg mirror, Renovate, and the reach work. Each is its own stream in the release plan.
