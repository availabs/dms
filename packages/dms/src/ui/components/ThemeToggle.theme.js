export const themeToggleTheme = {
  button: 'w-8 h-8 shrink-0 rounded-md border border-[var(--t-rule)] flex items-center justify-center text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer transition-colors duration-150',
  icon: 'w-4 h-4',
}

export const themeToggleSettings = [{
  label: 'Theme Toggle',
  type: 'inline',
  controls: Object.keys(themeToggleTheme)
    .map((k) => ({ label: k, type: 'Textarea', path: `themeToggle.${k}` })),
}]
