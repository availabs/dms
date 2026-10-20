export const fieldTheme = {
  field: 'flex flex-col gap-1.5 mb-4',
  // Row wrapping the label + an optional `labelAccessory` (e.g. an inline link).
  labelRow: 'flex items-center justify-between',
  // the caption is a UI.FieldLabel named style (2026-10-17, raw-HTML pass): 'fieldSetLabel' in FieldLabel.theme.js; a
  // project theme's own `label` classes are lifted into a style of its own (src/themes/_legacy/ui.js liftPatternRoles)
  labelStyle: 'fieldSetLabel',
  description: 'font-sans text-xs text-[var(--t-graphite)]'
}

export const docs = {
  themeKey: 'field',
  components: [
    {label: 'field 1', description: 'this is field 1.'},
    {label: 'field 2', description: 'this is field 2.'},
  ]
}
