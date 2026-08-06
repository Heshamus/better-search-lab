import { db } from "@/db/client";
import { latestAudit } from "@/lib/audit/store";
import { mcpRoute, requireProjectId } from "@/lib/mcp/reader";

// Same read the Audit page uses: the most recent site audit, or null if none has run yet.
export const GET = mcpRoute(async (req) => latestAudit(db, requireProjectId(req)));
