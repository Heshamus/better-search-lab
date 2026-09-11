import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // react() is required for .tsx test files, not just style: tsconfig.json
  // sets `"jsx": "preserve"` (Next.js's SWC compiler does the real
  // transform at build time), and without a JSX-transforming plugin here
  // Vite's SSR transform leaves raw JSX in place, which the module
  // evaluator then fails to parse ("Unexpected JSX expression"). This is
  // the first task to add .tsx test files, so it's the first task that
  // needs this.
  plugins: [tsconfigPaths(), react()],
  test: {
    // Default stays "node" for the existing lib/db/job suites. Component
    // tests opt into jsdom per-file via a "// @vitest-environment jsdom"
    // docblock (Vitest 4 dropped `environmentMatchGlobs`; this is the
    // current-correct per-file mechanism) — see tests/components/*.
    environment: "node",
    setupFiles: ["./tests/setup/vitest-setup.ts"],
    // mcp/ is a standalone package (its own package.json, its own npm-managed
    // node_modules, its own vitest.config.ts — see mcp/README.md) that may
    // never have had `npm i` run for it in a given checkout. Vitest 4's
    // default exclude is only node_modules + .git (no "dist"), so without
    // this it sweeps in mcp/tests/server.test.ts AND, once mcp/ has been
    // built locally, the compiled duplicate mcp/dist/tests/server.test.js —
    // and tries to run both under THIS config/environment instead of mcp's
    // own. Run mcp's suite from inside mcp/: `cd mcp && npx vitest run`.
    // .worktrees/**: a dev worktree nested under the repo root (the Superpowers
    // workflow puts them there) is a full copy of tests/**, so running the suite
    // from the main checkout would double-scan every test — and can spuriously
    // fail on a path/cwd-sensitive one.
    exclude: ["**/node_modules/**", "**/.git/**", "mcp/**", "**/.worktrees/**"],
    // tests/postgres/** is matched by the default include and self-skips
    // (describe.skipIf) unless TEST_DATABASE_URL is set — see tests/postgres/README.md.
    // Every DB test builds a fresh PGlite via drizzle-kit `pushSchema`
    // (introspect + diff + apply the whole schema). Under vitest's parallel
    // file execution, dozens of concurrent pushSchema calls contend and blow
    // past the 5s default — a flaky, table-count-sensitive timeout that grows
    // as the schema does. 30s absorbs the contention without changing what any
    // test does. (If this ever proves insufficient, cap file parallelism.)
    testTimeout: 30_000,
    hookTimeout: 30_000,
    server: {
      deps: {
        // next-auth (reached via `@/auth` from every guarded API route) is
        // SSR-externalized by default, so vitest hands it to Node's native
        // ESM loader — which can't resolve its bare `next/server` /
        // `next/headers` imports (no extension probing) and throws
        // "Cannot find module .../next/server". Inlining processes next-auth
        // in-graph through Vite's resolver, which resolves those correctly.
        // Required so a test can `import` any guarded route module (the
        // competitor routes here, and the competitor-intel route later).
        inline: ["next-auth"],
      },
    },
  },
});
