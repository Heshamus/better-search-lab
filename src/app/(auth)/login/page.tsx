import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { countUsers } from "@/lib/auth/users";
import { resolveSessionUser } from "@/lib/auth/session";
import { safeCallback } from "@/lib/auth/safe-callback";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/icons";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoSeedStatus } from "@/lib/demo/boot";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; reason?: string }> }) {
  const demo = isDemoMode();
  // Never bounce to /setup in demo mode: the demo admin is seeded at boot,
  // but a failed seed can leave zero users too — and /setup would render
  // CreateAdminForm, hiding the seed-error alert this page shows below.
  // Staying here lets a failed seed surface honestly instead of looping.
  if ((await countUsers(db)) === 0 && !demo) redirect("/setup"); // first run
  const sp = await searchParams;
  if (await resolveSessionUser()) redirect(safeCallback(sp.callbackUrl));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-8 flex items-center gap-2.5">
        <Logo />
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-white">Better Search Lab</div>
          <div className="text-[0.65rem] font-medium tracking-wide text-neutral-500">SEARCH &amp; GEO VISIBILITY</div>
        </div>
      </div>
      <section className="panel p-6">
        <h1 className="mb-5 text-base font-semibold text-white">{demo ? "Try Better Search Lab" : "Sign in"}</h1>
        <LoginForm callbackUrl={safeCallback(sp.callbackUrl)} reason={sp.reason} demo={demo} seedError={demo ? getDemoSeedStatus()?.error : undefined} />
      </section>
    </main>
  );
}
