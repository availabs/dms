# Selection components consolidation — Multiselect as the canonical primitive

## Status: COMPLETE — 2026-05-14 (Phases 0-3 done)

### Phase 1-3 — what shipped (2026-05-14)

- **Phase 1**: `ui/components/Listbox.jsx` and `Listbox.theme.js` deleted. `UI.Listbox` removed from `ui/index.js`. The two `<Listbox/>` fallback usages in `gis_dataset/pages/Map/Layer2.jsx` rewritten as plain `<Select>` (later migrated again in Phase 3 to `<UI.MultiSelect>`).
- **Phase 2**: Component moved from `ui/columnTypes/multiselect.{jsx,theme.js}` to `ui/components/MultiSelect.{jsx,theme.js}` (canonical UI primitive lives in `ui/components/`; the column-type Edit/View wrappers in `columnTypes/index.jsx` re-import from the new location). `UI.MultiSelect` exported. Back-compat aliases `MultiselectEdit`/`MultiselectView` kept so external code keeps working. Added `searchable` and `display` props. Added portal-based menu rendering for compact mode (escapes ancestor `transform` stacking contexts). Search filter now falls back to option `value` when the label is a React element.
- **Phase 3**: Every `Select` and `ComboBox` call site migrated to `UI.MultiSelect`:
  - 30 FieldSet `type: 'Select'` configs across 17 theme/jsx files → `type: 'MultiSelect', singleSelectOnly: true, searchable: false`
  - 17 direct `<Select>` JSX usages across 10 files migrated
  - Both ControlRenderer default-onChange handlers (in `themes/editTheme.jsx` and `patternEditor/default/themeEditor.jsx`) updated to accept both event/value shapes (`e?.target?.value ?? e`)
  - 1 `<ComboBox>` JSX usage in `SymbologySelector.jsx` migrated
  - `ui/components/Select.jsx`, `ui/components/ComboBox.jsx`, and the unused `ui/columnTypes/select.jsx` deleted
  - `UI.Select` and `UI.ComboBox` removed from `ui/index.js`
  - `Select` removed from FieldSet componentRegistry
  - `selectTheme` registration removed from `ui/defaultTheme.js`
  - `Select` swapped for `MultiSelect` in `ui/docs.js` and in the `compOptions` lists of both theme editors. Added basic `docs` export to `MultiSelect.theme.js`.

### Phase 0 — what shipped

- `ui/columnTypes/multiselect.theme.js` (new) — extracted from inline `theme` const in the component body; Catalyst-aligned defaults (`zinc`/`blue-500` tokens, inset `border-zinc-950/10`, `focus-within:ring-blue-500`, dark mode, Catalyst spacing `calc(theme(spacing.X)-1px)` ramp). Structured as `{ options: { activeStyle: 0 }, styles: [{ name: 'default', ... }] }` so `getComponentTheme` honors `activeStyle`. Hex colors (`#C5D7E0`, `#37576B`) and FontAwesome (`fa fa-xmark`) all gone.
- `ui/columnTypes/multiselect.jsx` — wired to `ThemeContext` (it wasn't before — site themes' `multiselect:` overrides were silently ignored). Accepts `activeStyle` prop. All three icons now go through `UI.Icon` (`ArrowDown` for the trigger chevron, `XMark` for the chip remove button, `CircleCheck` for selected-option indicator); inline SVG components deleted. Caret is now absolute-positioned on the right edge (Catalyst pattern) instead of a flex child with `ml-auto`. Trigger padding bumped to Catalyst values (`py-2.5 sm:py-1.5`, `min-h-11 sm:min-h-9`). Search input matches Catalyst Input ramp.
- `ui/defaultTheme.js` — registered `multiselect` alongside `select`/`listbox`.
- DMS `packages/dms/CLAUDE.md` — added a new section forbidding 1–2 line convenience wrappers around load-bearing APIs (theme reads, etc.) so the canonical inline pattern stays visible to new contributors.

Verified no existing site theme (`transportny`, `dms-template`) carries a `multiselect:` override block, so wiring `ThemeContext` doesn't surprise any downstream theme.

## Original task spec (preserved below)

## Status: PENDING — created 2026-05-14

## Objective

Collapse the four selection components currently in the DMS UI kit — `Select`, `Listbox`, `ComboBox`, and `ColumnTypes.multiselect` — into a single primitive (`UI.MultiSelect`) with feature flags. `multiselect` is already the most feature-complete (array values, search/tokens, three display modes, `singleSelectOnly` mode) but it ships with the weakest default theme of the four. Bring its design to parity first, then consolidate around it.

## Audit (snapshot, 2026-05-14)

| Component | Files | JSX tags | Where it's used |
|---|---|---|---|
| `Select` | 22 | 39 | Static enum dropdowns: filter operations, theme/admin pickers, icon/visibility selectors, PDF export options, metadata enum fields. |
| `Listbox` | 2 | 2 | GIS dataset map legend only, behind defensive `UI.Listbox ? <Listbox/> : <select/>` fallback. Essentially unused. |
| `ComboBox` | 1 | 2 | Map symbology / layer searchable picker (`SymbologySelector.jsx`). Replaces the old `react-bootstrap-typeahead`-based `FilterableSearch`. |
| `ColumnTypes.multiselect` | 19 | 73+ | The workhorse: filter value editors (`ConditionValueInput`, `RenderFilterValueSelector`), column-type cells everywhere (Card, Spreadsheet, Table), permissions UI, dataset metadata fields, upload column-type mapping. Already supports `singleSelectOnly: true` (used in `TableHeaderCell.jsx`). |

## Why consolidate

- Four ways to render a dropdown means four sets of themes, four behavioral edge cases, four migration paths every time we touch UI.
- `multiselect` already covers every capability the others have, including single-select (`singleSelectOnly: true`) and search (built-in input).
- The other three are heavily skewed toward narrow use cases — `Select` is mostly 3–8-option static enums, `ComboBox` is one file, `Listbox` is essentially dead code.

## Phases

### Phase 0 — bring multiselect's default theme up to par (prerequisite)

The most-used selection component currently ships the **worst** default styling of the four. This blocks consolidation: migrating `Select`/`ComboBox` call sites onto multiselect today would visually regress every screen that uses a dropdown.

**Current state** (`ui/columnTypes/multiselect.jsx:13-34` — inlined in the component file, not a `.theme.js` sibling):

```js
inputWrapper:    'flex px-2 py-1 w-full text-sm font-light border focus:border-blue-300 rounded-md bg-white hover:bg-blue-100 transition ease-in overflow-x-auto scrollbar-sm',
tokenWrapper:    'w-fit flex m-0.5 px-2 py-1 mx-1 bg-[#C5D7E0] text-[#37576B] hover:bg-[#E0EBF0] rounded-full transition ease-in whitespace-nowrap',
menuWrapper:     'p-2 bg-white min-w-[100px] shadow-lg rounded-lg',
menuItem:        'flex gap-0.5 px-2 py-1 text-sm hover:bg-blue-300 hover:cursor-pointer transition ease-in rounded-full',
removeIcon:      'fa fa-xmark px-1 text-xs text-red-500 hover:text-red-600 self-center cursor-pointer transition ease-in',
selectedValueIconName: 'CircleCheck',
selectedValueIcon: 'size-4'
// + alwaysOpenMenuWrapper, tabularMenuWrapper, smartMenuWrapper, smartMenuItem, optionsWrapper, error
```

**Gap vs `Select`** (`ui/components/Select.jsx:selectTheme` — Catalyst-style):

- Inset border ring system (`before:absolute before:inset-px before:rounded`, `after:ring-inset`, focus `after:ring-blue-500`)
- Catalyst spacing tokens (`calc(theme(spacing[2.5])-1px)`, `sm:` responsive padding ramp)
- Dark mode support (`dark:before:hidden`, etc.)
- Disabled state styling (`has-[[data-disabled]]:opacity-50`)

**Gap vs `ComboBox`** (`ui/components/ComboBox.jsx` — inline, not theme-driven):

- Subtle `ring-zinc-950/5` border (vs the harder `border` multiselect ships)
- Soft hover/selected states (`data-[focus]:bg-slate-100 data-[selected]:bg-blue-50` — vs multiselect's saturated `hover:bg-blue-300`)
- Clean dropdown shadow + ring (`bg-white rounded-md shadow-lg ring-1 ring-zinc-950/5`)

**Work in Phase 0:**

1. Extract the theme out of the component body into a `multiselect.theme.js` sibling per the DMS `*.theme.{js,jsx}` convention (mirrors `card.theme.jsx`, `Button.theme.jsx`, etc.).
2. Rewrite default class strings to match the Catalyst-style baseline used by `Select` / `ComboBox`:
   - Inset border ring + focus ring (replace the bare `border focus:border-blue-300`).
   - Catalyst spacing (`px-3 py-1.5` family with `sm:` ramp, not `px-2 py-1`).
   - Soft hover/selected (`data-[focus]:bg-slate-100`, `data-[selected]:bg-blue-50` analogues — multiselect's render currently uses `hover:` so we keep that mechanism but tone the colors down).
   - Replace the hex token color (`bg-[#C5D7E0]`) with Tailwind tokens (`bg-slate-200 text-slate-700 hover:bg-slate-300` or similar) so it composes with site themes.
   - Dark mode support (`dark:bg-zinc-900 dark:ring-white/10` etc., parity with Select).
3. Verify all three display modes (compact / `keepMenuOpen` / `tabular`) look reasonable under the new defaults.
4. Sweep the transportny dms_theme `multiselect` override block (if any) — make sure existing overrides still produce the intended look, or update.
5. Quick visual smoke test against the existing 19 call sites: filter inputs in a Card, permissions multiselect, table header column toggle, dataset metadata multiselect field.

**Exit criteria:** A `Select` and a `multiselect` rendered side-by-side at the same width look like siblings, not strangers. Then we move on.

### Phase 1 — delete `Listbox`

- 2 call sites, both in `patterns/datasets/pages/dataTypes/gis_dataset/pages/Map/Layer2.jsx`.
- Both are behind a defensive `UI.Listbox ? <Listbox/> : <select/>` fallback already, so the migration target should be `Select` (which the fallback already implies).
- Remove `Listbox` from `ui/index.js`'s `UI` export, delete `ui/components/Listbox.jsx`, delete the two `<Listbox/>` JSX usages and the fallback wrappers around them.
- Verify GIS map legend still renders identically.

### Phase 2 — surface multiselect as `UI.MultiSelect`

- Rename `MultiselectEdit` → `MultiSelectEdit` (cosmetic — keep the existing named export under the old name too so external themes that reference it don't break; can remove later).
- Add `UI.MultiSelect` to `ui/index.js` pointing at `MultiSelectEdit`. Keep `UI.ColumnTypes.multiselect.EditComp` as the existing alias (column-type registry stays intact).
- Add a `searchable` prop that exposes the existing internal search input cleanly (today it's implicit). Document the props:
  - `value`, `onChange`, `options`, `placeholder`, `disabled`, `className`, `loading`
  - `singleSelectOnly: boolean` — collapse to single-select (used in table headers today)
  - `searchable: boolean` (default `true`) — show the search input
  - `display: 'compact' | 'expanded' | 'tabular'` — the three display modes (replaces the implicit `keepMenuOpen` / `tabular` flag pair, but those keep working)
- No call-site changes yet. Just publishes the surface.

### Phase 3 — migrate `Select` and `ComboBox` call sites to `UI.MultiSelect`

- 22 `Select` files + 1 `ComboBox` file → `UI.MultiSelect`.
- Most `Select` call sites become `<UI.MultiSelect singleSelectOnly searchable={false} options={…} />`.
- The one `ComboBox` site (`SymbologySelector.jsx`) becomes `<UI.MultiSelect singleSelectOnly searchable options={…} />`.
- **Migrate incrementally per-pattern**, not in one PR. Suggested order:
  1. `patterns/page/components/sections/...filters/` (Filter editor — small surface, we just refactored it).
  2. `patterns/page/components/sections/...ComponentRegistry/` (Card / Spreadsheet / Graph config select widgets).
  3. `patterns/admin/...` (theme editor, pattern editor).
  4. `patterns/datasets/...` (metadata field editors, upload column-type mapper).
  5. `patterns/mapeditor/...` + `SymbologySelector` (ComboBox).
  6. Anything left.
- After each pattern: visual diff the affected screens, commit, move on.
- Final step: delete `ui/components/Select.jsx` and `ui/components/ComboBox.jsx`, remove from `UI` registry, remove headless-ui Combobox + Select imports if no longer used elsewhere.

## Backwards compatibility

- `ColumnTypes.multiselect.EditComp` keeps working through every phase. Phase 2 just adds an alias path; column-type-driven cells (Card/Spreadsheet/Table) don't change.
- Phase 0 is purely visual. No data shape changes. Existing themes that override `multiselect` keys keep applying (the keys themselves stay; only the *defaults* shift).
- Phase 1 deletes `Listbox`. Any out-of-tree code referencing `UI.Listbox` breaks at type/runtime — search downstream sites (`transportNY/src/sites/*`, `dms_themes/*`) before deleting.
- Phase 3 deletes `UI.Select` and `UI.ComboBox`. Long tail risk — but every in-tree call site is migrated in the same pass, so the deletion is the last commit.

## Open questions

- **The hex `#C5D7E0` token color** in multiselect's `tokenWrapper` — is this intentional brand color (steel-blue), or just a stale choice? If brand, we keep it (themes will override anyway) but the default should still be a Tailwind token.
- **`tabular` mode**: today it lays options out as a flat row of pill-buttons. Should this stay as `display: 'tabular'`, or be a separate component? Phase 2 keeps it; Phase 0's restyle should make it look at home next to a `Select`.
- **`UI.MultiSelect` vs `UI.Select`**: naming. The user prefers one component → name it `UI.MultiSelect`. The single-select case is then `<UI.MultiSelect singleSelectOnly>`. Reads slightly weird but matches the technical reality.

## Files (phase-by-phase)

### Phase 0
- `src/dms/packages/dms/src/ui/columnTypes/multiselect.jsx` — strip inlined theme, import from sibling
- `src/dms/packages/dms/src/ui/columnTypes/multiselect.theme.js` (new) — Catalyst-style defaults
- `src/dms_themes/transportny/theme.js` — sweep `multiselect` override block (if any) for compatibility

### Phase 1
- `src/dms/packages/dms/src/ui/index.js` — drop `Listbox` export
- `src/dms/packages/dms/src/ui/components/Listbox.jsx` — delete
- `src/dms/packages/dms/src/patterns/datasets/pages/dataTypes/gis_dataset/pages/Map/Layer2.jsx` — rewrite the 2 fallbacks as plain `<Select>`

### Phase 2
- `src/dms/packages/dms/src/ui/columnTypes/multiselect.jsx` — rename internal exports; document props
- `src/dms/packages/dms/src/ui/index.js` — add `MultiSelect` to `UI`

### Phase 3
- ~22 files under `src/dms/packages/dms/src/patterns/` (`Select` callers — exact list at audit time)
- `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/SymbologySelector.jsx` (`ComboBox` caller)
- `src/dms/packages/dms/src/ui/components/Select.jsx` — delete (final commit)
- `src/dms/packages/dms/src/ui/components/ComboBox.jsx` — delete (final commit)

## Testing checklist (per phase)

**Phase 0:**
- [ ] All three display modes render correctly: compact (token pill), expanded (always-open menu), tabular (flat option row).
- [ ] Single-select mode (`singleSelectOnly`, e.g. `TableHeaderCell.jsx`) still picks one value at a time, closes menu on pick.
- [ ] Focus ring renders on tab.
- [ ] Disabled state visible.
- [ ] transportny dms_theme overrides still apply where set.
- [ ] Visual side-by-side: a `multiselect` and a `Select` at the same width look like the same design language.

**Phase 1:**
- [ ] GIS dataset map legend renders identically before/after (range size + legend type selectors).
- [ ] No remaining `UI.Listbox` references in `dms/` or downstream `transportNY/src/`.

**Phase 2:**
- [ ] `UI.MultiSelect` accessible from `ThemeContext`. Renders correctly when mounted directly.
- [ ] `UI.ColumnTypes.multiselect.EditComp` still works — table cells, card cells unchanged.
- [ ] `searchable={false}` hides the search input.

**Phase 3 (per pattern migrated):**
- [ ] Each migrated screen visually unchanged at first glance (same width, same option list, same chosen value).
- [ ] Keyboard nav: tab focuses, arrow keys move within open menu, enter selects, escape closes.
- [ ] Final: `grep -rn "<Select\\b\|<ComboBox\\b" src/dms/packages/dms/src` returns 0 results.
