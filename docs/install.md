# Install

## One command (recommended)

Requirements: Docker with Compose v2, and `curl`.

```bash
curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh
```

The installer creates a `better-search-lab` folder next to where you ran it, downloads `docker-compose.yml`, writes a `.env` with a generated `AUTH_SECRET` and `APP_URL=http://localhost:3000`, pulls the published image, starts `db` (Postgres 16 on a named volume), `web` (runs the migrations, then the app on port 3000) and `worker` (scheduled refreshes and on-demand jobs), and waits for `/api/health`. Open the address it prints and follow the wizard. Behind a domain, set `APP_URL` in that `.env` to the public address and run `docker compose up -d` again.

For the read-only demo instead: `curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh -s -- --demo`.

- Update: `cd better-search-lab && docker compose pull && docker compose up -d`. Migrations run on every start and are idempotent; see [upgrading.md](upgrading.md).
- Logs: `docker compose logs -f web worker`.
- Backups: the database lives in the `db-data` volume; `docker compose exec db pg_dump -U bsl bsl > backup.sql`.
- Forks and other registries: `BSL_IMAGE=your.registry/better-search-lab:tag` in the environment before the command runs that image instead.

## From source

```bash
git clone https://gitlab.com/betterbrainlab/better-search-lab.git
cd better-search-lab
cp .env.example .env            # set AUTH_SECRET (openssl rand -base64 32) and APP_URL
docker compose up -d --build
```

The same three services, built from the working tree. Update with `git pull && docker compose up -d --build`.

## Behind a reverse proxy

Point the proxy at `web:3000` and set `APP_URL` to the public address. The app trusts the forwarded host by default (`AUTH_TRUST_HOST=true` in the image). If two proxies sit in front of the app (for example Cloudflare and nginx), set `TRUSTED_PROXY_HOPS=2` so login rate limiting sees the real client address.

## Railway

Create a project from the repository; it picks up `railway.json` (the web service: migrate, then start, healthcheck `/api/health`). Add a second service from the same repository with **Config File Path** `railway.worker.json`. Set `DATABASE_URL`, `AUTH_SECRET` and `APP_URL` on both.

## Bare metal

Node 22, pnpm 10, Postgres 16.

```bash
pnpm install
export DATABASE_URL=postgres://user:password@localhost:5432/better_search_lab AUTH_SECRET=… APP_URL=…
pnpm db:migrate
pnpm build && pnpm start      # the app
pnpm worker                   # in a second process
```

## The demo

The installer's `--demo` flag is the short way; from a clone:

```bash
docker compose -f docker-compose.demo.yml up -d
```

boots the read-only demo (`DEMO_MODE=true`): two synthetic sites, every page populated, every write refused. Sign in with **Explore the demo**. The demo MCP token is `bsl_demo_readonly`.
