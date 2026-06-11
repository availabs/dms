// Theme for the TemplateManager menu panel (save/load component templates).
// Pattern-tied — registered into page/defaultTheme.js under `templateManager`
// (resolved at `pages.templateManager`) so site themes can re-skin it. Flat
// key map per the pattern-tied convention; no styles[] needed.

export const templateManagerTheme = {
  wrapper: 'flex flex-col gap-3 p-2 w-72 max-w-full text-sm',

  // ── Save form ──
  saveForm: 'flex flex-col gap-2 pb-3 border-b border-slate-100',
  formTitle: 'text-[11px] font-semibold uppercase tracking-wide text-slate-500',
  input: 'w-full px-2 py-1 text-sm bg-transparent border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400',
  toggleRow: 'flex items-center justify-between gap-2',
  toggleLabel: 'text-sm text-slate-600',
  saveRow: 'flex items-center justify-between gap-2 pt-0.5',
  saveActions: 'flex items-center gap-2 shrink-0',
  hint: 'text-[11px] text-slate-500 leading-snug truncate',
  error: 'text-[11px] text-red-500 leading-snug',

  // ── Inline confirm (overwrite / delete) ──
  confirmLabel: 'text-[11px] text-slate-500',
  confirmYes: 'text-xs font-medium text-red-600 hover:text-red-800 cursor-pointer px-1',
  confirmNo: 'text-xs text-slate-500 hover:text-slate-700 cursor-pointer px-1',

  // ── Saved list ──
  listTitle: 'text-[11px] font-semibold uppercase tracking-wide text-slate-500',
  list: 'flex flex-col gap-0.5 max-h-64 overflow-auto',
  empty: 'text-xs text-slate-400 italic py-1',
  loading: 'text-xs text-slate-400 py-1',
  row: 'flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-slate-50 group',
  rowMain: 'flex flex-col min-w-0',
  rowName: 'text-sm text-slate-700 truncate',
  rowMeta: 'text-[11px] text-slate-400 truncate',
  rowActions: 'flex items-center gap-1.5 shrink-0',
  applyBtn: 'text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer px-2 py-0.5 rounded hover:bg-blue-50',
  trashIcon: 'size-4 text-slate-300 hover:text-red-500 cursor-pointer transition',
};

export default templateManagerTheme;
