# Install

## Docker Compose (recommended)

Requirements: Docker with Compose v2.

```bash
git clone https://github.com/<org>/better-search-lab.git
cd better-search-lab
cp .env.example .env
```

Edit `.env`: set `AUTH_SECRET` to the output of `openssl rand -base64 32`, and `APP_URL` to the address people will open (`http://localhost:3000` on a laptop; `https://seo.example.com` behind a domain). Then:

```bash
docker compose up -d
```

Compose starts three services: `db` (Postgres 16 on a named volume), `web` (runs the migrations, then the app on port 3000), and `worker` (scheduled refreshes and on-demand jobs). Open `APP_URL` and follow the wizard.

- Update: `git pull && docker compose up -d --build`. Migrations run on every start and are idempotent; see [upgrading.md](upgrading.md).
- Logs: `docker compose logs -f web worker`.
- Backups: the database lives in the `db-data` volume; `docker compose exec db pg_dump -U bsl bsl > backup.sql`.

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

```bash
docker compose -f docker-compose.demo.yml up -d
```

boots the read-only demo (`DEMO_MODE=true`): two synthetic sites, every page populated, every write refused. Sign in with **Explore the demo**. The demo MCP token is `bsl_demo_readonly`.
