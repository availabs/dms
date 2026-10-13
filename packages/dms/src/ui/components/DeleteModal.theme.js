// Shared delete-confirmation dialog (UI.DeleteModal). tessera v6 default, 2026-10-06
// (datasets-page-pattern-v6-port.md, page 3) — mockup: design_system_v6/pages/datasets-source-admin.html
// (DMS delete). Owner: project themes fall back to this default; they can restyle via `deleteModal`.
// Before this, the component's classes were hardcoded (gray/red, unreadable in dark mode).
export const deleteModalTheme = {
  options: {
    activeStyle: 0
  },
  styles: [
    {
      name: 'default',
      // key names follow the deleteModal blocks fusion + transportny v2 already declared, so their
      // brand values apply as-is (wrapper/backdrop/panel there are Modal's concern — ignored here)
      content: 'flex items-start gap-3 text-left',
      iconWrap: 'size-9 flex-none rounded-full bg-[var(--t-brick-soft)] text-[var(--t-brick)] flex items-center justify-center',
      icon: 'TrashCan',     // '' → no icon
      iconClass: 'size-4',
      textWrap: 'min-w-0',
      title: 't-displaySM text-[var(--t-ink)]',
      body: 'mt-1 t-proseSM text-[var(--t-graphite)]',
      actions: 'mt-5 flex justify-end gap-2',
      cancelButton: 'h-8 inline-flex items-center px-3 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer',
      deleteButton: 'h-8 inline-flex items-center px-3 rounded-md t-proseSM font-medium text-[var(--t-accent-ink)] bg-[var(--t-brick)] hover:opacity-90 disabled:opacity-40 cursor-pointer',
    }
  ]
}

export const docs = {
    title: 'title',
    prompt: 'Prompt',
    open: true,
    setOpen: () => {},
    onDelete: () => {}
}
