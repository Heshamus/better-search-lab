import { describe, it, expect } from "vitest";
import { MARKETS, DEFAULT_MARKET } from "@/lib/markets";

describe("MARKETS", () => {
  it("has unique location codes and a language code per market", () => {
    const codes = MARKETS.map((m) => m.locationCode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const m of MARKETS) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.languageCode).toMatch(/^[a-z]{2}$/);
    }
  });
  it("defaults to the United States", () => {
    expect(DEFAULT_MARKET.label).toBe("United States");
    expect(DEFAULT_MARKET.locationCode).toBe(2840);
  });
});
