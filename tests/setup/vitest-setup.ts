// Global Vitest setup. Runs for every test file regardless of environment
// ("node" default or a per-file "// @vitest-environment jsdom" override) —
// registering jest-dom's matchers is a no-op until a test actually asserts
// on a DOM element, so it's safe to load unconditionally here rather than
// re-importing it in every future component test.
import "@testing-library/jest-dom/vitest";
