import { auth } from "@/auth";
import { db } from "@/db/client";
import { validateApiToken } from "@/lib/api-tokens";

export async function requireSession(): Promise<Response | null> {
  const session = await auth();
  return session ? null : new Response("Unauthorized", { status: 401 });
}

/**
 * Bearer-token guard for the MCP server's API routes (`Authorization: Bearer
 * <token>`, scheme matched case-insensitively, header trimmed). Missing or
 * malformed headers and unrecognized tokens all 401 — same response either
 * way, so a caller can't distinguish "no token" from "wrong token".
 */
export async function requireApiToken(req: Request): Promise<Response | null> {
  const header = req.headers.get("authorization")?.trim();
  const [scheme, token] = header?.split(/\s+/) ?? [];
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return new Response("Unauthorized", { status: 401 });
  }
  const valid = await validateApiToken(db, token);
  return valid ? null : new Response("Unauthorized", { status: 401 });
}
