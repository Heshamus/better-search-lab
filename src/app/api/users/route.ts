import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { requireAdmin } from "@/lib/api-guard";
import { EmailTakenError, WeakPasswordError, createUser, listUsers } from "@/lib/auth/users";
import { EmailSchema, PasswordSchema } from "@/lib/auth/schemas";

const CreateBody = z.object({ email: EmailSchema, password: PasswordSchema, role: z.enum(["admin", "member"]) });

export async function GET() {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  return NextResponse.json({ users: await listUsers(db) });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  try {
    const user = await createUser(db, parsed.data);
    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    if (e instanceof EmailTakenError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof WeakPasswordError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
