// v6 (2026-10-09) — design_system_v6/pages/admin-pattern-user-menu.html.
// header/headerTitleWrap/statsBar keys mirror pageTemplateManagerTheme so the
// title sits at the same left edge and offset as every other Pattern Editor
// tab. Overridable per site via theme.admin.userMenuEditor.
export const userMenuEditorTheme = {
  wrapper: 'flex flex-col gap-5',

  header: 'flex flex-wrap items-center gap-x-5 gap-y-2 pb-3 mb-1 border-b border-[var(--t-rule)] flex-shrink-0',
  headerTitleWrap: 'min-w-0',
  headerTitleRow: 'flex items-center gap-2.5',
  headerTitle: 't-displayMD text-[var(--t-ink)] truncate',
  headerSubtitle: 't-metaSM text-[var(--t-pencil)] mt-1',
  headerActions: 'flex items-center gap-2 ml-auto',
  scopePill: 'inline-flex items-center gap-1.5 t-metaXS text-[var(--t-graphite)] border border-[var(--t-rule)] rounded-full px-2.5 py-1',
  scopePillIcon: 'size-3.5',
  dirtyNote: 'inline-flex items-center gap-1.5 t-metaXS text-[var(--t-amber)]',
  dirtyDot: 'size-1.5 rounded-full bg-[var(--t-amber)]',
  savedNote: 't-metaXS text-[var(--t-go)]',

  modeRow: 'flex flex-wrap items-center gap-3',
  modeLabel: 't-metaXS text-[var(--t-pencil)]',
  ownList: 'mt-1',
  ownListSummary: 'cursor-pointer text-[var(--t-graphite)] hover:text-[var(--t-ink)]',
  ownListNames: 'block mt-1 text-[var(--t-graphite)]',
  notice: 'flex items-start gap-2 bg-[var(--t-well)] border border-[var(--t-rule)] rounded-md p-3 t-proseXS text-[var(--t-graphite)]',   // info callout = neutral (owner 2026-10-13)
  noticeIcon: 'size-4 text-[var(--t-pencil)] flex-none mt-0.5',
  error: 't-proseSM text-[var(--t-brick)]',
  loading: 't-proseSM text-[var(--t-pencil)] py-6',

  grid: 'grid grid-cols-1 xl:grid-cols-12 gap-5 items-start',
  listCol: 'xl:col-span-7 min-w-0 flex flex-col gap-3',
  previewCol: 'xl:col-span-5 min-w-0 xl:sticky xl:top-4',

  // links card
  card: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg',
  cardHeader: 'flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[var(--t-rule)]',
  cardTitle: 't-metaSM text-[var(--t-graphite)]',
  count: 't-metaXS text-[var(--t-pencil)] border border-[var(--t-rule)] rounded-full px-2 py-0.5',
  spacer: 'flex-1',
  ghostBtnIcon: 'size-3.5',
  addBtnIcon: 'size-4',
  empty: 't-proseSM text-[var(--t-pencil)] px-4 py-6 text-center',

  list: 'divide-y divide-[var(--t-rule)]',
  row: 'hover:bg-[var(--t-well)]',
  rowOpen: 'bg-[var(--t-well)]',
  rowDragOver: 'shadow-[inset_0_2px_0_var(--t-ink)]',
  rowHead: 'flex items-center gap-3 px-4 py-2.5 cursor-pointer',
  grip: 'flex-none cursor-grab text-[var(--t-pencil)] hover:text-[var(--t-ink)]',
  gripIcon: 'size-4',
  rowIconTile: 'size-7 flex-none rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] flex items-center justify-center text-[var(--t-graphite)]',
  rowIcon: 'size-4',
  rowText: 'flex-1 min-w-0',
  rowName: 'block t-proseSM text-[var(--t-ink)] truncate',
  rowNamePlaceholder: 'block t-proseSM text-[var(--t-pencil)] truncate',
  rowPath: 'block font-mono text-[11.5px] text-[var(--t-pencil)] truncate',
  audienceAll: 'hidden sm:inline-flex t-metaXS text-[var(--t-pencil)]',
  audienceChip: 'inline-flex items-center gap-1 t-metaXS text-[var(--t-graphite)] border border-[var(--t-rule)] rounded-full px-2 py-0.5 max-w-[9rem]',
  audienceChipIcon: 'size-3 flex-none',
  audienceChipText: 'truncate',
  chevron: 'size-4 flex-none text-[var(--t-pencil)]',

  dividerRow: 'group flex items-center gap-3 px-4 py-2',
  dividerLine: 'flex-1 h-px bg-[var(--t-rule-strong)]',
  dividerLabel: 't-metaXS text-[var(--t-pencil)]',
  // the remove button shows on row hover (sm+); focus-within keeps it visible for keyboard users
  dividerRemoveWrap: 'inline-flex sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100',
  dividerRemoveIcon: 'size-4',

  // inline editor for the open link
  editor: 'px-4 pb-4 pt-1 sm:pl-[3.25rem] flex flex-col gap-4',
  fields: 'grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-4 gap-y-3 items-start',
  labelCell: 'flex sm:pt-2',   // the grid cell holding a UI.FieldLabel 'inline' caption (flex: no line-box strut)
  help: 't-proseXS text-[var(--t-pencil)] mt-1',
  iconBtnTile: 'size-6 rounded bg-[var(--t-well)] flex items-center justify-center text-[var(--t-ink)]',
  iconBtnIcon: 'size-4',
  iconBtnName: 't-proseSM text-[var(--t-ink)]',
  iconBtnCaret: 'size-3.5 text-[var(--t-pencil)]',
  picker: 'mt-2 border border-[var(--t-rule)] rounded-md bg-[var(--t-panel)] p-2 shadow-[var(--t-shadow-lift)]',
  pickerSearch: 'flex items-center gap-1.5 border border-[var(--t-rule)] rounded px-2 py-1 mb-2',
  pickerSearchIcon: 'size-3.5 text-[var(--t-pencil)]',
  pickerGrid: 'grid grid-cols-8 gap-1 max-h-48 overflow-y-auto',
  pickerItemIcon: 'size-4',
  pickerEmpty: 'col-span-8 t-proseXS text-[var(--t-pencil)] py-2 text-center',

  segmented: 'inline-flex p-0.5 gap-0.5 rounded-md border border-[var(--t-rule)] bg-[var(--t-well)] self-start',
  audienceWrap: 'flex flex-col gap-2',
  groupSelect: 'w-full max-w-md',

  editorFooter: 'flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--t-rule)]',
  removeBtnIcon: 'size-3.5',

  // built-in rows (appended by userMenu.jsx, not editable)
  builtins: 'border-t border-[var(--t-rule)] bg-[var(--t-well)] rounded-b-lg',
  builtinsHead: 'flex items-center gap-2 px-4 pt-3 pb-1',
  builtinsHeadIcon: 'size-3.5 text-[var(--t-pencil)]',
  builtinsTitle: 't-metaXS text-[var(--t-pencil)]',
  builtinsList: 'px-2 pb-2',
  builtinRow: 'flex items-center gap-3 px-2 py-1.5',
  builtinIconWrap: 'size-7 flex items-center justify-center text-[var(--t-pencil)]',
  builtinIcon: 'size-4',
  builtinName: 't-proseSM text-[var(--t-graphite)] flex-1',
  builtinNote: 't-metaXS text-[var(--t-pencil)]',

  footerLinks: 'flex flex-wrap items-center gap-3 px-1',
  footerNote: 't-metaXS text-[var(--t-pencil)]',
  confirmRow: 'inline-flex flex-wrap items-center gap-2 t-proseXS',
  confirmLabel: 'text-[var(--t-graphite)]',

  // live preview
  previewCard: 'bg-[var(--t-well)] border border-[var(--t-rule)] rounded-lg overflow-hidden t6-sheet',
  previewHeader: 'flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[var(--t-rule)] bg-[var(--t-panel)]',
  previewTitle: 't-metaSM text-[var(--t-graphite)]',
  viewerSelect: 'w-56 max-w-full',
  previewBody: 'flex flex-col items-start gap-2 p-5 sm:p-6',
  // same classes as the v6 user-menu dropdown (page-view.html)
  previewMenu: 'w-64 max-w-full bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg shadow-[var(--t-shadow-drag)] p-1.5',
  previewItem: 'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded t-proseSM text-left text-[var(--t-ink)]',
  previewItemIcon: 'size-4 text-[var(--t-pencil)]',
  previewItemName: 'flex-1 truncate',
  previewSep: 'my-1 h-px bg-[var(--t-rule)]',
  previewNote: 't-proseXS text-[var(--t-pencil)] pt-1',
};
