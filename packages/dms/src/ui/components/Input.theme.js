// UI.Input / Input's Textarea / ConfirmInput — named styles (2026-10-14, ui-control-fields.md). The component
// is locked: its look comes only from these styles (`activeStyle`), never from a `className`.
export const inputTheme = {
  options: { activeStyle: 0 },
  styles: [
    {
      name: 'default',
      // v6 field (2026-10-14, ui-controls.html "Fields", ui-control-fields.md): 32px, ink focus border, no ring.
      // Pre-v6 42px / cobalt-ring values frozen for project themes in src/themes/_legacy/ui.js `input`.
      input: 'w-full h-8 px-2.5 rounded-md border border-[var(--t-rule-strong)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] placeholder:text-[var(--t-pencil)] hover:border-[var(--t-graphite)] outline-none focus:border-[var(--t-ink)] aria-invalid:border-[var(--t-brick)] disabled:bg-[var(--t-well)] disabled:text-[var(--t-pencil)] disabled:cursor-not-allowed transition-colors duration-150',
      inputContainer: 'flex-1 relative w-full',
      textarea: 'w-full px-2.5 py-2 rounded-md border border-[var(--t-rule-strong)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] placeholder:text-[var(--t-pencil)] hover:border-[var(--t-graphite)] outline-none focus:border-[var(--t-ink)] aria-invalid:border-[var(--t-brick)] disabled:bg-[var(--t-well)] disabled:text-[var(--t-pencil)] resize-y min-h-[6rem] transition-colors duration-150',
      confirmButtonContainer: 'absolute right-0 top-0 bottom-0 hidden group-hover:flex items-center gap-1 pr-1',
      editButton: 'p-1 text-[var(--t-pencil)] hover:text-[var(--t-ink)] cursor-pointer',
      cancelButton:'p-1 text-[var(--t-pencil)] hover:text-[var(--t-brick)] cursor-pointer',
      confirmButton:'p-1 text-[var(--t-go)] hover:text-[var(--t-ink)] cursor-pointer',
    },
    // ConfirmInput and the textarea column type's editor. Empty here (= default); project themes keep their
    // pre-lock look through it (src/themes/_legacy/ui.js: those two read `theme.input` flat before the lock)
    { name: 'inline' },
    // a bare input inside its own styled search box (admin site list, tenant list, themes list) — the
    // `searchInput` className those pages passed before the lock
    {
      name: 'bare',
      input: 'w-full min-w-0 bg-transparent text-sm placeholder:text-[var(--t-pencil)] outline-none border-none p-0 h-auto',
    },
    // 2026-10-15 (ui-raw-html-to-ui-components.md): the default field in mono (keys, paths, JSON names)
    {
      name: 'mono',
      input: 'w-full h-8 px-2.5 rounded-md border border-[var(--t-rule-strong)] bg-[var(--t-panel)] t-proseSM font-mono text-[var(--t-ink)] placeholder:text-[var(--t-pencil)] hover:border-[var(--t-graphite)] outline-none focus:border-[var(--t-ink)] aria-invalid:border-[var(--t-brick)] disabled:bg-[var(--t-well)] disabled:text-[var(--t-pencil)] disabled:cursor-not-allowed transition-colors duration-150',
    },
    // the default field with room for a leading search icon the caller positions (admin pages / sources search)
    {
      name: 'search',
      input: 'w-full h-8 pl-7 pr-2.5 rounded-md border border-[var(--t-rule-strong)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] placeholder:text-[var(--t-pencil)] hover:border-[var(--t-graphite)] outline-none focus:border-[var(--t-ink)] aria-invalid:border-[var(--t-brick)] disabled:bg-[var(--t-well)] disabled:text-[var(--t-pencil)] disabled:cursor-not-allowed transition-colors duration-150',
    },
    // a small filter in a table's column header (auth manage Users / Groups) — was `authPages.manage.headerInput`
    {
      name: 'headerFilter',
      input: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded px-2 py-1 text-xs text-[var(--t-ink)] placeholder:text-[var(--t-pencil)] outline-none focus:border-[var(--t-rule-strong)] w-32',
    },
  ],
}

export const docs = {
  doc_name: 'example 1',
  type: 'text',
  placeholder: 'Please Enter value...'
}
