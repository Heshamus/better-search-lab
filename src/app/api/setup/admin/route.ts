import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { AdminAlreadyExistsError, WeakPasswordError, createFirstAdmin } from "@/lib/auth/users";
import { EmailSchema, PasswordSchema } from "@/lib/auth/schemas";

// The only unauthenticated write in the app, and it works exactly once: the
// users library refuses (inside its advisory lock) as soon as any user exists.
const Body = z.object({ email: EmailSchema, password: PasswordSchema });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  try {
    const admin = await createFirstAdmin(db, parsed.data);
    return NextResponse.json({ id: admin.id, email: admin.email }, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAlreadyExistsError) return NextResponse.json({ error: "An admin already exists — sign in." }, { status: 409 });
    if (e instanceof WeakPasswordError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
