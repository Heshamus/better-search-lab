import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

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
