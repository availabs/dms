export const themeToggleTheme = {
  button: 'w-8 h-8 rounded-md border border-gray-300 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:border-gray-400 cursor-pointer transition-colors duration-150',
  icon: 'w-4 h-4',
}

export const themeToggleSettings = [{
  label: 'Theme Toggle',
  type: 'inline',
  controls: Object.keys(themeToggleTheme)
    .map((k) => ({ label: k, type: 'Textarea', path: `themeToggle.${k}` })),
}]
