import React from 'react'

// Colors for the slide-in side panel (the page editor's right-hand sidebar).
// Position/size/animation stay in Drawer.jsx; only the look lives here, on the
// --t-* tokens so the panel follows dark mode. It used to hard-code `bg-white`,
// which left token- and `dark:`-colored text white-on-white in dark mode.
export const drawerTheme = {
  // v6 2026-10-14 (ui-controls.html "Modal and drawer"): drag shadow; pre-v6 shadow-lg frozen in _legacy/ui.js
  panel: 'bg-[var(--t-panel)] text-[var(--t-ink)] border-l border-[var(--t-rule)] shadow-[var(--t-shadow-drag)]',
  // the close button is a UI.Button named style (2026-10-17, raw-HTML pass): 'drawerClose' in Button.theme.jsx. A
  // project theme's own `closeButton` classes are lifted into a style of its own (src/themes/_legacy/ui.js liftPatternRoles).
  closeButtonStyle: 'drawerClose',
}

export const docs = {
  open: true,
  children: <div>drawer content</div>
}
