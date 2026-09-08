import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// The installer is the first thing a self-hoster runs, piped through sh. It is
// tested for real in CI (demo-smoke runs it against the locally built image);
// here we pin its shape so a careless edit cannot ship a broken one-liner.
const script = readFileSync("install.sh", "utf8");

describe("install.sh", () => {
  it("is executable POSIX sh that parses", () => {
    expect(script.startsWith("#!/bin/sh\n")).toBe(true);
    expect(execFileSync("git", ["ls-files", "-s", "install.sh"], { encoding: "utf8" })).toMatch(/^100755 /);
    execFileSync("sh", ["-n", "install.sh"]);
    expect(script).toContain("set -eu");
  });
  it("downloads the compose file from the canonical raw URL and supports the demo", () => {
    expect(script).toContain("https://gitlab.com/betterbrainlab/better-search-lab/-/raw/");
    expect(script).toContain("docker-compose.demo.yml");
    expect(script).toContain("--demo");
  });
  it("generates AUTH_SECRET, honours the overrides, never builds, and waits for the health route", () => {
    expect(script).toContain("openssl rand -base64 32");
    expect(script).toContain("/dev/urandom");
    for (const v of ["BSL_DIR", "BSL_REF", "BSL_IMAGE", "BSL_COMPOSE_FILE", "BSL_PULL", "BSL_HEALTH_URL"]) expect(script, v).toContain(v);
    expect(script).toContain("up -d --no-build"); // the folder has no Dockerfile; the image was pulled or supplied
    expect(script).toContain("/api/health");
    expect(script).not.toMatch(/\$0/); // piped through sh, $0 is not the script
  });
  it("CI runs the installer against the locally built image before anything is published", () => {
    const ci = readFileSync(".gitlab-ci.yml", "utf8");
    const smoke = ci.match(/\ndemo-smoke:\n([\s\S]*?)(?=\n[\w.-]+:\n|$)/)?.[1] ?? "";
    expect(smoke).toContain("sh install.sh --demo");
    expect(smoke).toContain("docker build -t better-search-lab:ci .");
    expect(smoke).toContain("BSL_IMAGE=better-search-lab:ci");
  });
  it("the docs lead with the one-liner", () => {
    const oneLiner = "curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh";
    expect(readFileSync("README.md", "utf8")).toContain(oneLiner);
    expect(readFileSync("docs/install.md", "utf8")).toContain(oneLiner);
    expect(readFileSync("docs/install.md", "utf8")).toContain("sh -s -- --demo");
  });
});
