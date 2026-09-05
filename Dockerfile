# Self-host image for seo-web (Next start) and seo-worker (tsx worker) — same
# image, different compose command. Full toolchain kept (dev deps) so `tsx`
# powers both `db:migrate` and the worker at runtime. (Plan 2 makes this
# multi-stage.)
#
# `next build` needs NO env: the DB client is a lazy facade (src/db/client.ts)
# and every DB-backed page is `force-dynamic`, so nothing reads env at build time.
FROM node:22-alpine
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NODE_ENV=production
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
