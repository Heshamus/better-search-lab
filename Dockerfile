# Better Search Lab — one image for the web app and the worker (spec §14.3).
#   web:    sh -c "pnpm db:migrate && pnpm start"
#   worker: pnpm worker
# `next build` needs NO env: the DB client is a lazy facade and every DB-backed
# page is force-dynamic. Nothing from a .env file is ever copied in (.dockerignore).

# deps: install every dependency (dev + prod) once, cached by the lockfile hash.
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# build: compile the Next.js app from the deps layer's node_modules and the full source.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# runner: the shipped image — prod-only deps plus just the build output and the
# runtime source `pnpm start`, `pnpm db:migrate` and `pnpm worker` need.
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app
ENV NODE_ENV=production
ENV AUTH_TRUST_HOST=true
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1
# Corepack caches the pinned pnpm under $COREPACK_HOME (default ~/.cache/node/
# corepack). Keep it inside /app so the `USER node` below can read what the
# root-run `pnpm install` here put there, instead of re-downloading pnpm at
# container start.
ENV COREPACK_HOME=/app/.corepack
COPY package.json pnpm-lock.yaml ./
# tsx and typescript are production dependencies on purpose: tsx runs db:migrate
# and the worker, and `next start` needs typescript to load next.config.ts —
# without it here, Next self-installs typescript at container startup instead.
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY src ./src
COPY drizzle ./drizzle
COPY worker ./worker
COPY next.config.ts tsconfig.json ./
# Drop privileges: nothing here needs root, and `next start` writes to
# .next/cache at runtime. node:22-alpine already ships an unprivileged `node`
# user (uid 1000); one chown covers the root-owned node_modules, the build
# output and the corepack cache.
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
