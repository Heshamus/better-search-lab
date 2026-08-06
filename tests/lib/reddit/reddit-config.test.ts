import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { getRedditConfig, saveRedditConfig } from "@/lib/reddit/reddit-config";

let close: (() => Promise<void>) | undefined;
afterEach(() => close?.());

describe("reddit-config store", () => {
  it("save then get returns the knowledge brief + subreddits", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });

    await saveRedditConfig(t.db, p.id, {
      knowledgeBrief: "HarperFlow auto-publishes GEO-optimized articles to Webflow sites.",
      subreddits: ["SEO", "webflow"],
    });

    const config = await getRedditConfig(t.db, p.id);
    expect(config).toEqual({
      knowledgeBrief: "HarperFlow auto-publishes GEO-optimized articles to Webflow sites.",
      subreddits: ["SEO", "webflow"],
    });
  });

  it("returns defaults for a project with no saved config", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "x.io" });

    expect(await getRedditConfig(t.db, p.id)).toEqual({ knowledgeBrief: null, subreddits: [] });
  });

  it("save is an upsert — a second save overwrites the first", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });

    await saveRedditConfig(t.db, p.id, { knowledgeBrief: "first draft", subreddits: ["SEO"] });
    await saveRedditConfig(t.db, p.id, { knowledgeBrief: "second draft", subreddits: ["SEO", "marketing"] });

    expect(await getRedditConfig(t.db, p.id)).toEqual({
      knowledgeBrief: "second draft",
      subreddits: ["SEO", "marketing"],
    });
  });

  it("save only writes the fields provided, leaving the rest untouched", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });

    await saveRedditConfig(t.db, p.id, { knowledgeBrief: "brief", subreddits: ["SEO"] });
    await saveRedditConfig(t.db, p.id, { subreddits: ["SEO", "marketing"] }); // no knowledgeBrief this time

    expect(await getRedditConfig(t.db, p.id)).toEqual({
      knowledgeBrief: "brief",
      subreddits: ["SEO", "marketing"],
    });
  });
});
