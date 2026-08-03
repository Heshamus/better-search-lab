// Top-bar site switcher. Phase 0 is shell-only: wiring `listProjects` into a
// server component here would make every dashboard page's build/render
// depend on a live DB connection, which is unnecessary risk for a shell task
// (see task-12 brief — "a static placeholder is fine in Phase 0"). Renders a
// disabled, honestly-labeled placeholder; a later phase swaps this for a
// real dropdown backed by `listProjects`.
export function SiteSwitcher() {
  return (
    <button
      type="button"
      disabled
      aria-label="Site switcher (no sites yet)"
      className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-500 disabled:cursor-default dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
    >
      <span aria-hidden className="h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-600" />
      No sites yet
      <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 text-neutral-400 dark:text-neutral-500">
        <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
