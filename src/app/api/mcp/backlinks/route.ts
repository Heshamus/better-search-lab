import { db } from "@/db/client";
import { latestBacklinks } from "@/lib/backlinks-store";
import { mcpRoute, requireProjectId } from "@/lib/mcp/reader";

// Same read the Backlinks page uses: the most recent backlinks snapshot, or null if none.
export const GET = mcpRoute(async (req) => latestBacklinks(db, requireProjectId(req)));
