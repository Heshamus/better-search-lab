import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { db } from "@/db/client";
import { createApiToken, listApiTokens, revokeApiToken } from "@/lib/api-tokens";

/**
 * Owner-facing MCP access token management (Settings screen's token
 * manager, now under Settings → MCP). Every verb is requireAdmin-guarded —
 * NOT the bearer guard (requireApiToken in api-guard.ts) that a minted
 * token itself satisfies against the MCP server's own routes. Minting a
 * credential that can read every project is an admin action (spec §9.2),
 * so listing/revoking existing ones is admin-only too.
 */

/**
 * Mints a new token and returns the PLAINTEXT once. createApiToken persists
 * only its sha256 hash — this response is the only place the caller ever
 * sees the plaintext, so the UI must show/copy it immediately.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const { label } = await req.json().catch(() => ({}));
  const token = await createApiToken(db, (typeof label === "string" && label.trim()) || null);
  return NextResponse.json({ token }, { status: 201 });
}

/** Every stored token's metadata (id/label/createdAt/lastUsedAt) — never a hash. */
export async function GET() {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const tokens = await listApiTokens(db);
  return NextResponse.json({ tokens });
}

/** Immediate, irreversible revocation by id. */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await revokeApiToken(db, id);
  return NextResponse.json({ ok: true });
}
