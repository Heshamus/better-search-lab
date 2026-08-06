import { db } from "@/db/client";
import { listProjects } from "@/lib/projects";
import { mcpRoute } from "@/lib/mcp/reader";

// Same read the project switcher / dashboard use — the full project roster,
// no scoping param.
export const GET = mcpRoute(async () => listProjects(db));
