# GitLab-first distribution — design

**Date:** 2026-09-08 · **Status:** approved by the owner in conversation · **Scope:** stream A of the release plan (the M1 spec's §22 assumed GitHub; this note replaces that assumption).

## Decisions

| Topic | Decision |
|---|---|
| Canonical repository | `https://gitlab.com/betterbrainlab/better-search-lab` (the existing `origin`). Issues, merge requests, CI, releases and the container registry live here. |
| GitHub | A read-only push mirror at `https://github.com/Heshamus/better-search-lab`, kept in sync by GitLab's built-in repository mirroring (owner configures it once). It exists for discovery only: issues, wiki and projects are turned off on GitHub, and the `.github/` folder in the tree only redirects people to GitLab. |
| Image | `registry.gitlab.com/betterbrainlab/better-search-lab:{version,latest}`, multi-arch (amd64, arm64), built by the tag pipeline. A Docker Hub copy is pushed when `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` CI variables exist; otherwise the job says so and continues. |
| MCP package | Not published to npmjs (revised 2026-09-09: the owner's npm account is unavailable, and npm is a GitHub company). The tag pipeline runs `npm pack` on `mcp/`, stores `better-search-lab-mcp.tgz` in the project's generic package registry and links it from the GitLab Release at `https://gitlab.com/betterbrainlab/better-search-lab/-/releases/<tag>/downloads/better-search-lab-mcp.tgz`. Users run it with `npx -y <that URL>`; the docs pin the current version's URL because `npx` keeps whatever it first fetched from a fixed URL. The package keeps its name `@better-search-lab/mcp`. |
| Releases | GitLab Releases, created by the tag pipeline with the GitLab CLI (`glab`; `release-cli` is deprecated since GitLab 18.0) from the matching `CHANGELOG.md` section, with the MCP tarball attached. |
| Install | One command, Docker the only requirement: `curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh \| sh` (add `-s -- --demo` for the read-only demo). Compose stays underneath; cloning the repository remains the "from source" path. |
| Organisation name | `betterbrainlab` becomes public and leaves the internal-names blocklist. The other blocked terms stay blocked. |
| Security reports | GitLab confidential issues (`/-/issues/new?issue[confidential]=true`) instead of GitHub private vulnerability reporting. |
| Dependency bots | Dependabot is GitHub-only and is removed with the workflows. Renovate on GitLab is left for later. |

## Why these

- GitLab gives CI, a registry, releases and issue templates in one place with nothing to install; the owner's remote already points there.
- A mirror that accepts issues or pull requests splits the community; redirect-only keeps one queue.
- The install script removes the clone, the copy of `.env.example` and the secret generation from the first-run path, which is where most self-host abandonment happens.
- Deriving the image name from `CI_REGISTRY_IMAGE` and letting `install.sh` read `BSL_IMAGE` means forks work without editing anything.
- A release download needs no account anywhere: `npx` runs a tarball from a URL exactly as it runs a registry package, and the only remaining contact with npm is fetching third-party dependencies, which every Node project has.

## Out of scope here

The self-contained demo image, the demo hosting (VPS, Hugging Face Space), the Codeberg mirror, Renovate, and the reach work. Each is its own stream in the release plan.
