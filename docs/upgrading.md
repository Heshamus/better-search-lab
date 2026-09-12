# Upgrading

Migrations run automatically when the `web` container starts (`pnpm db:migrate`), and are safe to re-run. Read this page before upgrading an install created before the 1.0 line.

## From a pre-1.0 install

- **Your `.env` keeps working.** Every integration variable (`DATAFORSEO_LOGIN`, `DEEPSEEK_API_KEY`, `RESEND_API_KEY`, `GOOGLE_*`, …) is still honoured as an *override*: the field shows as "set via environment" under Settings → Integrations. Move values into the app whenever you like; delete them from the environment afterwards. Full list: [configuration.md](configuration.md).
- **`ALLOWLIST` is gone.** The users table is the allowlist. The migration promotes the **oldest user to admin** when no admin exists; that person adds everyone else under Settings → Users.
- **Everyone signs in again once.** Sessions now carry a version, so tokens issued before the upgrade are rejected with "You were signed out".
- **Case-variant duplicate emails block one migration.** `users.email` becomes unique case-insensitively. If your table has `Bob@example.com` and `bob@example.com`, the migration fails with a message that includes this query; run it first, merge or rename the duplicates, then start again:

  ```sql
  SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;
  ```

- **Report emails need a recipient.** The old hardcoded fallback address is gone. Set `REPORT_EMAIL_TO` or Settings → Integrations → Email → Report recipient, or the weekly AI-visibility report and the daily Reddit digest are skipped (the worker says so at startup).
- **`APP_URL`** was recommended before and still is: Google OAuth, email links and the auth redirect base all read it.
- **The setup wizard asks once about the AI assistant.** An existing install is shown the AI-assistant step one time so it can record a choice — unless an LLM is already configured, in which case the step never appears. Skipping it changes nothing; Settings → "Add a site" goes straight to the site step either way.

## Between 1.x releases

### Updating

```bash
cd better-search-lab && docker compose pull && docker compose up -d
```

Source installs: `git pull && docker compose up -d --build`. Either way, migrations run automatically when the `web` container starts (`pnpm db:migrate`) and are safe to re-run — there's no separate migration step to remember. Your data lives in the `db-data` named volume, not in the containers, so pulling a new image and recreating `web`/`worker` never touches it. Check the [CHANGELOG](../CHANGELOG.md) for anything marked *migration*.

### Keeping it running

Every service in `docker-compose.yml` starts with `restart: unless-stopped`, so Docker brings the whole stack back on its own after a host reboot or a crash — no systemd unit or cron job needed. The one thing Better Search Lab can't do from inside its own container is start Docker itself: on Docker Desktop (Mac/Windows), turn on **Settings → General → Start Docker Desktop when you log in**; on Linux, `systemctl enable docker` (most distributions already default to this).

```bash
docker compose up -d      # start (or resume) the stack
docker compose down       # stop it; data in db-data is untouched
```

### Hands-off auto-update with Watchtower

For updates without even the copy-pasted command above, opt in to the bundled [Watchtower](https://containrrr.dev/watchtower/) overlay. It polls the registry, and when a new `:latest` lands for the `web`/`worker` image it pulls it and recreates just those two containers automatically:

```bash
docker compose -f docker-compose.yml -f docker-compose.watchtower.yml up -d
```

`docker-compose.watchtower.yml` merges onto `docker-compose.yml` — it adds one extra `watchtower` container and a label on `web`/`worker` so Watchtower knows what to watch; it never edits `docker-compose.yml` itself, and `db` is left alone.

The trade-off is deliberate, not hidden: Watchtower needs the Docker socket (`/var/run/docker.sock`) to recreate containers, which is effectively root on the host. That's Watchtower's design, not Better Search Lab's — the app's own `web`/`worker` containers never get the socket, and nothing runs Watchtower unless you compose it in with the command above. If you'd rather not run an extra privileged container, the plain `docker compose pull && docker compose up -d` above is the same two commands with no socket involved; you just run it yourself instead of it running on a timer.

Stop auto-updates any time with `docker compose stop watchtower`, or simply leave the overlay out of future `up -d` calls.

### Installs without Docker

Railway and bare-metal installs don't use `docker-compose.yml`, so neither `restart: unless-stopped` nor Watchtower applies — each manages its own process lifecycle instead:

- **Railway** restarts crashed services on its own and redeploys automatically on every push to the branch it's watching. To update: push (or redeploy from the Railway dashboard) — `railway.json`'s start command runs migrations before starting the app, same as the Docker image, so there's no separate migrate step.
- **Bare metal** has no supervisor built in. Put `pnpm start` and `pnpm worker` under whatever your host already uses (systemd, pm2, or another process manager) so they restart on crash and on boot. To update: `git pull`, `pnpm install`, `pnpm db:migrate`, `pnpm build`, then restart both processes yourself.
