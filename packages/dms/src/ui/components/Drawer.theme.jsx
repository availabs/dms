import React from 'react'

// Colors for the slide-in side panel (the page editor's right-hand sidebar).
// Position/size/animation stay in Drawer.jsx; only the look lives here, on the
// --t-* tokens so the panel follows dark mode. It used to hard-code `bg-white`,
// which left token- and `dark:`-colored text white-on-white in dark mode.
export const drawerTheme = {
  panel: 'bg-[var(--t-panel)] text-[var(--t-ink)] border-l border-[var(--t-rule)] shadow-lg',
  closeButton: 'relative rounded-md text-[var(--t-pencil)] hover:text-[var(--t-graphite)] focus:outline-none',
}

export const docs = {
  open: true,
  children: <div>drawer content</div>
}
