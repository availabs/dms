export const fieldTheme = {
  field: 'flex flex-col gap-1.5 mb-4',
  // Row wrapping the label + an optional `labelAccessory` (e.g. an inline link).
  labelRow: 'flex items-center justify-between',
  label: 'font-sans text-sm font-medium text-[var(--t-ink)]',
  description: 'font-sans text-xs text-[var(--t-graphite)]'
}

export const docs = {
  themeKey: 'field',
  components: [
    {label: 'field 1', description: 'this is field 1.'},
    {label: 'field 2', description: 'this is field 2.'},
  ]
}
