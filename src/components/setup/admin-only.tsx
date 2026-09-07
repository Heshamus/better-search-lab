/** A member reached an admin-only wizard step (spec §11.1: steps 2–3 need an admin). */
export function AdminOnly({ step }: { step: "dataforseo" | "llm" }) {
  const what = step === "dataforseo" ? "connect DataForSEO" : "choose an AI assistant";
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-base font-semibold text-white">An admin needs to finish setup</h1>
      <p className="text-sm text-neutral-400">Only an admin can {what}. Ask them to open this page, or continue to the app — you can add a site once the connection is in place.</p>
      <a href="/overview" className="self-start rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800/60">Go to the app</a>
    </div>
  );
}
