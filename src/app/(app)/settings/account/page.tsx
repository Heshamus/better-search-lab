import { PasswordForm } from "@/components/password-form";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { db } from "@/db/client";
import { countUsers } from "@/lib/auth/users";
import { isSingleUserMode } from "@/lib/auth/single-user";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  // Self-service account reset is only offered on a single-user install, and
  // never in single-user / no-auth mode (there is no login to delete there).
  const soleUser = !isSingleUserMode() && (await countUsers(db)) === 1;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">Account</h2>
        <p className="text-xs text-neutral-500">Change the password you sign in with.</p>
      </div>
      <PasswordForm />
      {soleUser && <DeleteAccountForm />}
    </section>
  );
}
