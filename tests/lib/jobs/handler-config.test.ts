import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { redditConversationsHandler } from "@/lib/jobs/handlers/reddit-conversations";
import { gscSyncHandler } from "@/lib/jobs/handlers/gsc-sync";
import { gaSyncHandler } from "@/lib/jobs/handlers/ga-sync";
import { aiVisibilityScanHandler } from "@/lib/jobs/handlers/ai-visibility-scan";

let close: (() => Promise<void>) | undefined;
afterEach(() => {
  close?.();
  vi.unstubAllEnvs();
});

describe("job handlers read config per run", () => {
  it("fail with a Settings pointer when their integration is unconfigured", async () => {
    vi.stubEnv("EDENAI_API_KEY", "");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("GOOGLE_SA_KEY", "");
    vi.stubEnv("APIFY_API_KEY", "");
    vi.stubEnv("REDDIT_CLIENT_ID", "");
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "X", domain: "example-site.com" });
    const ctx = { db: t.db, projectId: p.id };
    await expect(redditConversationsHandler()(ctx)).rejects.toThrow(/Settings → Integrations/);
    await expect(gscSyncHandler()(ctx)).rejects.toThrow(/Settings → Integrations/);
    await expect(gaSyncHandler()(ctx)).rejects.toThrow(/Settings → Integrations/);
    await expect(aiVisibilityScanHandler()(ctx)).rejects.toThrow(/Settings → Integrations/);
  });

  it("require an AI assistant for Reddit even when a fetch source exists", async () => {
    vi.stubEnv("APIFY_API_KEY", "apify_k");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("LLM_API_KEY", "");
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "X", domain: "example-site.com" });
    await expect(redditConversationsHandler()({ db: t.db, projectId: p.id })).rejects.toThrow(/AI assistant/);
  });
});
