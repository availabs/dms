// UI.ButtonSelect — a row of buttons, one selected. Style 0 ('default') keeps the original
// behaviour: '' classes → each option is a UI.Button using the button theme's 'active' / 'plain'
// styles. Named styles are opt-in per caller (activeStyle), so adding one changes no existing page.
export const buttonSelectTheme = {
  options: {
    activeStyle: 0
  },
  styles: [
    {
      name: 'default',
      wrapper: 'flex gap-0.5',
      button: '',        // '' → UI.Button activeStyle 'plain'
      buttonActive: '',  // '' → UI.Button activeStyle 'active'
    },
    {
      // tessera v6 segmented control (datasets metadata editor, 2026-10-07)
      name: 'segmented',
      wrapper: 'inline-flex flex-wrap gap-0.5 bg-[var(--t-well)] rounded-md p-0.5',
      button: 'px-2.5 h-7 rounded t-proseXS text-[var(--t-graphite)] hover:text-[var(--t-ink)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60',
      buttonActive: 'px-2.5 h-7 rounded t-proseXS bg-[var(--t-panel)] text-[var(--t-ink)] shadow-[var(--t-shadow-lift)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60',
    },
  ]
}
