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
    expect(d).toMatch(/FROM node:22-alpine AS deps/);
    expect(d).toMatch(/FROM node:22-alpine AS build/);
    expect(d).toMatch(/FROM node:22-alpine AS runner/);
    expect(d).toContain("ENV AUTH_TRUST_HOST=true");
    expect(d).toContain("pnpm install --prod --frozen-lockfile");
    expect(d).not.toMatch(/COPY \.env/);
    expect(read(".dockerignore")).toContain(".env");
  });
  it("Railway healthchecks the health route and migrates on start", () => {
    const r = JSON.parse(read("railway.json"));
    expect(r.deploy.healthcheckPath).toBe("/api/health");
    expect(r.deploy.startCommand).toBe("pnpm db:migrate && pnpm start");
  });
});
