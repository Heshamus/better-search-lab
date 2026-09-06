import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { countUsers } from "@/lib/auth/users";
import { resolveSessionUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/icons";

export const dynamic = "force-dynamic";

const DEFAULT_CALLBACK_URL = "/overview";

/** Only same-origin paths may be used as a post-login destination. */
function safeCallback(raw: string | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : DEFAULT_CALLBACK_URL;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; reason?: string }> }) {
  if ((await countUsers(db)) === 0) redirect("/setup"); // first run
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
        <h1 className="mb-5 text-base font-semibold text-white">Sign in</h1>
        <LoginForm callbackUrl={safeCallback(sp.callbackUrl)} reason={sp.reason} />
      </section>
    </main>
  );
}
