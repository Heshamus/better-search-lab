#!/bin/sh
# Boot sequence for the Hugging Face demo Space (Dockerfile.hf):
# fresh Postgres cluster → migrations → `next start` in DEMO_MODE, which seeds
# the synthetic dataset itself. Everything lives in the container's ephemeral
# filesystem; a restart is a clean demo again.
set -eu

: "${PGDATA:=/data/pg}"
: "${PORT:=7860}"
: "${DEMO_MODE:=true}"
: "${DATABASE_URL:=postgres://bsl:bsl@127.0.0.1:5432/bsl_demo}"
# A fixed fallback is acceptable here only because the demo holds nothing real and refuses every write.
: "${AUTH_SECRET:=demo-only-secret-not-for-production-0123456789}"
export PGDATA PORT DEMO_MODE DATABASE_URL AUTH_SECRET

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[hf] initialising Postgres cluster in $PGDATA"
  mkdir -p "$PGDATA"
  printf 'bsl' > /tmp/pgpass
  initdb -D "$PGDATA" -U bsl --pwfile=/tmp/pgpass --auth=scram-sha-256 --encoding=UTF8 >/dev/null
  rm -f /tmp/pgpass
  # Unix socket in /tmp: the default /run/postgresql is not writable by uid 1000.
  echo "unix_socket_directories = '/tmp'" >> "$PGDATA/postgresql.conf"
  echo "listen_addresses = '127.0.0.1'" >> "$PGDATA/postgresql.conf"
fi

pg_ctl -D "$PGDATA" -l /tmp/postgres.log -w start
trap 'pg_ctl -D "$PGDATA" -m fast stop' EXIT INT TERM

PGPASSWORD=bsl psql -h 127.0.0.1 -U bsl -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'bsl_demo'" | grep -q 1 \
  || PGPASSWORD=bsl psql -h 127.0.0.1 -U bsl -d postgres -c "CREATE DATABASE bsl_demo" >/dev/null

echo "[hf] running migrations"
pnpm db:migrate
echo "[hf] starting Better Search Lab demo on :$PORT"
exec pnpm start
