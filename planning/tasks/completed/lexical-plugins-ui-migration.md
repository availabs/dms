# Migrate remaining Lexical plugins to UI-from-ThemeContext

## Objective

Finish the work the Lexical Button task started: get every plugin
dialog and every embedded UI in the Lexical editor onto
`UI.{Button,Input,MultiSelect,Switch,Modal}` from `ThemeContext`,
so the editor is fully brand-themed and the lexical-internal
`ui/{Button,Select,TextInput}.tsx` primitives become orphans
(deletable in a follow-up).

## Scope

**In scope** — convert these plugin/node files to use UI from
ThemeContext (same recipe as `ButtonPlugin/index.tsx`):

| File | What it currently uses |
|---|---|
| `lexical/editor/plugins/ActionsPlugin/index.tsx` | `../../ui/Button` |
| `lexical/editor/plugins/LayoutPlugin/InsertLayoutDialog.tsx` | `../../ui/Button` |
| `lexical/editor/plugins/InlineImagePlugin/index.tsx` | `../../ui/{Button,Select,TextInput,Dialog}` |
| `lexical/editor/plugins/TablePlugin.tsx` | `../../ui/{Button,TextInput,Dialog}` |
| `lexical/editor/nodes/InlineImageComponent.tsx` | `../../ui/{Button,Select,TextInput}` |

**Out of scope**
- `ButtonPlugin/index.tsx` — already migrated (`tasks/completed/lexical-button-theme-integration.md`).
- Replacing `DialogActions` (the small action-bar wrapper at the
  bottom of dialogs) — that's a separate task to land
  `UI.DialogActions`.

## Why

- Every plugin dialog renders inside the brand-themed `UI.Modal`
  via `useModal` (after the Button task's Phase 2). The dialog
  *content* still uses the unstyled lexical-internal `<Button>` /
  `<TextInput>` / `<Select>` though — so the modal shell is
  parchment but the form fields inside it are still grey-and-white.
  This is jarring.
- Once all five files migrate, the lexical-internal
  `ui/{Button,Select,TextInput}.tsx` files have zero consumers
  and can be deleted. That removes ~300 lines of dead code.

## Approach (per-file recipe)

For each plugin/dialog:

1. **Add the ThemeContext import:**
   ```ts
   import { ThemeContext } from "../../../../useTheme";  // or 5 dots
   ```
   (4 dots from `editor/plugins/<X>/index.tsx`; 5 dots from
   `editor/plugins/<X>Plugin/index.tsx` — depth matters.)

2. **Pull UI from context inside the dialog component:**
   ```ts
   const { UI } = React.useContext(ThemeContext) || {};
   const Input = UI?.Input;
   const Button = UI?.Button;
   const MultiSelect = UI?.MultiSelect;
   ```

3. **Swap `<TextInput label="…" />` for `<Input>`:**
   ```jsx
   <label className="flex flex-col gap-1.5">
     <span className="text-sm font-medium">URL</span>
     <Input value={url} onChange={(e) => setUrl(e.target.value)} />
   </label>
   ```
   `UI.Input` takes a standard `onChange={e => …}` instead of
   `onChange={value => …}`.

4. **Swap `<Select>` for `<MultiSelect singleSelectOnly>`** (or a
   plain `<select>` fallback if the field is short-lived form
   chrome, e.g. table-row-count). Auto-populate options from theme
   data where applicable (e.g. `theme.button.styles[].name`).

5. **Swap `<Button>` for `UI.Button`** with appropriate
   `activeStyle` if the theme has named variants
   (`default` / `plain` / `danger`).

6. **Keep `DialogActions`** for the action bar at the bottom —
   unchanged until that becomes `UI.DialogActions` in the next
   task.

## Files Requiring Changes

| File | Notes |
|---|---|
| `lexical/editor/plugins/ActionsPlugin/index.tsx` | A long action bar with many buttons; the simplest migration — just `<Button>` swaps. |
| `lexical/editor/plugins/LayoutPlugin/InsertLayoutDialog.tsx` | Currently has a hardcoded list of layout templates (`1fr 1fr`, `1fr 2fr 1fr`, etc.) — keep the templates list, just swap the dialog primitives. (See follow-up: theme-driven layout templates.) |
| `lexical/editor/plugins/InlineImagePlugin/index.tsx` | Larger — has image-upload form (URL field, alt-text field, position select). Position select can stay as a plain `<select>` or move to MultiSelect. |
| `lexical/editor/plugins/TablePlugin.tsx` | Rows/columns input — small. |
| `lexical/editor/nodes/InlineImageComponent.tsx` | In-editor inline editing chrome. Smallest patch. |

## Testing Checklist

- [ ] `/image` slash command opens a dialog with brand-themed
      fields (parchment Input focus ring, brand MultiSelect for
      position, brand Button for "Confirm").
- [ ] `/table` slash command — same.
- [ ] `/columns` slash command (LayoutPlugin) — same.
- [ ] Actions toolbar at the bottom of the editor (clear, save,
      etc.) renders with `UI.Button` skin.
- [ ] After all five files migrate:
      `grep -rln "from '../../ui/\\(Button\\|Select\\|TextInput\\)'" src/dms/packages/dms/src/ui/components/lexical/editor/`
      returns nothing.
- [ ] `lexical/editor/ui/{Button,Select,TextInput}.tsx` can be
      deleted; build still passes.

## References

- Done worked example: `tasks/completed/lexical-button-theme-integration.md`
- The recipe in `ButtonPlugin/index.tsx#InsertButtonDialog` is the
  canonical template to copy.
- Skill: `src/dms/skills/translating-design-system-to-dms-theme.md` §3.1.4

## Outcome

All five files migrated and now pull `UI.{Input, Button, Select,
Switch, DialogActions}` from `ThemeContext`. Two follow-ups landed
together as part of the same session:

- **`UI.Select`** — a thin wrapper around `UI.MultiSelect` with
  `singleSelectOnly` hardcoded. Removes the boilerplate that the
  five migrated dialogs would otherwise have to repeat at every
  single-value dropdown call site.
- **`UI.DialogActions`** — the dialog action-bar wrapper, lifted
  out of `lexical/editor/ui/Dialog.tsx`. Tessera aliases its
  `wrapper` to `modal.footer` so action bars match the modal's
  bottom-rule treatment.

### Files deleted

- `lexical/editor/ui/Button.tsx` (zero consumers).
- `lexical/editor/ui/Select.tsx` (zero consumers).
- `lexical/editor/ui/Dialog.tsx` (zero consumers after the
  DialogActions follow-up).

### Files left in place (out of original scope)

- `lexical/editor/ui/TextInput.tsx` — still imported by
  `lexical/editor/ui/ColorPicker.tsx`, which is consumed by
  `ToolbarPlugin` / `FloatingTextFormatToolbarPlugin` via
  `DropdownColorPicker`. ColorPicker has its own tight popup
  layout that the brand `UI.Input` would disrupt, so the cleanup
  was descoped from this task. A future "color-picker UI
  migration" task can finish the orphan trio.
