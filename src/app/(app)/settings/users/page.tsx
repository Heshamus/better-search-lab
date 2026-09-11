import { db } from "@/db/client";
import { requireAdminUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/users";
import { UsersManager } from "@/components/users-manager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const admin = await requireAdminUser();
  const users = await listUsers(db);
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">Users</h2>
        <p className="text-xs text-neutral-500">Admins manage users and integrations; members do everything else. Deleting a user or resetting a password signs them out immediately.</p>
      </div>
      <UsersManager users={users} currentUserId={admin.id} />
    </section>
  );
}
