# Self-host image for seo-web (Next start) and seo-worker (tsx worker) — same
# image, different compose command. Full toolchain kept (dev deps) so `tsx`
# powers both `db:migrate` and the worker at runtime.
#
# Build-time env is PLACEHOLDER only: `loadEnv()` (src/config/env.ts) runs at
# module import and would throw on a missing/!url DATABASE_URL, and the
# `postgres` client is constructed at import — but it's LAZY (no connect until
# a query) and every DB-backed page is `force-dynamic`, so `next build` never
# opens a socket. Real values are injected at runtime via compose `environment`.
FROM node:22-alpine
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NODE_ENV=production \
    DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    AUTH_SECRET=build_time_placeholder_secret_0123456789 \
    DATAFORSEO_LOGIN=build DATAFORSEO_PASSWORD=build \
    ALLOWLIST=build@example.com
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
