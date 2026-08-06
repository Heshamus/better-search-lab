import { projectRedditConfig } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface RedditConfig {
  knowledgeBrief: string | null;
  subreddits: string[];
}

/** Per-project Reddit Conversations config. Never-configured projects read as defaults. */
export async function getRedditConfig(db: any, projectId: string): Promise<RedditConfig> {
  const [row] = await db.select().from(projectRedditConfig).where(eq(projectRedditConfig.projectId, projectId));
  return row
    ? { knowledgeBrief: row.knowledgeBrief, subreddits: (row.subreddits ?? []) as string[] }
    : { knowledgeBrief: null, subreddits: [] };
}

/**
 * Upserts the per-project config. Only the fields present in `updates` are
 * written — an omitted field is left untouched (mirrors `updateProject`'s
 * "never reset to a default" convention), both on first insert (the column
 * default applies) and on a later overwrite (the stored value survives).
 */
export async function saveRedditConfig(
  db: any,
  projectId: string,
  updates: { knowledgeBrief?: string | null; subreddits?: string[] },
): Promise<void> {
  const now = new Date();
  const values: Record<string, unknown> = { projectId, updatedAt: now };
  const set: Record<string, unknown> = { updatedAt: now };
  if (updates.knowledgeBrief !== undefined) {
    values.knowledgeBrief = updates.knowledgeBrief;
    set.knowledgeBrief = updates.knowledgeBrief;
  }
  if (updates.subreddits !== undefined) {
    values.subreddits = updates.subreddits;
    set.subreddits = updates.subreddits;
  }

  await db.insert(projectRedditConfig).values(values).onConflictDoUpdate({
    target: projectRedditConfig.projectId,
    set,
  });
}
