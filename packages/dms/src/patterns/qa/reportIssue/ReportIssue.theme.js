// The Report an issue widget's own look: only its layout and the few lines of text the shared UI parts
// don't draw. The button, the modal, the fields and the selects take the host theme's `button`, `modal`,
// `field`, `input` and `multiselect`, so the form looks like the site it sits on. A site overrides any
// key here under `qaReportIssue` in its theme (read with getComponentTheme over this default; not added
// to the library default theme, like the rest of qa.theme.js). Colours come from the shared `--t-*`
// tokens, per the QA token rule (qa.theme.js).
export const reportIssueTheme = {
  // the nav-slot button: its `UI.Button` style, its icon and its text. `iconOnly` leaves the text out (the
  // label stays the button's title); a slot's `iconOnly` / `activeStyle` options override these.
  iconOnly: false,
  buttonStyle: 'plain',
  iconButtonStyle: 'plain',
  icon: 'size-4 shrink-0',
  label: 'whitespace-nowrap',
  // `UI.Button` named styles (or indexes) for the form's two actions
  sendStyle: 'active',
  cancelStyle: 'plain',

  form: 'flex flex-col gap-4 text-left',
  header: 'flex flex-col gap-0.5',
  title: 'text-lg font-semibold text-[var(--t-ink)]',
  subtitle: 'text-sm text-[var(--t-pencil)]',
  note: 'text-xs text-[var(--t-pencil)]',
  error: 'text-sm text-[var(--t-brick)]',
  sentText: 'text-sm text-[var(--t-graphite)]',
  actions: 'flex justify-end gap-2',
}
