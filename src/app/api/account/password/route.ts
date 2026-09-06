import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { requireSessionUser } from "@/lib/api-guard";
import { InvalidPasswordError, WeakPasswordError, changeOwnPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/users";

const Body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`),
});

// Bumps session_version, so every session of this user — including the
// current one — is invalid afterwards; the form signs the user out (spec §9.5).
export async function POST(req: NextRequest) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  try {
    await changeOwnPassword(db, user.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof InvalidPasswordError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof WeakPasswordError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
