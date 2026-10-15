// Ported to tessera's var(--t-*) tokens (2026-09-17) — this modal renders
// under AdminLayout's hardcoded "default" theme (patterns/admin/siteConfig.jsx),
// so a plain slate/white palette stayed light in dark mode regardless of the
// rest of the page around it.
export const patternPickerTheme = {
  grid: 'grid grid-cols-3 gap-2 p-4',
  optCard: 'relative border border-[var(--t-rule)] rounded-lg p-3 cursor-pointer select-none bg-[var(--t-well)] hover:border-[var(--t-rule-strong)] hover:bg-[var(--t-panel)] transition-colors',
  optCardSelected: 'relative border-2 border-[var(--t-ink)] rounded-lg p-3 cursor-pointer select-none bg-[var(--t-panel)] shadow-[var(--t-shadow-lift)]',
  optName: 'text-sm font-semibold text-[var(--t-ink)]',
  optDesc: 'text-xs text-[var(--t-pencil)] mt-1 leading-snug',
  // A card's type tag always carries that type's own color (matching the
  // Sites table's pattern_type pill), regardless of selection — the card's
  // own border/ring already conveys selection, so the tag doesn't need to.
  // Sits below the title (not an absolute corner badge), sized to its text.
  optTag: 'inline-flex items-center w-fit h-[18px] px-2 rounded-full t-metaXS mt-1',   // the Sites table's type pill shape (P3, 2026-10-13)
  tagPage: 'bg-[var(--t-cobalt-soft)] text-[var(--t-cobalt)]',
  tagDatasets: 'bg-[var(--t-go-soft)] text-[var(--t-go)]',
  tagAuth: 'bg-[var(--t-amber-soft)] text-[var(--t-amber)]',
  // any registered type without its own tag<Type> key (e.g. an app pattern)
  tagDefault: 'bg-[var(--t-well)] text-[var(--t-graphite)] border border-[var(--t-rule)]',
  tagQa: 'bg-[var(--t-marker-soft)] text-[var(--t-ink)]',
  dividerRow: 'col-span-3 flex items-center gap-2 py-1',
  dividerLine: 'flex-1 h-px bg-[var(--t-rule)]',
  dividerLabel: 'text-[9px] font-semibold uppercase tracking-widest text-[var(--t-pencil)] whitespace-nowrap',
  confirmArea: 'border-t border-[var(--t-rule)] px-4 py-3',
  confirmLabel: 'text-[11px] font-semibold uppercase tracking-wide text-[var(--t-pencil)] mb-2',
  confirmFields: 'flex gap-2 items-end',
  confirmField: 'flex flex-col gap-1 flex-1',
  urlField: 'flex flex-col gap-1 max-w-[160px]',
  fieldLabel: 'text-xs font-semibold text-[var(--t-graphite)]',
  emptyArea: 'border-t border-[var(--t-rule)] px-4 py-3 text-center text-sm text-[var(--t-pencil)] italic',
  addWrap: 'shrink-0',
}
