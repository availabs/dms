// "Choose a template" — the new-page picker (PageTemplatePicker.jsx), opened from the Pages pane's
// "+ page". tessera v6, 2026-10-08, from design_system_v6/pages/page-new.html; no accent colour
// (the selected template is marked in ink). Pre-v6 values frozen in src/themes/_legacy/pages.js
// `pageTemplatePicker`.
export const pageTemplatePickerTheme = {
  backdrop: 'fixed inset-0 bg-[var(--t-scrim)] z-50 flex items-center justify-center p-4',
  modal: 'w-full max-w-3xl max-h-[80vh] flex flex-col bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg shadow-[var(--t-shadow-drag)]',
  header: 'px-5 pt-4',
  headerTitle: 't-displaySM text-[var(--t-ink)]',
  tabs: 'flex gap-5 px-5 mt-2 border-b border-[var(--t-rule)]',
  tab: 'h-9 inline-flex items-center t-proseSM border-b-2 border-transparent -mb-px text-[var(--t-graphite)] hover:text-[var(--t-ink)] cursor-pointer',
  tabActive: 'h-9 inline-flex items-center t-proseSM font-medium border-b-2 border-[var(--t-ink)] -mb-px text-[var(--t-ink)] cursor-pointer',
  grid: 'grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 overflow-y-auto flex-1',
  card: 'flex flex-col text-left rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)] p-2.5 cursor-pointer hover:border-[var(--t-rule-strong)] transition-colors',
  cardSelected: 'flex flex-col text-left rounded-lg border border-[var(--t-ink)] ring-1 ring-[var(--t-ink)] bg-[var(--t-well)] p-2.5 cursor-pointer',
  cardPreview: 'w-full h-16 rounded-md bg-[var(--t-well)] flex flex-col gap-1 p-2 overflow-hidden mb-2',
  cardPreviewBlock: 'rounded-sm bg-[var(--t-rule-strong)]',
  cardName: 't-proseSM font-medium text-[var(--t-ink)]',
  cardDescription: 't-proseXS text-[var(--t-graphite)] mt-0.5 line-clamp-2',
  footer: 'flex items-center gap-3 px-5 py-3 border-t border-[var(--t-rule)]',
  footerInfo: 'flex-1 min-w-0 truncate t-proseSM text-[var(--t-graphite)]',
  footerActions: 'flex gap-2',
  cancelBtn: 'inline-flex items-center h-8 px-3 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer',
  createBtn: 'inline-flex items-center h-8 px-3.5 rounded-md border border-[var(--t-rule-strong)] bg-[var(--t-panel)] t-proseSM font-medium text-[var(--t-ink)] hover:border-[var(--t-ink)] cursor-pointer',
  createBtnDisabled: 'inline-flex items-center h-8 px-3.5 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseSM text-[var(--t-pencil)] opacity-60 cursor-not-allowed',
  emptyState: 'col-span-full text-center py-8 t-proseSM text-[var(--t-graphite)]',
  loadingState: 'col-span-full text-center py-8 t-proseSM text-[var(--t-pencil)]',
};
