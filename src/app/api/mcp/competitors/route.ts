import { db } from "@/db/client";
import { listCompetitors } from "@/lib/competitors";
import { mcpRoute, requireProjectId } from "@/lib/mcp/reader";

// Same read the Competitors chip row uses: the tracked competitor roster.
export const GET = mcpRoute(async (req) => listCompetitors(db, requireProjectId(req)));
