// Shared empty-state block used by the opportunities landing and stub pages. An
// empty screen is an invitation to act, so it reads as a calm prompt (a quiet
// glyph + a plain next step), never a fabricated number or table.
export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="panel flex flex-col items-center px-6 py-16 text-center">
      <div aria-hidden className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21" />
        </svg>
      </div>
      <h1 className="text-base font-semibold text-white">{title}</h1>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-neutral-400">{description}</p>
    </section>
  );
}
