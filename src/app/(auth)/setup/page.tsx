import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { countUsers } from "@/lib/auth/users";
import { CreateAdminForm } from "@/components/create-admin-form";
import { Logo } from "@/components/icons";

export const dynamic = "force-dynamic";

// First run: reachable only while the users table is empty. Once an admin
// exists this redirects to /login. Plan 2 turns this page into the full
// setup wizard; this version is step 1 only.
export default async function SetupPage() {
  if ((await countUsers(db)) > 0) redirect("/login");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-8 flex items-center gap-2.5">
        <Logo />
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-white">Better Search Lab</div>
          <div className="text-[0.65rem] font-medium tracking-wide text-neutral-500">FIRST-RUN SETUP</div>
        </div>
      </div>
      <section className="panel p-6">
        <h1 className="text-base font-semibold text-white">Create your admin account</h1>
        <p className="mt-1 mb-5 text-sm text-neutral-400">This is the only account that can manage users and integrations. You can add more people later in Settings.</p>
        <CreateAdminForm />
      </section>
    </main>
  );
}
