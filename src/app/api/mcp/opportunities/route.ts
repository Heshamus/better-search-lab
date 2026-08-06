import { db } from "@/db/client";
import { listOpportunities } from "@/lib/opportunities";
import { mcpRoute, requireProjectId } from "@/lib/mcp/reader";

// Same read the Opportunities page uses: the latest week's scored shortlist.
export const GET = mcpRoute(async (req) => listOpportunities(db, requireProjectId(req)));
