// UI.FieldLabel (2026-10-15, ui-raw-html-to-ui-components.md): the real <label> of a form field. Two shapes:
// a caption tied to a control by `htmlFor`, or a wrapper around its control (`text` is the caption, the
// control is `children`). Spec: controls.py FIELD_LABEL. UI.Label is a different thing (the tag chip).
// Pick a look with activeStyle; there is no className override.
export const fieldLabelTheme = {
  options: { activeStyle: 0 },
  styles: [
    {
      name: 'default',
      text: 'block t-metaXS text-[var(--t-pencil)] mb-1.5',  // the caption (the <label> itself when no children)
      wrapper: 'block min-w-0',                              // the <label> when it wraps its control
    },
    // a caption on the same row as its control (form grids, filter bars): no block / bottom margin
    {
      name: 'inline',
      text: 't-metaXS text-[var(--t-pencil)]',
    },
    // a prose caption in a settings row (complexFilters popupRowLabel, 2026-10-16) — the mockup's leaf-popup captions
    {
      name: 'row',
      text: 't-proseXS text-[var(--t-graphite)]',
    },
    // a filter's setting caption (RenderFilterValueSelector, 2026-10-16): the old library `filters.settingLabel` string,
    // so themes without their own caption keep it (themes with their own get a lifted style)
    {
      name: 'filterSetting',
      text: 'font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--t-pencil)]',
    },
  ],
}

export const docs = {
  text: 'Field label',
}
