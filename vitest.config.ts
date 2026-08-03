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
