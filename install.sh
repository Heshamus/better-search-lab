#!/bin/sh
# Better Search Lab installer. Docker (with Compose v2) is the only requirement.
#
#   curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh
#   curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh -s -- --demo
#
# It creates a folder, downloads the compose file, generates AUTH_SECRET into
# .env, starts the stack and waits for /api/health. Overrides, for forks and CI:
#   BSL_DIR           target folder (default: better-search-lab)
#   BSL_REF           git ref the compose file is downloaded from (default: main)
#   BSL_IMAGE         image to run instead of the published one (exported to compose)
#   BSL_COMPOSE_FILE  a local compose file to copy instead of downloading
#   BSL_PULL=0        skip `docker compose pull` (a local BSL_IMAGE cannot be pulled)
#   BSL_HEALTH_URL    where to wait for readiness (default: http://127.0.0.1:3000/api/health)
set -eu

MODE=app
for arg in "$@"; do
  case "$arg" in
    --demo) MODE=demo ;;
    -h|--help)
      echo "usage: install.sh [--demo]"
      echo "  --demo   start the read-only demo (two synthetic sites, no keys) instead of a real install"
      exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

RAW="https://gitlab.com/betterbrainlab/better-search-lab/-/raw/${BSL_REF:-main}"
DIR="${BSL_DIR:-better-search-lab}"
if [ "$MODE" = demo ]; then FILE=docker-compose.demo.yml; else FILE=docker-compose.yml; fi

command -v docker >/dev/null 2>&1 || { echo "Docker is required: https://docs.docker.com/get-docker/" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required (the 'docker compose' command)." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }

mkdir -p "$DIR"
# Copy or download before changing directory, so a relative BSL_COMPOSE_FILE works.
if [ -n "${BSL_COMPOSE_FILE:-}" ]; then
  cp "$BSL_COMPOSE_FILE" "$DIR/$FILE"
else
  curl -fsSL "$RAW/$FILE" -o "$DIR/$FILE"
fi
cd "$DIR"

if [ "$MODE" = app ] && [ ! -f .env ]; then
  if command -v openssl >/dev/null 2>&1; then
    SECRET="$(openssl rand -base64 32)"
  else
    SECRET="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
  fi
  printf 'AUTH_SECRET=%s\nAPP_URL=http://localhost:3000\n' "$SECRET" > .env
  chmod 600 .env
  echo "Wrote .env with a generated AUTH_SECRET. Change APP_URL there if this runs behind a domain."
fi

# Compose reads BSL_IMAGE from the environment; a fork or CI points it at another image.
if [ -n "${BSL_IMAGE:-}" ]; then export BSL_IMAGE; fi

if [ "${BSL_PULL:-1}" != 0 ]; then docker compose -f "$FILE" pull; fi
# --no-build: this folder has no Dockerfile. The image was pulled, or BSL_IMAGE names one that exists.
docker compose -f "$FILE" up -d --no-build

URL="${BSL_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
i=0
until curl -fsS "$URL" 2>/dev/null | grep -q '"ok":true'; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "The app did not report healthy within five minutes. Logs: docker compose -f $DIR/$FILE logs web" >&2
    exit 1
  fi
  sleep 5
done

echo "Better Search Lab is running at http://localhost:3000"
if [ "$MODE" = demo ]; then
  echo "Sign in with 'Explore the demo'. The demo MCP token is bsl_demo_readonly."
else
  echo "Open it to create your admin account and connect DataForSEO. Update later with: cd $DIR && docker compose pull && docker compose up -d"
fi
