import { defineConfig } from "vitest/config";

// Standalone config so `npx vitest run` inside mcp/ never climbs up to (and
// inherits) the parent seo-platform repo's root vitest.config.ts — this
// package must stay a self-contained client with its own test setup, matching
// the "does not import the Next app or src/*" constraint for the code itself.
export default defineConfig({
  test: {
    environment: "node",
    // Vitest 4's default exclude is only node_modules + .git (no "dist") —
    // without this, once `npm run build` has run at least once, this same
    // `vitest run` also re-discovers the compiled duplicate
    // dist/tests/server.test.js and runs every test twice.
    exclude: ["**/node_modules/**", "**/.git/**", "dist/**"],
  },
});
