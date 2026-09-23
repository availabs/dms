import React from 'react'

export const dialogTheme  = {
  // Outer overlay: catches click-outside to close.
  dialogContainer: "fixed z-50 inset-0 w-screen overflow-y-auto pt-6 sm:pt-0",
  // Backdrop sits behind the panel; pointer-events:none so the container handles clicks.
  backdrop: "fixed inset-0 bg-[var(--t-scrim)] pointer-events-none",
  // Panel positioner.
  dialogContainer2: "relative grid min-h-full grid-rows-[1fr_auto] justify-items-center sm:grid-rows-[1fr_auto_3fr] sm:p-4",
  // Panel itself.
  dialogPanel: `
    row-start-2 w-full p-6 min-w-0 bg-[var(--t-panel)] border border-[var(--t-rule)] shadow-[var(--t-shadow-drag)] rounded-lg [--gutter:32px] sm:mb-auto
  `,
  sizes:  {
    xs: 'sm:max-w-xs',
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
    '2xl': 'sm:max-w-2xl',
    '3xl': 'sm:max-w-3xl',
    '4xl': 'sm:max-w-4xl',
    '5xl': 'sm:max-w-5xl',
  }
}

export const docs = {
    size: 'lg',
    open: true,
    onClose: () => {},
    children: <div>Dialog</div>
}
