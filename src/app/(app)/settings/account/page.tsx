import { PasswordForm } from "@/components/password-form";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">Account</h2>
        <p className="text-xs text-neutral-500">Change the password you sign in with.</p>
      </div>
      <PasswordForm />
    </section>
  );
}
