import { lexicalTheme } from './lexical/theme'

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
    // 2026-10-15: a 24px value field inside a dense row (datasets overview "at a glance" edit), right-aligned text
    {
      name: 'compact',
      input: 'w-full h-6 px-2 rounded-md border border-[var(--t-rule-strong)] bg-[var(--t-panel)] t-proseXS text-right text-[var(--t-ink)] placeholder:text-[var(--t-pencil)] hover:border-[var(--t-graphite)] outline-none focus:border-[var(--t-ink)] aria-invalid:border-[var(--t-brick)] disabled:bg-[var(--t-well)] disabled:text-[var(--t-pencil)] disabled:cursor-not-allowed transition-colors duration-150',
    },
    // a small filter in a table's column header (auth manage Users / Groups) — was `authPages.manage.headerInput`
    {
      name: 'headerFilter',
      input: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded px-2 py-1 text-xs text-[var(--t-ink)] placeholder:text-[var(--t-pencil)] outline-none focus:border-[var(--t-rule-strong)] w-32',
    },
    // 2026-10-16 (page-pattern raw-HTML pass): strings copied from the default theme's pattern keys
    // the settings pane's inline page title (editPanes.titleInput): display-size, a field only on hover / focus
    {
      name: 'title',
      input: 'w-full bg-transparent t-displaySM text-[var(--t-ink)] outline-none rounded px-1.5 -mx-1.5 py-0.5 hover:bg-[var(--t-well)] focus:bg-[var(--t-panel)] focus:ring-2 focus:ring-[var(--t-rule-strong)]',
    },
    // a field inside the section menu (sectionMenu.textInput); project themes keep their underline field (_legacy/ui.js)
    {
      name: 'menu',
      input: 'w-full h-8 px-2.5 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] outline-none focus:border-[var(--t-ink)] placeholder:text-[var(--t-pencil)]',
    },
    // 'bare' that keeps its container's font size (no text-sm)
    {
      name: 'bareInherit',
      input: 'w-full min-w-0 bg-transparent placeholder:text-[var(--t-pencil)] outline-none border-none p-0 h-auto',
    },
    // 2026-10-17 (ui composites pass): a table header menu's field (table.headerCellControl); `contents` keeps the
    // wrapper span out of the menu row's flex layout, as the raw <input> it replaced was
    // the Lexical link editor's URL field: the library lexical theme's linkEditor_linkInput_base, exactly (its layout
    // included — `contents` keeps the wrapper span out of the editor box's flex row)
    {
      name: 'lexLinkInput',
      inputContainer: 'contents',
      input: lexicalTheme.styles[0].linkEditor_linkInput_base,
    },
    {
      name: 'tableHeaderControl',
      inputContainer: 'contents',
      input: 'p-0.5 w-full rounded-md bg-[var(--t-panel)] group-hover:bg-[var(--t-well)] cursor-pointer',
    },
  ],
}

export const docs = {
  doc_name: 'example 1',
  type: 'text',
  placeholder: 'Please Enter value...'
}
