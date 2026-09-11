"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDemo } from "@/components/demo-provider";

export interface UserSummaryLike {
  id: string;
  email: string;
  role: "admin" | "member";
  createdAt: string | Date;
  lastLoginAt: string | Date | null;
}

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400";
const buttonClass =
  "rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-default disabled:opacity-50";
const dangerButtonClass =
  "rounded-lg border border-at-risk px-2.5 py-1 text-xs font-medium text-at-risk transition-colors hover:bg-[--color-at-risk-tint] disabled:cursor-default disabled:opacity-50";

const fmt = (v: string | Date | null): string => (v ? (typeof v === "string" ? new Date(v) : v).toISOString().slice(0, 10) : "never");

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || fallback;
  } catch {
    return fallback;
  }
}

/** One row: role select, reset-password inline form, two-step delete. Each row owns its own state. */
function UserRow({ user, isSelf }: { user: UserSummaryLike; isSelf: boolean }) {
  const router = useRouter();
  const demo = useDemo();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function patch(body: Record<string, string>, successNotice: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        setError(await readError(res, "Could not update this user."));
        return;
      }
      if (successNotice) setNotice(successNotice);
      setResetting(false);
      setNewPassword("");
      if (body.role) router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readError(res, "Could not delete this user."));
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <li data-testid={`user-row-${user.id}`} className="flex flex-col gap-2 border-b border-neutral-200 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm text-neutral-900">{user.email}{isSelf ? <span className="ml-2 text-xs text-neutral-500">(you)</span> : null}</span>
        <span className="flex items-center gap-1.5 text-xs text-neutral-600">
          Role
          {/* Your own role is read-only here. The API already refuses to demote
              the last admin, but a lone admin demoting themselves would lock
              everyone out of Users and Integrations with no way back in. */}
          <select aria-label={`Role for ${user.email}`} className={inputClass} value={user.role} disabled={demo || busy || isSelf} title={demo ? "Read-only demo" : isSelf ? "Ask another admin to change your role" : undefined} onChange={(e) => void patch({ role: e.target.value }, null)}>
            <option value="admin">admin</option>
            <option value="member">member</option>
          </select>
        </span>
        <span className="tnum text-xs text-neutral-500">created {fmt(user.createdAt)} · last sign-in {fmt(user.lastLoginAt)}</span>
        <button type="button" className={buttonClass} disabled={demo || busy} title={demo ? "Read-only demo" : undefined} onClick={() => { setResetting((v) => !v); setNotice(null); }}>Reset password</button>
        {!isSelf ? (
          confirmingDelete ? (
            <>
              <button type="button" className={dangerButtonClass} disabled={demo || busy} title={demo ? "Read-only demo" : undefined} onClick={() => void remove()}>Confirm delete</button>
              <button type="button" className={buttonClass} disabled={busy} onClick={() => setConfirmingDelete(false)}>Cancel</button>
            </>
          ) : (
            <button type="button" className={buttonClass} disabled={demo || busy} title={demo ? "Read-only demo" : undefined} onClick={() => setConfirmingDelete(true)}>Delete</button>
          )
        ) : null}
      </div>
      {resetting ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void patch({ password: newPassword }, "Password reset — they must sign in again."); }}>
          <label htmlFor={`pw-${user.id}`} className="text-xs text-neutral-600">New password</label>
          <input id={`pw-${user.id}`} type="password" minLength={10} required autoComplete="new-password" className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <button type="submit" className={buttonClass} disabled={demo || busy} title={demo ? "Read-only demo" : undefined}>Save password</button>
        </form>
      ) : null}
      {notice ? <p className="text-xs text-up">{notice}</p> : null}
      {error ? <p role="alert" className="text-xs text-at-risk">{error}</p> : null}
    </li>
  );
}

function AddUserForm() {
  const router = useRouter();
  const demo = useDemo();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, role }) });
      if (!res.ok) {
        setError(await readError(res, "Could not add the user."));
        return;
      }
      setEmail("");
      setPassword("");
      setRole("member");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel flex flex-col gap-3 p-4">
      <h3 className="text-sm font-semibold text-neutral-900">Add a user</h3>
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-xs text-neutral-600">New user email
          <input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">Initial password
          {/* new-password, not a current one: a password manager offering the
              admin's own credentials here would silently create the wrong user. */}
          <input type="password" required minLength={10} autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">New user role
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as "admin" | "member")}>
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-neutral-500">Share the initial password with them directly; they can change it under Settings → Account.</p>
      {error ? <p role="alert" className="text-xs text-at-risk">{error}</p> : null}
      <button type="submit" disabled={demo || busy} title={demo ? "Read-only demo" : undefined} className="self-start rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#2a3138] disabled:cursor-default disabled:opacity-50">
        {busy ? "Adding…" : "Add user"}
      </button>
    </form>
  );
}

export function UsersManager({ users, currentUserId }: { users: UserSummaryLike[]; currentUserId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <ul className="panel px-4">
        {users.map((u) => <UserRow key={u.id} user={u} isSelf={u.id === currentUserId} />)}
      </ul>
      <AddUserForm />
    </div>
  );
}
