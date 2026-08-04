import { describe, it, expect, vi } from "vitest";
import { summarizeActions } from "@/lib/llm/advisor";
import type { EngineResult } from "@/lib/core/opportunity-engine";

const r = (why: string): EngineResult => ({
  type: "striking_distance", keywordId: "k", keyword: "seo tool", score: 1, scoreBreakdown: {}, why,
  upsideEstimate: null, volume: 100, difficulty: 20, currentPosition: 12, trend: null, dataSource: "gsc",
});

describe("summarizeActions", () => {
  it("returns the model's action lines (aligned 1:1) when the LLM succeeds", async () => {
    const chat = vi.fn(async () => JSON.stringify(["Rewrite the title for X", "Publish a page for Y"]));
    const out = await summarizeActions([r("why1"), r("why2")], { chat });
    expect(out).toEqual(["Rewrite the title for X", "Publish a page for Y"]);
    expect(chat).toHaveBeenCalledOnce();
  });
  it("falls back to each opportunity's why when the LLM throws", async () => {
    const chat = vi.fn(async () => {
      throw new Error("boom");
    });
    expect(await summarizeActions([r("why1"), r("why2")], { chat })).toEqual(["why1", "why2"]);
  });
  it("falls back when no chat fn is provided", async () => {
    expect(await summarizeActions([r("why1")])).toEqual(["why1"]);
  });
  it("returns [] for empty input", async () => {
    expect(await summarizeActions([])).toEqual([]);
  });
  it("falls back when the model returns a mismatched count", async () => {
    const chat = vi.fn(async () => JSON.stringify(["only one"]));
    expect(await summarizeActions([r("why1"), r("why2")], { chat })).toEqual(["why1", "why2"]);
  });
});
