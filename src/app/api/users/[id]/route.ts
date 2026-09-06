import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { requireAdmin } from "@/lib/api-guard";
import {
  LastAdminError, SelfDeleteError, UserNotFoundError, WeakPasswordError,
  deleteUser, resetUserPassword, updateUserRole,
} from "@/lib/auth/users";
import { PasswordSchema } from "@/lib/auth/schemas";

const PatchBody = z
  .object({
    role: z.enum(["admin", "member"]).optional(),
    password: PasswordSchema.optional(),
  })
  .refine((b) => b.role !== undefined || b.password !== undefined, "nothing to update");

function mapError(e: unknown): NextResponse | null {
  if (e instanceof UserNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
  if (e instanceof LastAdminError || e instanceof SelfDeleteError) return NextResponse.json({ error: e.message }, { status: 409 });
  if (e instanceof WeakPasswordError) return NextResponse.json({ error: e.message }, { status: 400 });
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const { id } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  try {
    if (parsed.data.role !== undefined) await updateUserRole(db, id, parsed.data.role);
    if (parsed.data.password !== undefined) await resetUserPassword(db, id, parsed.data.password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Rethrow, never `?? Promise.reject(e)`: that returns a rejected promise
    // the framework awaits as the response body, losing the stack and any
    // chance of a 500 with the real cause.
    const mapped = mapError(e);
    if (mapped) return mapped;
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const { id } = await params;
  try {
    await deleteUser(db, id, { actorId: admin.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const mapped = mapError(e);
    if (mapped) return mapped;
    throw e;
  }
}
