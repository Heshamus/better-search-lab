import { redirect } from "next/navigation";
import { resolveSessionUser } from "@/lib/auth/session";
import { SettingsTabs } from "@/components/settings-tabs";

// Nested layout: the tab strip once, above every Settings section. The role
// decides which tabs render; the admin pages additionally gate server-side.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await resolveSessionUser();
  if (!user) redirect("/login?reason=signed-out");
  return (
    <div className="flex flex-col gap-6">
      <SettingsTabs role={user.role} />
      {children}
    </div>
  );
}
