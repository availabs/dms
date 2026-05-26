# Land `UI.DialogActions` — the last lexical-internal UI primitive

## Objective

Move the dialog action-bar wrapper (the small flex row at the
bottom of every modal: "Confirm" / "Cancel" / "Apply" / etc.)
out of `lexical/editor/ui/Dialog.tsx` into the shared brand UI
as `UI.DialogActions`. Last step in retiring the
lexical-internal UI primitives.

## Scope

**In scope**
- Create `src/dms/packages/dms/src/ui/components/DialogActions.{jsx,theme.{js,jsx}}`.
- Register on `UI` in `ui/index.js`.
- Add `dialogActions` theme key to `defaultTheme.js` (with sensible
  defaults: `flex items-center justify-end gap-2 mt-6 pt-4 border-t`).
- Themes can override (Tessera already has `modal.footer` with
  matching shape — alias to that).
- Update every consumer of `import { DialogActions } from '../../ui/Dialog'`
  to use `UI.DialogActions` from ThemeContext.
- Once all consumers migrate, delete `lexical/editor/ui/Dialog.tsx`.

**Out of scope**
- Replacing the lexical-internal `Modal.tsx` (already replaced by
  `UI.Modal` via `useModal` in the Button task).

## Why

`DialogActions` is the last reference to the lexical-internal
`ui/Dialog.tsx` file after the plugins-ui-migration task lands.
Lifting it to `UI.DialogActions` makes the lexical/editor/ui/
folder fully orphan and deletable.

It's also a useful brand primitive in its own right — any modal
that needs an action bar at the bottom (not just inside Lexical
dialogs) currently has to hand-roll one.

## Files Requiring Changes

| File | Change |
|---|---|
| `src/dms/packages/dms/src/ui/components/DialogActions.jsx` | New — flex row with theme-driven layout. |
| `src/dms/packages/dms/src/ui/components/DialogActions.theme.js` | New — `{ wrapper: 'flex items-center justify-end gap-2 mt-6 pt-4 border-t' }`. |
| `src/dms/packages/dms/src/ui/index.js` | Register on `UI`. |
| `src/dms/packages/dms/src/ui/defaultTheme.js` | Register `dialogActions: dialogActionsTheme`. |
| Each lexical plugin dialog (ButtonPlugin, ImagePlugin, LayoutPlugin, TablePlugin, etc.) | Swap `import { DialogActions } from '../../ui/Dialog'` for `UI.DialogActions` from ThemeContext. |
| `src/dms/packages/dms/src/ui/components/lexical/editor/ui/Dialog.tsx` | Delete after all consumers migrate. |
| `src/themes/tessera/tessera-theme.js` | Optionally alias `dialogActions.wrapper` to `modal.footer` so the action bar matches the modal's own bottom-rule treatment. |

## Testing Checklist

- [ ] Every plugin dialog still renders an action bar at the bottom.
- [ ] Tessera's action bar uses the brand's hairline top-border
      + flex-end alignment (same as `modal.footer`).
- [ ] `grep -rln "from '../../ui/Dialog'" src/dms/packages/dms/src/ui/components/lexical/editor/`
      returns nothing.
- [ ] `lexical/editor/ui/Dialog.tsx` deletable; build passes.

## Dependencies

Blocked by: `lexical-plugins-ui-migration.md` — needs to land
first so the other consumers stop importing from `ui/Dialog`.

## Outcome

Landed in the same session as the plugins-migration task.

- `DialogActions.{jsx,theme.js}` shipped, registered on `UI` and
  in `defaultTheme.js`.
- Tessera aliases `dialogActions.wrapper` to `modal.footer` so
  the action bar matches the modal's bottom-rule treatment
  (groutLight hairline, right-aligned, mt-6 pt-4).
- All five Lexical plugin dialogs (Button, Layout, InlineImage,
  Table, InlineImageComponent) pull `UI.DialogActions` from
  ThemeContext with an inline `<div>` fallback.
- `lexical/editor/ui/Dialog.tsx` deleted.

### Companion: `UI.Select`

Mid-task the user asked for a `UI.Select` wrapper around
`MultiSelect` with `singleSelectOnly` hardcoded — so the
post-migration dialogs read

```jsx
<Select options={…} value={x} onChange={setX} />
```

instead of repeating

```jsx
<MultiSelect singleSelectOnly searchable={false} options={…}
             value={x ? [x] : []}
             onChange={(s) => { const next = Array.isArray(s) ? s[0] : s; setX(next); }} />
```

at every single-value dropdown. `Select.jsx` shipped in
`ui/components/`, registered on `UI`, and every single-value
dropdown in the just-migrated dialogs uses it.
