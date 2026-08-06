import { db } from "@/db/client";
import { getGscData } from "@/lib/google/store";
import { mcpRoute, requireProjectId } from "@/lib/mcp/reader";

// Same read the Search Console page uses: daily series + totals + top queries/pages,
// or null if the project has never synced GSC.
export const GET = mcpRoute(async (req) => getGscData(db, requireProjectId(req)));
