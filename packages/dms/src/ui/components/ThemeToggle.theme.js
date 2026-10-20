export const themeToggleTheme = {
  // a UI.Button named style (2026-10-17, raw-HTML pass): 'themeToggle' in Button.theme.jsx; a project theme's own
  // `button` classes are lifted into a style of its own (src/themes/_legacy/ui.js liftPatternRoles)
  buttonStyle: 'themeToggle',
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
