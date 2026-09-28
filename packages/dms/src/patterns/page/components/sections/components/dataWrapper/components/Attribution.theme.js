export const attributionTheme = {
    wrapper: 'inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--t-pencil)]',
    label: '',
    link: 'text-[var(--t-graphite)] hover:text-[var(--t-ink)] underline underline-offset-[2px]',
    // Per-row separator (the vertical rule between "Attribution:" rows when a
    // section joins multiple sources). Was hardcoded inline at every Attribution.jsx
    // call site; a theme that doesn't set this key falls back to this exact
    // literal in Attribution.jsx, so every existing theme renders byte-identically.
    divider: 'border-r-1 last:border-r-0 px-1'
}
