import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { requireSession } from "@/lib/api-guard";
import { updateOnboarding } from "@/lib/projects";
import { OnboardingPatchSchema } from "@/lib/setup/onboarding";

/** The wizard records each per-project step here (spec §11.1). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const parsed = OnboardingPatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  const onboarding = await updateOnboarding(db, id, parsed.data);
  if (!onboarding) return NextResponse.json({ error: "project not found" }, { status: 404 });
  return NextResponse.json({ onboarding });
}
