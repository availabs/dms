// UI.Textarea (2026-10-14, ui-controls.html "Fields", ui-control-fields.md) — v6 textarea, ink focus, no ring.
// It used to render a hardcoded Catalyst look (zinc, blue focus ring) because `textarea` was never
// registered in ui/defaultTheme.js; that look is frozen for project themes in src/themes/_legacy/ui.js.
// Locked like UI.Input (2026-10-14): the look comes only from these named styles, never a `className`.
export const textareaTheme = {
  options: { activeStyle: 0 },
  styles: [
    {
      name: 'default',
      textAreaContainer: 'flex relative w-full',
      textarea: 'w-full px-2.5 py-2 rounded-md border border-[var(--t-rule-strong)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] placeholder:text-[var(--t-pencil)] hover:border-[var(--t-graphite)] outline-none focus:border-[var(--t-ink)] aria-invalid:border-[var(--t-brick)] disabled:bg-[var(--t-well)] disabled:text-[var(--t-pencil)] resize-y min-h-[6rem] transition-colors duration-150',
      confirmButtonContainer: 'absolute right-0 hidden group-hover:flex items-center',
      editButton: 'py-1.5 px-2 text-[var(--t-pencil)] hover:text-[var(--t-ink)] cursor-pointer',
      cancelButton: 'py-1.5 pr-1 text-[var(--t-pencil)] hover:text-[var(--t-brick)] cursor-pointer',
      confirmButton: 'text-[var(--t-go)] hover:text-[var(--t-ink)] cursor-pointer rounded-full',
    },
    // 2026-10-15 (ui-raw-html-to-ui-components.md): raw JSON / code (admin format manager)
    {
      name: 'mono',
      textarea: 'w-full px-2.5 py-2 rounded-md border border-[var(--t-rule-strong)] bg-[var(--t-panel)] t-metaSM font-mono text-[var(--t-ink)] placeholder:text-[var(--t-pencil)] hover:border-[var(--t-graphite)] outline-none focus:border-[var(--t-ink)] aria-invalid:border-[var(--t-brick)] disabled:bg-[var(--t-well)] disabled:text-[var(--t-pencil)] resize-y min-h-[6rem] transition-colors duration-150',
    },
  ],
}
