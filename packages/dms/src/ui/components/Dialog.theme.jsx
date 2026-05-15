import React from 'react'

export const dialogTheme  = {
  // Outer overlay: catches click-outside to close.
  dialogContainer: "fixed z-50 inset-0 w-screen overflow-y-auto pt-6 sm:pt-0",
  // Backdrop sits behind the panel; pointer-events:none so the container handles clicks.
  backdrop: "fixed inset-0 bg-zinc-950/25 pointer-events-none dark:bg-zinc-950/50",
  // Panel positioner.
  dialogContainer2: "relative grid min-h-full grid-rows-[1fr_auto] justify-items-center sm:grid-rows-[1fr_auto_3fr] sm:p-4",
  // Panel itself.
  dialogPanel: `
    row-start-2 w-full p-4 min-w-0 rounded-t-3xl bg-white p-[--gutter] shadow-lg ring-1 ring-zinc-950/10 [--gutter:theme(spacing.8)] sm:mb-auto sm:rounded-2xl dark:bg-zinc-900 dark:ring-white/10 forced-colors:outline
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
