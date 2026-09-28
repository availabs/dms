// v6 port (2026-09-21) — design_system_v6/pages/admin-pattern-templates.html.
// header/headerTitleWrap/statsBar keys mirror pagesEditorTheme's shape (Pages/
// Data/Activity tabs) so the title sits at the identical left edge and vertical
// offset as every other Pattern Editor tab. No wrapper padding of its own —
// relies on patternEditor.theme.js's `content` gutter, same as those tabs
// (this file previously carried its own `p-6`, a leftover double-padding bug
// never fixed before this port).
export const pageTemplateManagerTheme = {
  wrapper: 'flex flex-col gap-5',

  header: 'flex flex-wrap items-center gap-x-5 gap-y-2 pb-3 mb-1 border-b border-[var(--t-rule)] flex-shrink-0',
  headerTitleWrap: 'min-w-0',
  headerTitleRow: 'flex items-center gap-2.5',
  headerTitle: 't-displayMD text-[var(--t-ink)] truncate',
  headerSubtitle: 't-metaSM text-[var(--t-pencil)] mt-1',
  statsBar: 'flex items-stretch divide-x divide-[var(--t-rule)] border border-[var(--t-rule)] rounded-lg bg-[var(--t-panel)] overflow-hidden flex-shrink-0 ml-auto',
  statCell: 'px-4 py-1.5',
  statValue: 'text-lg font-semibold tracking-[-0.015em] tabular-nums leading-none text-[var(--t-ink)]',
  statLabel: 't-metaXS text-[var(--t-pencil)] mt-0.5',

  section: '',
  sectionTitleRow: 'flex items-center gap-2 mb-2',
  sectionTitle: 't-metaXS text-[var(--t-pencil)] uppercase tracking-widest',
  sectionCount: 'normal-case tracking-normal',

  error: 'text-sm text-[var(--t-brick)] mb-2',
  empty: 't-proseSM text-[var(--t-pencil)] py-6 text-center',

  confirmRow: 'flex gap-2 items-center text-xs',
  confirmLabel: 'text-[var(--t-graphite)]',
  confirmYes: 'text-[var(--t-brick)] cursor-pointer hover:underline font-semibold',
  confirmNo: 'text-[var(--t-pencil)] cursor-pointer hover:underline',
  deleteBtn: 'text-[var(--t-brick)] cursor-pointer hover:opacity-80 text-xs',
};
