// Theme for the TemplateManager menu panel (save/load component templates).
// Pattern-tied — registered into page/defaultTheme.js under `templateManager`
// (resolved at `pages.templateManager`) so site themes can re-skin it. Flat
// key map per the pattern-tied convention; no styles[] needed.
// tessera v6, 2026-10-08 (page-section-menu.html "templates"); pre-v6 values frozen in
// src/themes/_legacy/pages.js `templateManager`.

export const templateManagerTheme = {
  wrapper: 'flex flex-col gap-3 p-1.5 w-72 max-w-full',

  // ── Save form ──
  saveForm: 'flex flex-col gap-2 pb-3 border-b border-[var(--t-rule)]',
  formTitle: 't-metaXS text-[var(--t-pencil)]',
  input: 'w-full h-7 px-2.5 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] outline-none focus:border-[var(--t-ink)] placeholder:text-[var(--t-pencil)]',
  toggleRow: 'flex items-center justify-between gap-2',
  toggleLabel: 't-proseXS text-[var(--t-graphite)]',
  saveRow: 'flex items-center justify-between gap-2 pt-0.5',
  saveActions: 'flex items-center gap-2 shrink-0',
  hint: 't-proseXS text-[var(--t-amber)] leading-snug truncate',
  error: 't-proseXS text-[var(--t-brick)] leading-snug',

  // ── Inline confirm (overwrite / delete) ──
  confirmLabel: 't-proseXS text-[var(--t-brick)]',
  confirmYes: 't-metaXS text-[var(--t-brick)] hover:underline cursor-pointer px-1',
  confirmNo: 't-metaXS text-[var(--t-graphite)] hover:text-[var(--t-ink)] cursor-pointer px-1',

  // ── Saved list ──
  listTitle: 't-metaXS text-[var(--t-pencil)]',
  list: 'flex flex-col gap-0.5 max-h-64 overflow-auto scrollbar-xs',
  empty: 't-proseXS text-[var(--t-pencil)] py-1',
  loading: 't-proseXS text-[var(--t-pencil)] py-1',
  row: 'flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--t-well)] group',
  rowMain: 'flex flex-col min-w-0',
  rowName: 't-proseSM text-[var(--t-ink)] truncate',
  rowMeta: 't-proseXS text-[var(--t-pencil)] truncate',
  rowActions: 'flex items-center gap-1.5 shrink-0',
  applyBtn: 't-metaXS text-[var(--t-ink)] cursor-pointer px-2 py-0.5 rounded border border-[var(--t-rule)] hover:border-[var(--t-ink)]',
  trashIcon: 'size-3.5 text-[var(--t-pencil)] hover:text-[var(--t-brick)] cursor-pointer transition',
};

export default templateManagerTheme;
