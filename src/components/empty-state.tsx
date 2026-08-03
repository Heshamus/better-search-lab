// Shared empty-state block used by the opportunities landing and every
// Phase-0 stub page. Not one of the brief's named files, but factoring it
// out avoids seven copies of the same markup and keeps the "no data yet"
// visual language consistent across the shell (degraded-run honesty: each
// stub says plainly that nothing has been added yet, never a fabricated
// number or table).
export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center dark:border-neutral-700 dark:bg-neutral-900">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
    </section>
  );
}
