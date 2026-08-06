import { db } from "@/db/client";
import { listLatestConversations } from "@/lib/reddit/conversations-store";
import { mcpRoute, requireProjectId } from "@/lib/mcp/reader";

// Same read + limit the Reddit Conversations panel uses: newest-first, capped at 20.
export const GET = mcpRoute(async (req) => listLatestConversations(db, requireProjectId(req), 20));
