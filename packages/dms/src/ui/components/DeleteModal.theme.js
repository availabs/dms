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
      // UI.Button named styles (2026-10-17, raw-HTML pass): 'modalCancel' / 'modalDelete' in Button.theme.jsx; a
      // project theme's own cancelButton / deleteButton is lifted (src/themes/_legacy/ui.js liftPatternRoles)
      cancelButtonStyle: 'modalCancel',
      deleteButtonStyle: 'modalDelete',
      // `items`: everything the delete takes with it, listed under the prompt (safe-delete-removes-rows.md:
      // every delete warning shows everything that will be deleted). A blocked item names why.
      listTitle: 'mt-3 t-metaSM text-[var(--t-graphite)]',
      list: 'mt-1 max-h-56 overflow-y-auto rounded border border-[var(--t-rule)] bg-[var(--t-well)] divide-y divide-[var(--t-rule)]',
      listItem: 'flex items-baseline justify-between gap-3 px-2.5 py-1.5 t-proseSM text-[var(--t-ink)]',
      listItemBlocked: 'flex items-baseline justify-between gap-3 px-2.5 py-1.5 t-proseSM text-[var(--t-brick)] bg-[var(--t-brick-soft)]',
      listItemLabel: 'min-w-0 break-words',
      listItemDetail: 'flex-none t-metaSM text-[var(--t-graphite)]',
      listItemReason: 'flex-none t-metaSM',
      blockedNote: 'mt-3 t-proseSM text-[var(--t-brick)]',
      note: 'mt-2 t-proseSM text-[var(--t-graphite)]',
      error: 'mt-3 t-proseSM text-[var(--t-brick)]',
    }
  ]
}

export const docs = {
    title: 'title',
    prompt: 'Prompt',
    open: true,
    setOpen: () => {},
    onDelete: () => {},
    items: [
        { id: 1, label: 'Parent page', detail: '4 sections' },
        { id: 2, label: '— Child page', detail: '2 sections' },
        { id: 3, label: '— Locked child', blocked: true, reason: 'no permission' },
    ],
}
