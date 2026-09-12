import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { requireSessionUser } from "@/lib/api-guard";
import { NotSoleUserError, deleteOwnAccount } from "@/lib/auth/users";
import { isSingleUserMode } from "@/lib/auth/single-user";

/** Delete the signed-in user's own account. Only works on a single-user install. */
export async function DELETE() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  // No account to delete in single-user mode — the admin is auto-provisioned.
  if (isSingleUserMode()) return NextResponse.json({ error: "not available in single-user mode" }, { status: 409 });
  try {
    await deleteOwnAccount(db, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NotSoleUserError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
