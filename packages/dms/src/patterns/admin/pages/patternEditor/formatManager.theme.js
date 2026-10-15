// v6 port (2026-09-21) — attribute-builder redesign of `admin-pattern-format.html`. Header
// keys mirror the Page Templates/Data/Activity `headerTitleWrap` shape (copied, not imported —
// this file has its own local row/form keys the others don't share); the save bar mirrors
// Overview's own sticky dirty-state bar (`settings.theme.js`'s `saveBar`/`btnReset`/`btnSave`)
// since this tab has the exact same "local draft until Save" shape Overview does.
export const formatManagerTheme = {
  wrapper: 'flex flex-col gap-4',

  header: 'flex flex-wrap items-center gap-x-5 gap-y-2 pb-3 mb-1 border-b border-[var(--t-rule)] flex-shrink-0',
  headerTitleWrap: 'min-w-0',
  headerTitleRow: 'flex items-center gap-2.5',
  headerTitle: 't-displayMD text-[var(--t-ink)] truncate',
  headerSubtitle: 't-metaSM text-[var(--t-pencil)] mt-1',
  countPill: 'inline-flex items-center h-[18px] px-1.5 rounded-full border border-[var(--t-rule)] t-metaXS text-[var(--t-pencil)]',
  headerSpacer: 'flex-1',

  // sticky save bar — same convention as Overview's (settings.theme.js).
  saveBar: 'flex items-center gap-3 px-4 py-2.5 rounded-lg border border-[var(--t-rule)] bg-[var(--t-well)] sticky top-0 z-10',
  saveBarDirty: 'flex items-center gap-3 px-4 py-2.5 rounded-lg border border-[var(--t-amber)] bg-[var(--t-amber-soft)] sticky top-0 z-10',
  saveBarText: 't-metaSM text-[var(--t-graphite)]',
  saveBarTextDirty: 't-metaSM text-[var(--t-amber)]',

  // attribute list
  list: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg overflow-hidden divide-y divide-[var(--t-rule)]',
  row: 'px-4 py-3',
  rowEditing: 'px-4 py-3 bg-[var(--t-well)]/60',
  rowHeadRow: 'flex flex-wrap items-center gap-3',
  typePill: 'inline-flex items-center h-[18px] px-1.5 rounded border border-[var(--t-rule)] t-metaXS text-[var(--t-graphite)] font-mono flex-none',
  typePillAccent: 'inline-flex items-center h-[18px] px-1.5 rounded border border-[var(--t-rule)] t-metaXS text-[var(--t-graphite)] font-mono flex-none text-[var(--t-ink)]',
  rowMeta: 'min-w-0 flex-1',
  rowMetaLine: 'flex items-center gap-2 flex-wrap',
  rowKey: 't-proseSM font-medium font-mono text-[var(--t-ink)]',
  rowDisplayName: 't-metaXS text-[var(--t-graphite)]',
  requiredPill: 'inline-flex items-center gap-1.5 h-[18px] px-1.5 rounded t-metaXS bg-[var(--t-brick-soft)] text-[var(--t-brick)]',
  rowHint: 't-metaXS text-[var(--t-pencil)] mt-0.5',
  editingTag: 't-metaXS text-[var(--t-paper)] bg-[var(--t-ink)] rounded-md px-2 py-1 flex-none',

  rowActions: 'flex items-center gap-1 flex-none',
  iconBtnIcon: 'w-3.5 h-3.5',

  confirmRow: 'flex gap-2 items-center t-metaXS flex-none',
  confirmLabel: 'text-[var(--t-pencil)]',

  // inline edit form
  form: 'mt-3 border border-[var(--t-rule)] rounded-md bg-[var(--t-panel)] p-3 space-y-3',
  formGrid: 'grid grid-cols-1 sm:grid-cols-2 gap-3',
  field: 'block',
  fieldLabel: 't-metaXS text-[var(--t-pencil)] uppercase tracking-widest',
  // wraps a UI.Input / UI.Select under its label (the gap the raw field's mt-1 used to carry)
  fieldControl: 'block mt-1',
  fieldSwitchRow: 'flex items-center gap-2 pt-5',
  fieldSwitchLabel: 't-metaSM text-[var(--t-graphite)]',

  optionsBlock: '',
  optionsHeadRow: 'flex items-center gap-2 mb-1.5',
  optionsHint: 't-metaXS text-[var(--t-pencil)]',
  optionsList: 'space-y-1.5',
  optionRow: 'flex items-center gap-2',
  optionRemoveIcon: 'w-3.5 h-3.5',
  addOptionWrap: 'mt-2',
  addOptionIcon: 'w-3 h-3',

  formFooter: 'flex items-center justify-end gap-2 pt-1',

  empty: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg px-4 py-6 text-center',
  emptyText: 't-proseSM text-[var(--t-graphite)] max-w-[42rem] mx-auto',

  addBtnWrap: 'mt-3',
  addBtnIcon: 'w-4 h-4',

  // raw json escape hatch
  rawCard: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg p-4',
  rawTextareaWrap: 'mt-1',
  rawError: 'text-sm text-[var(--t-brick)] mt-2',
};
