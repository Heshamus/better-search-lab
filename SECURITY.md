# Security

Please report vulnerabilities privately through GitHub, at [https://github.com/<org>/better-search-lab/security/advisories/new](https://github.com/<org>/better-search-lab/security/advisories/new) — not in a public issue. You will hear back within five working days.

In scope: this repository, the published Docker image, and the `@better-search-lab/mcp` package. Out of scope: your own deployment's configuration, and the third-party APIs the app calls.

Design notes that matter for reports: integration secrets are encrypted at rest and never sent to the browser; every API route is session- or token-guarded; the demo refuses writes in middleware; login is rate-limited per account and per client address.
