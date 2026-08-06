import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/api-guard";

/**
 * Thrown by requireProjectId (and keyword-overview's own keywords check) when
 * a required query param is missing from an /api/mcp/* GET request. mcpRoute's
 * catch special-cases this to an honest 400 {error} — every OTHER thrown error
 * (a failing DB read, a failing DataForSEO call, ...) still maps to 500, so a
 * caller can tell "you forgot a param" apart from "the read itself failed".
 */
export class MissingParamError extends Error {}

/**
 * Wraps a read-only /api/mcp/* GET handler with the Task 1 bearer-token guard
 * (requireApiToken) and honest JSON responses. `read` does the actual work —
 * calling the SAME data-access function the corresponding dashboard page
 * already uses — and either returns JSON-serializable data or throws.
 */
export function mcpRoute(read: (req: Request) => Promise<unknown>) {
  return async function GET(req: Request) {
    const denied = await requireApiToken(req);
    if (denied) return denied;
    try {
      const data = await read(req);
      return NextResponse.json(data);
    } catch (e) {
      if (e instanceof MissingParamError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      return NextResponse.json({ error: e instanceof Error ? e.message : "read failed" }, { status: 500 });
    }
  };
}

/**
 * Reads `projectId` off the request's query string for a project-scoped
 * tool. Throws MissingParamError (-> 400 via mcpRoute) when absent — every
 * project-scoped route calls this first, before touching its read fn.
 */
export function requireProjectId(req: Request): string {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) throw new MissingParamError("projectId required");
  return projectId;
}
