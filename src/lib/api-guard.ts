import { auth } from "@/auth";
export async function requireSession(): Promise<Response | null> {
  const session = await auth();
  return session ? null : new Response("Unauthorized", { status: 401 });
}
