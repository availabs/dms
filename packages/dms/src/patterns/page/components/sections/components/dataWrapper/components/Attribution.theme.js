export const attributionTheme = {
    wrapper: 'w-full p-1 pt-[16px] flex gap-1 text-xs text-gray-900',
    label: '',
    link: '',
    // Per-row separator (the vertical rule between "Attribution:" rows when a
    // section joins multiple sources). Was hardcoded inline at every Attribution.jsx
    // call site; a theme that doesn't set this key falls back to this exact
    // literal in Attribution.jsx, so every existing theme renders byte-identically.
    divider: 'border-r-1 last:border-r-0 px-1'
}
