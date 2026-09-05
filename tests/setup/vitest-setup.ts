// Test-only fallback env. `??=` never overrides a real value. DATAFORSEO_* stay
// until Task 11 shrinks the bootstrap schema; AUTH_SECRET must be ≥ 32 chars.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.DATAFORSEO_LOGIN ??= "";
process.env.DATAFORSEO_PASSWORD ??= "";
process.env.AUTH_SECRET ??= "test_auth_secret_0123456789_abcdefghijklmnop";

// Global Vitest setup. Runs for every test file regardless of environment
// ("node" default or a per-file "// @vitest-environment jsdom" override) —
// registering jest-dom's matchers is a no-op until a test actually asserts
// on a DOM element, so it's safe to load unconditionally here rather than
// re-importing it in every future component test.
import "@testing-library/jest-dom/vitest";

// The config cache is process-global; a value cached by one test must never
// leak into the next. Tests that need a stale cache on purpose set it inside
// the test itself.
import { beforeEach } from "vitest";
import { invalidateConfigCache } from "@/lib/config/cache";
beforeEach(() => invalidateConfigCache());
