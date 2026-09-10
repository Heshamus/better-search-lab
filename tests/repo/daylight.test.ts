import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Daylight foundation", () => {
  const css = read("src/app/globals.css");

  it("uses a light color-scheme, not dark", () => {
    expect(css).toMatch(/color-scheme:\s*light/);
    expect(css).not.toMatch(/color-scheme:\s*dark/);
  });

  it("drops the dark radial-gradient glow from the body ground", () => {
    expect(css).not.toMatch(/radial-gradient/);
  });

  it("redefines the neutral ramp to the light direction (50 lightest, 950 ink)", () => {
    expect(css).toMatch(/--color-neutral-50:\s*#f6f7f9/i);
    expect(css).toMatch(/--color-neutral-900:\s*#161a20/i);
    expect(css).toMatch(/--color-neutral-950:\s*#0c0f14/i);
  });

  it("demotes the accent to evergreen and defines the data + whisper tokens", () => {
    expect(css).toMatch(/--color-accent:\s*#157f5c/i);
    expect(css).toMatch(/--color-accent-tint:\s*#e9f4ef/i);
    expect(css).toMatch(/--color-up:\s*#157f5c/i);
    expect(css).toMatch(/--color-down:\s*#c24457/i);
  });

  it("makes .tnum / .num sans tabular figures (no mono family)", () => {
    // Isolate the .tnum and .num rule bodies and assert neither pins the mono font.
    const tnum = css.match(/\.tnum\s*\{[^}]*\}/)?.[0] ?? "";
    const num = css.match(/\.num\s*\{[^}]*\}/)?.[0] ?? "";
    expect(tnum).not.toMatch(/font-mono/);
    expect(num).not.toMatch(/font-mono/);
    expect(tnum).toMatch(/tabular-nums/);
  });

  it("loads Hanken Grotesk as the UI voice", () => {
    const layout = read("src/app/layout.tsx");
    const combined = css + layout;
    expect(combined).toMatch(/[Hh]anken/);
  });

  it("recolours the favicon off the old dark-navy ground", () => {
    const icon = read("src/app/icon.svg");
    expect(icon).not.toMatch(/#0f172a/i); // old dark chip ground is gone
  });
});
