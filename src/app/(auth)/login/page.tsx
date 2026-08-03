import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

// This page hosts a Server Action (`authenticate`). Left static, Next.js
// prerenders + full-route-caches it (s-maxage=31536000), and the Server Action
// POST then gets served a CACHED response — a corrupted mix of the stale page
// and partial action headers — which the client rejects with the opaque
// "An unexpected response was received from the server." Forcing dynamic keeps
// the route (and its action) out of the cache so every login POST is handled
// live. (The 8 dashboard pages are already force-dynamic for the same reason.)
export const dynamic = "force-dynamic";

const DEFAULT_CALLBACK_URL = "/opportunities";

async function authenticate(formData: FormData) {
  "use server";
  const callbackUrl = (formData.get("callbackUrl") as string | null) || DEFAULT_CALLBACK_URL;
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/login?error=1&callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
    // Anything else (including Next's internal redirect signal on success) must propagate.
    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;

  return (
    <main style={{ maxWidth: 360, margin: "4rem auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>Sign in</h1>
      <form action={authenticate}>
        <input type="hidden" name="callbackUrl" value={callbackUrl ?? DEFAULT_CALLBACK_URL} />
        <div>
          <label htmlFor="email">Email</label>
          <br />
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div style={{ marginTop: 12 }}>
          <label htmlFor="password">Password</label>
          <br />
          <input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <button type="submit" style={{ marginTop: 16 }}>
          Sign in
        </button>
      </form>
      {error && (
        <p role="alert" style={{ color: "#b91c1c", marginTop: 12 }}>
          Invalid email or password.
        </p>
      )}
    </main>
  );
}
