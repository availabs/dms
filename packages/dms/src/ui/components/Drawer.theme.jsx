import React from 'react'

// Colors for the slide-in side panel (the page editor's right-hand sidebar).
// Position/size/animation stay in Drawer.jsx; only the look lives here, on the
// --t-* tokens so the panel follows dark mode. It used to hard-code `bg-white`,
// which left token- and `dark:`-colored text white-on-white in dark mode.
export const drawerTheme = {
  // v6 2026-10-14 (ui-controls.html "Modal and drawer"): drag shadow; pre-v6 shadow-lg frozen in _legacy/ui.js
  panel: 'bg-[var(--t-panel)] text-[var(--t-ink)] border-l border-[var(--t-rule)] shadow-[var(--t-shadow-drag)]',
  // pointer cursor (inventory 10/13: "drawer Close panel" rendered the default arrow) + ink focus ring
  closeButton: 'relative rounded-md text-[var(--t-pencil)] hover:text-[var(--t-ink)] cursor-pointer focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--t-ink)]',
}

export const docs = {
  open: true,
  children: <div>drawer content</div>
}
