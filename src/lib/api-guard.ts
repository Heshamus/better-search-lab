import { db } from "@/db/client";
import { validateApiToken } from "@/lib/api-tokens";
import { resolveSessionUser, type SessionUser } from "@/lib/auth/session";

/** Dashboard-session guard: null when a live user is signed in, else 401. */
export async function requireSession(): Promise<Response | null> {
  const user = await resolveSessionUser();
  return user ? null : new Response("Unauthorized", { status: 401 });
}

/** Same guard, but hands the user back to routes that need the id (updatedBy, actorId). */
export async function requireSessionUser(): Promise<SessionUser | Response> {
  const user = await resolveSessionUser();
  return user ?? new Response("Unauthorized", { status: 401 });
}

/** Admin-only routes: 401 without a live session, 403 for a member. */
export async function requireAdmin(): Promise<SessionUser | Response> {
  const user = await resolveSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "admin") return new Response("Forbidden", { status: 403 });
  return user;
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
