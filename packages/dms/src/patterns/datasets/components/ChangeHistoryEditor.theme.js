// The Change history panel on an internal dataset's Admin tab (ChangeHistoryEditor.jsx), next to
// the Access panel and in its look (admin.theme.js uacPanel). v6 2026-10-14 (step 2e audit): was hardcoded
// gray / blue / red; pre-change values frozen in src/themes/_legacy/datasets.js `changeHistoryEditor`.
export const changeHistoryEditorTheme = {
  panel: 'rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)] p-4 w-full mt-6 flex flex-col gap-4',
  header: 'flex items-center gap-3',
  title: 't-proseSM font-medium text-[var(--t-ink)]',
  spacer: 'flex-1',
  description: 't-proseSM text-[var(--t-graphite)]',
  row: 'grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3',
  label: 't-metaXS text-[var(--t-pencil)] pt-2',
  control: 'flex flex-col gap-2 min-w-0',
  inline: 'flex flex-wrap items-center gap-2',
  choice: 'inline-flex items-center gap-1.5 t-proseSM text-[var(--t-ink)] cursor-pointer',
  hint: 't-proseXS text-[var(--t-pencil)]',
  targetLink: 't-proseSM text-[var(--t-cobalt)] hover:underline pt-1.5 w-fit',   // link in text
  footer: 'flex items-center justify-end gap-3',
  status: 't-proseSM text-[var(--t-graphite)]',
  error: 't-proseSM text-[var(--t-brick)]',
}
