import { db } from "@/db/client";
import { listGapSignals } from "@/lib/competitors";
import { mcpRoute, requireProjectId } from "@/lib/mcp/reader";

// Same read the Gaps table uses: competitor-ranked keywords we don't rank for.
export const GET = mcpRoute(async (req) => listGapSignals(db, requireProjectId(req)));
