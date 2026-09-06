-- Custom SQL migration file, put your code below! --
-- Existing installs were seeded by hand with role = 'member'. The first-run
-- wizard never shows when users exist, so promote the oldest user to admin
-- where no admin exists yet. No-op on fresh installs and on re-runs.
UPDATE "users" SET "role" = 'admin'
WHERE "id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "users" WHERE "role" = 'admin');