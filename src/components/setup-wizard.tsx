import { Logo } from "@/components/icons";
import { STEP_ORDER, type SetupStepId } from "@/lib/setup/state";

const LABELS: Record<SetupStepId, string> = {
  account: "Account", dataforseo: "DataForSEO", llm: "AI assistant", site: "Your site",
  profile: "Profile", competitors: "Competitors", build: "Build", done: "Done",
};

/** The first-run wizard's frame (spec §11.1): brand, the step rail, the current step's panel. */
export function SetupWizard({ step, children }: { step: SetupStepId; children: React.ReactNode }) {
  const index = STEP_ORDER.indexOf(step);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-neutral-900">Better Search Lab</div>
            <div className="text-[0.65rem] font-medium tracking-wide text-neutral-500">FIRST-RUN SETUP</div>
          </div>
        </div>
        {step !== "account" ? <a href="/overview" className="text-xs text-neutral-600 hover:text-neutral-800">Exit setup</a> : null}
      </div>
      <ol className="mb-8 flex flex-wrap gap-2" aria-label="Setup steps">
        {STEP_ORDER.map((id, i) => (
          <li
            key={id}
            aria-current={id === step ? "step" : undefined}
            className={`rounded-full px-2.5 py-1 text-[0.7rem] font-medium ${i < index ? "bg-[--color-accent-tint] text-accent" : id === step ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-500"}`}
          >
            {LABELS[id]}
          </li>
        ))}
      </ol>
      <section className="panel p-6">{children}</section>
    </main>
  );
}
