// UI.ButtonSelect — a row of buttons, one selected. Each option is a UI.Button; `buttonStyle` /
// `buttonActiveStyle` name the UI.Button styles (activeStyle) for an option and the selected option —
// never classes. Style 0 ('default') keeps the original 'plain' / 'active'. Named styles are opt-in per
// caller (activeStyle), so adding one changes no existing page.
export const buttonSelectTheme = {
  options: {
    activeStyle: 0
  },
  styles: [
    {
      name: 'default',
      wrapper: 'flex gap-0.5',
      buttonStyle: 'plain',
      buttonActiveStyle: 'active',
    },
    {
      // tessera v6 segmented control (datasets metadata editor, page history pane)
      name: 'segmented',
      wrapper: 'inline-flex flex-wrap gap-0.5 bg-[var(--t-well)] rounded-md p-0.5',
      buttonStyle: 'segment',
      buttonActiveStyle: 'segmentOn',
    },
  ]
}
