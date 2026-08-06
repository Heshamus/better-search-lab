import { db } from "@/db/client";
import { getLatestScan } from "@/lib/ai-visibility/store";
import { mcpRoute, requireProjectId } from "@/lib/mcp/reader";

// Same read the AI Visibility page uses: the most recent scan, or null if none has run yet.
export const GET = mcpRoute(async (req) => getLatestScan(db, requireProjectId(req)));
