export const themeToggleTheme = {
  button: 'w-8 h-8 shrink-0 rounded-md border border-[var(--t-rule)] flex items-center justify-center text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer transition-colors duration-150',
  icon: 'w-4 h-4',
}

export const themeToggleSettings = [{
  label: 'Color Scheme',
  type: 'inline',
  controls: [{
    // Theme-wide, not a toggle style: applies on every page of a pattern using
    // this theme, toggle or not. Cleared = follow the viewer's OS setting. A
    // viewer's own toggle choice always wins. See render/spa/utils/PatternColorScheme.jsx.
    label: 'Default mode',
    type: 'MultiSelect',
    singleSelectOnly: true,
    allowDeselect: true,
    searchable: false,
    placeholder: 'Follow OS setting',
    options: [{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }],
    path: 'defaultColorScheme',
  }],
}, {
  label: 'Theme Toggle',
  type: 'inline',
  controls: Object.keys(themeToggleTheme)
    .map((k) => ({ label: k, type: 'Textarea', path: `themeToggle.${k}` })),
}]
