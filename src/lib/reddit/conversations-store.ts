import { redditConversations } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

/** One persisted Reddit conversation row, as returned by listLatestConversations. */
export interface StoredConversation {
  id: string;
  scanDate: string;
  threadUrl: string;
  subreddit: string;
  title: string;
  upVotes: number | null;
  numComments: number | null;
  postedAt: Date | null;
  whyItMatters: string;
  draftReply: string;
  citations: string[];
  promoRisk: string;
  status: string;
  insertedAt: Date;
}

/** One conversation to persist. projectId/scanDate are supplied separately by saveConversations. */
export interface NewConversation {
  threadUrl: string;
  subreddit?: string;
  title?: string;
  upVotes?: number | null;
  numComments?: number | null;
  postedAt?: Date | null;
  whyItMatters?: string;
  draftReply?: string;
  citations?: string[];
  promoRisk?: string;
  status?: string;
}

/**
 * Persists one scan's surfaced conversations. Deduped per project by thread
 * URL via the `reddit_conversations_project_url_idx` unique index
 * (projectId, threadUrl) — a rescan that resurfaces an already-stored
 * thread is silently ignored (onConflictDoNothing), never a duplicate row
 * and never an overwrite of a row a human may already be reviewing.
 */
export async function saveConversations(
  db: any,
  projectId: string,
  scanDate: string,
  rows: NewConversation[],
): Promise<void> {
  if (!rows.length) return;
  await db
    .insert(redditConversations)
    .values(rows.map((r) => ({ projectId, scanDate, ...r })))
    .onConflictDoNothing({ target: [redditConversations.projectId, redditConversations.threadUrl] });
}

/**
 * Newest-first stored conversations for a project, capped at `limit`.
 * Tiebreaks same-tick rows (a single saveConversations call inserts a batch
 * that shares one `insertedAt`) by `id desc` for a stable order — mirrors
 * research-history.ts's listRecentSearches.
 */
export async function listLatestConversations(db: any, projectId: string, limit: number): Promise<StoredConversation[]> {
  return db
    .select()
    .from(redditConversations)
    .where(eq(redditConversations.projectId, projectId))
    .orderBy(desc(redditConversations.insertedAt), desc(redditConversations.id))
    .limit(limit);
}

/** The set of thread URLs already stored for a project — dedup check before judging/drafting a rescan. */
export async function seenThreadUrls(db: any, projectId: string): Promise<Set<string>> {
  const rows = await db
    .select({ threadUrl: redditConversations.threadUrl })
    .from(redditConversations)
    .where(eq(redditConversations.projectId, projectId));
  return new Set(rows.map((r: { threadUrl: string }) => r.threadUrl));
}
