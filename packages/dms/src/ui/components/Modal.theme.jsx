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
      backdrop: 'fixed inset-0 bg-[var(--t-scrim)]'
    },
    {
      name: 'wide',
      panel: 'relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl sm:my-8 sm:w-full sm:max-w-7xl sm:p-6'
    }
  ]
}

export const docs = {
  children: <div>modal content</div>,
  open: true,
  setOpen: () => {}
}
