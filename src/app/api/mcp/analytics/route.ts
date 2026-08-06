import { db } from "@/db/client";
import { getGaData } from "@/lib/google/store";
import { mcpRoute, requireProjectId } from "@/lib/mcp/reader";

// Same read the Analytics (GA4) page uses: daily series + totals + channels/top pages,
// or null if the project has never synced GA4.
export const GET = mcpRoute(async (req) => getGaData(db, requireProjectId(req)));
