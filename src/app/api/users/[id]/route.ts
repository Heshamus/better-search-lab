import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { requireAdmin } from "@/lib/api-guard";
import {
  LastAdminError, SelfDeleteError, UserNotFoundError, WeakPasswordError,
  deleteUser, resetUserPassword, updateUserRole, MIN_PASSWORD_LENGTH,
} from "@/lib/auth/users";

const PatchBody = z
  .object({
    role: z.enum(["admin", "member"]).optional(),
    password: z.string().min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`).optional(),
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
    return mapError(e) ?? Promise.reject(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const { id } = await params;
  try {
    await deleteUser(db, id, { actorId: admin.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e) ?? Promise.reject(e);
  }
}
