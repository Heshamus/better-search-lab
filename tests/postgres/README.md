# Real-Postgres tests

pglite (used by every other suite) is a single-connection engine and cannot
reproduce a race. The suites in this folder open two real connections and run
calls concurrently. They are skipped unless `TEST_DATABASE_URL` is set:

    docker run --rm -d --name bsl-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=bsl_test -p 5433:5432 postgres:16-alpine
    TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/bsl_test pnpm exec vitest run tests/postgres

The suite applies the repo's migrations to that database and truncates the
tables it touches before each test. Keep it to ONE file: Vitest runs files in
parallel and these share a database.
