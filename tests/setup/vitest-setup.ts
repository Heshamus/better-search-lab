// Test-only fallback env so modules that import "@/db/client" (which runs loadEnv at
// import) can be imported in the node test env, where vitest doesn't load .env.
// ??= never overrides a real value; the postgres client is lazy (no connect at import).
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.DATAFORSEO_LOGIN ??= "test";
process.env.DATAFORSEO_PASSWORD ??= "test";
process.env.AUTH_SECRET ??= "test_auth_secret_0123456789";
process.env.ALLOWLIST ??= "test@example.com";

// Global Vitest setup. Runs for every test file regardless of environment
// ("node" default or a per-file "// @vitest-environment jsdom" override) —
// registering jest-dom's matchers is a no-op until a test actually asserts
// on a DOM element, so it's safe to load unconditionally here rather than
// re-importing it in every future component test.
import "@testing-library/jest-dom/vitest";
