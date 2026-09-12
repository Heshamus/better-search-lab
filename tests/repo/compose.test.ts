import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("compose and image contract (spec §14.3)", () => {
  it("docker-compose.yml runs db, web and worker from the same image with a health-gated db", () => {
    const y = read("docker-compose.yml");
    for (const svc of ["  db:", "  web:", "  worker:"]) expect(y).toContain(svc);
    expect(y).toContain("postgres:16-alpine");
    expect(y).toContain("condition: service_healthy");
    expect(y).toContain("AUTH_SECRET: ${AUTH_SECRET:?set AUTH_SECRET");
    expect(y).toContain("APP_URL: ${APP_URL:-http://localhost:3000}");
    expect(y).toMatch(/DATABASE_URL: postgres:\/\/\w+:\w+@db:5432\/\w+/);
    expect(y).toContain("pnpm db:migrate && pnpm start");
    expect(y).toContain("pnpm worker");
    expect(y).toContain("/api/health");
  });
  it("docker-compose.demo.yml is standalone, has no worker, and needs no keys", () => {
    const y = read("docker-compose.demo.yml");
    expect(y).toContain("DEMO_MODE: \"true\"");
    expect(y).not.toContain("  worker:");
    expect(y).not.toContain("${AUTH_SECRET");
    expect(y).toContain("AUTH_SECRET:");
  });
  it("the Dockerfile is three-stage and never bakes an env file", () => {
    const d = read("Dockerfile");
    expect(d).toMatch(/FROM --platform=\$BUILDPLATFORM node:22-alpine AS deps/);
    expect(d).toMatch(/FROM --platform=\$BUILDPLATFORM node:22-alpine AS build/);
    expect(d).toMatch(/FROM node:22-alpine AS runner/);
    expect(d).toContain("ENV AUTH_TRUST_HOST=true");
    expect(d).toContain("pnpm install --prod --frozen-lockfile");
    // The shipped image drops privileges: web and worker both run as uid 1000.
    expect(d).toContain("USER node");
    expect(d).not.toMatch(/COPY \.env/);
    expect(read(".dockerignore")).toContain(".env");
  });
  it("Railway healthchecks the health route and migrates on start", () => {
    const r = JSON.parse(read("railway.json"));
    expect(r.deploy.healthcheckPath).toBe("/api/health");
    expect(r.deploy.startCommand).toBe("pnpm db:migrate && pnpm start");
  });
});

describe("opt-in Watchtower overlay + upgrading docs (spec §self-host-lifecycle)", () => {
  it("docker-compose.watchtower.yml adds a Watchtower service, scoped to web/worker via label-enable, without editing the base compose file", () => {
    const y = read("docker-compose.watchtower.yml");
    expect(y).toContain("watchtower:");
    expect(y).toContain("containrrr/watchtower");
    // The docker socket is Watchtower's own explicit trade-off, not the app's.
    expect(y).toContain("/var/run/docker.sock:/var/run/docker.sock");
    // Scoped to web/worker only (never db, never itself) via label-enable.
    expect(y).toContain("--label-enable");
    expect(y).toContain("com.centurylinklabs.watchtower.enable=true");
    expect(y).toContain("  web:");
    expect(y).toContain("  worker:");
    expect(y).not.toContain("  db:");
    // The base compose file is untouched — this is a merge overlay, not an edit.
    const base = read("docker-compose.yml");
    expect(base).not.toContain("watchtower");
    expect(base).not.toContain("com.centurylinklabs");
  });
  it("the panel's opt-in command references this exact overlay filename", () => {
    // src/components/running-updates-panel.tsx hardcodes this string; if the
    // overlay were ever renamed, that link would silently 404.
    expect(read("src/components/running-updates-panel.tsx")).toContain(
      "docker compose -f docker-compose.yml -f docker-compose.watchtower.yml up -d",
    );
  });
  it("docs/upgrading.md documents the update command and the opt-in Watchtower path", () => {
    const md = read("docs/upgrading.md");
    expect(md).toContain("cd better-search-lab && docker compose pull && docker compose up -d");
    expect(md).toContain("db-data");
    expect(md).toContain("restart: unless-stopped");
    expect(md).toContain("Watchtower");
    expect(md).toContain("docker compose -f docker-compose.yml -f docker-compose.watchtower.yml up -d");
    expect(md).toContain("docker.sock");
    // Non-Docker installs manage their own restart + update.
    expect(md).toContain("Railway");
    expect(md).toContain("Bare metal");
  });
});
