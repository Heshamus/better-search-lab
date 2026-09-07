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

## Between 1.x releases

`git pull && docker compose up -d --build`. Check the [CHANGELOG](../CHANGELOG.md) for anything marked *migration*.
