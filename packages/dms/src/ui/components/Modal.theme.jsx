export const modalTheme = {
  options: {
    activeStyle: 0
  },
  styles: [
    {
      name: 'default',
      panel: 'relative bg-[var(--t-panel)] border border-[var(--t-rule)] shadow-[var(--t-shadow-drag)] rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto',
      // Was hardcoded `bg-gray-500/75` directly in Modal.jsx (never themed at
      // all) — found while translating the Users/Groups manage-page mockups,
      // fixed here so every modal in the app gets a dark-mode-correct scrim.
      backdrop: 'fixed inset-0 bg-[var(--t-scrim)]',
      // overlay layout (was inline in Modal.jsx; 2026-10-14 moved to the theme, values unchanged)
      overlay: 'fixed inset-0 z-30',
      scroller: 'fixed inset-0 z-10 overflow-y-auto',
      positioner: 'flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0'
    },
    {
      // A wide picker / browser modal (map editor source + symbology pickers, TNY report / graph pickers).
      // v6 2026-10-14 (ui-control-tabs-overlays.md): the panel on tokens (was bg-white / shadow-xl, white in
      // dark mode). Pre-v6 frozen in src/themes/_legacy/ui.js `modal`.
      name: 'wide',
      panel: 'relative transform overflow-hidden rounded-lg bg-[var(--t-panel)] border border-[var(--t-rule)] px-4 pb-4 pt-5 text-left shadow-[var(--t-shadow-drag)] sm:my-8 sm:w-full sm:max-w-7xl sm:p-6'
    },
    {
      // The default panel at max-w-2xl (2026-10-14) — replaces `className="max-w-2xl"` (datasets PM tiles modal).
      name: 'large',
      panel: 'relative bg-[var(--t-panel)] border border-[var(--t-rule)] shadow-[var(--t-shadow-drag)] rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto'
    },
    {
      // The default panel at max-w-3xl, text left (2026-10-14) — replaces the GIS map settings modal's
      // `className="max-w-3xl! text-left"`, which the Modal lock dropped.
      name: 'settings',
      panel: 'relative bg-[var(--t-panel)] border border-[var(--t-rule)] shadow-[var(--t-shadow-drag)] rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto text-left'
    }
  ]
}

export const docs = {
  children: <div>modal content</div>,
  open: true,
  setOpen: () => {}
}
