# UI consolidation — drop `@headlessui/react` from the UI kit, fold duplicates

## Status: COMPLETE — 2026-05-14

**Outcome:** `ui/components/` is 100% free of `@headlessui/react`. The UI kit is fully consolidated: every primitive is themed, click-only, focus-via-`focus-visible`. Heavy duplication (Listbox/Select/ComboBox/Menu/Dropdown/Popover) collapsed into `MultiSelect`/`NavigableMenu`/`Popup`. Dialog family rewritten on a shared `useModalOverlay` hook + `createPortal`. Tabs uses native ARIA semantics.

**Scope split:** the `@headlessui/react` package is **not yet uninstalled** because 22 files outside `ui/` (mostly `patterns/mapeditor/` and `patterns/page/.../map_dama/`) still import from it. That migration was deferred to a separate task — see `mapeditor-migrate-off-headlessui.md` — since it's substantial work that needs per-file audit and visual testing.

### Phase 4 — what shipped (2026-05-14)

- **`Tabs.jsx`** rewritten without Headless. Plain `<button role="tab" aria-selected>` triggers, single panel rendered at a time, controlled-or-uncontrolled `selectedIndex` API preserved. No arrow-key nav (accepted per perf/a11y tradeoff). Theme rewrites: `data-[selected]:` → `aria-selected:`, `data-[hover]:` → `hover:`, `data-[focus]:` → `focus-visible:` across both default styles. Both call sites unchanged in API surface.

### Phase 3 — what shipped (2026-05-14)

Built a pragmatic Dialog primitive and rewrote the four-file family without Headless.

- **`useModalOverlay.js`** (new) — small internal hook with the shared modal plumbing: close on Escape, body scroll lock, cleanup on unmount. Deliberately no focus trap (per user directive). Earns a hook because the cleanup logic is real work, not a thin wrapper.
- **`Dialog.jsx`** — rewritten with `createPortal` + `useModalOverlay`. Renders backdrop + portaled panel, click-outside-to-close via container `onClick` with stopPropagation on the panel, `role="dialog" aria-modal="true"`. No entrance/exit animations (acceptable per perf/a11y stance — `data-[closed]`/`data-[enter]`/`data-[leave]` selectors stripped from `Dialog.theme.jsx` since they had nothing to attach to).
- **`Modal.jsx`** — same pattern. Centered panel with bottom-aligned on mobile. Same close/scroll-lock behavior via the shared hook.
- **`Drawer.jsx`** — same pattern, side-slide variant. Slide-in transition preserved via a `slidIn` state that flips on next-frame via `requestAnimationFrame` (CSS `transition-transform duration-500`). No exit animation — panel unmounts immediately on close.
- **`DeleteModal.jsx`** — `<DialogTitle as="h3">` → semantic `<h3>`. Otherwise unchanged; wraps Modal so it gets Escape/scroll-lock transitively.

Headless consumer count in `ui/`: 5 → 0.

### `ui/` is Headless-free — full migration log

Phases 0-4 collectively removed all `@headlessui/react` imports from `ui/components/`. Final state:

- **Phase 0**: deleted `SideNavContainer`, stray `components/index.jsx`, dropped unused Headless imports from `List` and `ButtonSelect`, removed `UI.ColorPickerFlat` registry entry. 14 → 11.
- **Phase 1**: `Popover` deleted (zero callers), `Menu` → `NavigableMenu` (3 sites), `Dropdown` → `NavigableMenu` (4 sites), `Permissions` moved to `patterns/admin/components/`. 11 → 9.
- **Phase 2**: native HTML for `Button`, `Input`, `Textarea`, `FieldSet`. Theme `data-[*]:` → native pseudos. 9 → 5.
- **Phase 3**: in-house `Dialog`/`Modal`/`Drawer`/`DeleteModal` via `createPortal` + shared `useModalOverlay` hook. 5 → 1.
- **Phase 4**: native `Tabs` with `aria-selected` styling. 1 → 0.

### Phase 5 — blocked on the "hidden Headless front"

`grep -rl "@headlessui/react" packages/dms/src` returns **22 files** outside `ui/`. The package cannot be removed from `package.json` until these migrate. Surface breakdown:

- **17 files in `patterns/mapeditor/MapEditor/`** — Menu/Transition/Tab/Dialog/Popover/Switch usage in LayerPanel, LegendPanel, MapViewerLegend, Controls, StyleEditor, ControlWrappers, plugin wrappers, symbology controls, etc.
- **5 files in `patterns/page/components/`** — 3 in `map_dama/` (a sibling of mapeditor), plus `search/index.jsx` and `section_components.jsx` (uses lowercase `Combobox`).

Partial Phase 5 progress in this session: 3 Switch-only files migrated to `UI.Switch` (`DynamicFilterBuilder.jsx` dead import removed; `PluginControls.jsx` + `CategoryControl/index.jsx` JSX migrated to UI.Switch API via ThemeContext). 25 → 22.

**Recommended next step**: dedicate a follow-up task ("Phase 5 — migrate mapeditor off Headless") with a per-file audit, since these files use Menu/Tab/Dialog in custom ways and rewriting them at scale needs visual testing.

### Phase 2 — what shipped (2026-05-14)

### Phase 2 — what shipped (2026-05-14)

Replaced thin Headless wrappers in 4 files with native HTML. These wrappers did zero real a11y work — they only emitted `data-hover` / `data-focus` / `data-disabled` / `data-invalid` attributes for Tailwind variants to hook into. Switched to native CSS pseudo-classes throughout.

- **`Button.jsx`**: `<Button>` from Headless → `<button type="button">`. Theme rewrites: `data-[hover]:` → `hover:`, `data-[focus]:` → `focus-visible:` (preserves keyboard-only focus ring), `data-[disabled]:` → `disabled:`, `data-[active]:` → `active:`, `data-[open]:bg-gray-700` dropped (leftover from Menu.Button era), `forced-colors:data-[hover]:` → `forced-colors:hover:`. Both 'default Buttons' and 'plain' styles rewritten.
- **`Input.jsx`** (file exports `Input`, `Textarea`, `ConfirmInput`): all three `<Headless.Input>` / `<Headless.Textarea>` → native `<input>` / `<textarea>`. Disabled prop now passed natively. Theme rewrites in `Input.theme.js`: `data-[hover]:` → `hover:`, `data-[invalid]:` → `aria-invalid:`, `data-[disabled]:` → `disabled:`, `has-[[data-disabled]]:` → `has-[:disabled]:`, `has-[[data-invalid]]:` → `has-[[aria-invalid=true]]:`. Mixed-syntax variants (`data-hover:` without brackets, Tailwind 4 form) also normalized in the textarea style.
- **`Textarea.jsx`** (standalone): same treatment. Inline theme rewrites match Input.theme.js. `disabled` prop now passed natively to `<textarea>`.
- **`FieldSet.jsx`**: `<Fieldset>` → native `<fieldset>`, `<Field>` → plain `<div>` with `React.useId()` for label-input wiring, `<Label>` → `<label htmlFor={inputId}>`, `<Description>` → `<p>`. The inputId is threaded onto the first valid-element child via `React.cloneElement` (guards against overwriting an existing `id` prop). This preserves click-to-focus on labels; the lost behavior is Headless's auto-wired `aria-describedby` (description not announced by screen readers). Per the accepted perf/a11y tradeoff. Theme: dropped `data-[disabled]:opacity-50` on label/description (Headless was setting `data-disabled` on the wrapper; without that, would need `has-[:disabled]` sibling-aware selectors which Tailwind handles awkwardly).

**Headless consumer count: 9 → 5.** All four targeted files no longer touch Headless. Remaining 5 are all Phase 3/4 work: `Dialog`, `Modal`, `Drawer`, `DeleteModal` (Phase 3), and `Tabs` (Phase 4).



### Phase 1 — what shipped (2026-05-14)

- **Popover deleted.** The audit revealed `UI.Popover` had **zero callers** — every `<Popover>` JSX in the codebase was direct Headless imports inside mapeditor (the "hidden Headless front" — left for a later phase). Removed: `Popover.jsx`, `Popover.theme.js`, `UI.Popover`, `popoverTheme` registration in `defaultTheme.js`, `docs.Popover`, the `Popover` entry in both compOptions lists.
- **Menu → NavigableMenu.** One live call site (`pagesPane.jsx:103`, the page-actions menu). Second `<Menu>` in same file was inside a comment block. Destructure cleanup in `settingsPane.jsx`. The dead `Menu` destructures in `view.jsx` and `edit/index.jsx` (from `CMSContext`, never set there) left untouched. Removed: `Menu.jsx`, `Menu.theme.jsx`, `UI.Menu`, `menuTheme` registration, `docs.Menu`, `Menu` from compOptions.
- **Dropdown → NavigableMenu.** Four call sites migrated: `mapeditor/SourceLayout.jsx` x2 (Data Manager nav dropdowns, rewritten as `{type:'link'}` config items), `admin/components/menu.jsx` and `auth/components/menu.jsx` (user menus, header rendered via `{type: () => <jsx/>}` + spread of `{type:'link'}` items for the auth menu). The dead local `Item` and `Permissions/Item` helpers in those files also removed. Removed: `Dropdown.jsx`, `UI.Dropdown`, `docs.Dropdown`, `Dropdown` from compOptions.
- **Permissions moved to `patterns/admin/components/Permissions.jsx`.** One caller (`permissionsEditor.jsx`) — switched to a direct import from the new location. Took the opportunity to refactor Permissions to consume UI primitives via `ThemeContext` (was importing `MultiSelect`/`Button`/`Pill`/`ColumnTypes` directly from `ui/components/`, which the DMS CLAUDE.md flags as an anti-pattern for non-primitives). Removed: `UI.Permissions`.
- **Visual regressions accepted.** Per the user's no-className-passthrough directive: SourceLayout Dropdown migrations dropped bespoke `bg-blue-500 text-white hover:translate-x-2` styling; user-menu Dropdown migrations dropped bespoke `bg-white shadow-md` panel styling. Both will render with NavigableMenu's default theme. Site authors can recover the lost looks via `activeStyle` / named theme styles on `theme.navigableMenu.styles[]`, not via per-call-site className overrides.

**ColorPicker / ColorPickerFlat left as-is** (deferred to a future task — needs a real visual merge decision and isn't blocking the Headless removal).

**Headless consumer count: 11 → 9** (Popover and Menu deleted).

### Phase 0 — what shipped (2026-05-14)

### Phase 0 — what shipped (2026-05-14)

- `ui/components/SideNavContainer.jsx` deleted. Dead destructure removed from `patterns/page/pages/formatManager.jsx`. `UI.SideNavContainer` dropped from `ui/index.js`.
- `ui/components/index.jsx` (stray second copy of `Dialog`, no importers) deleted.
- Unused `import * as Headless from '@headlessui/react'` lines removed from `ui/components/List.jsx` and `ui/components/ButtonSelect.jsx`. No behavior change — the imports were dead.
- `UI.ColorPickerFlat` registry entry removed from `ui/index.js`. **The actual `ColorPickerFlat` named export is intact** — `ui/components/navigableMenu/index.jsx` imports it directly from `../Colorpicker`. The deeper visual-level merge (`ColorPicker` and `ColorPickerFlat` are visually distinct components: CSS-modules popup vs Tailwind inline; not the same component with a flag) is deferred to Phase 1.

**Headless consumer count: 14 → 11** (dropped `List`, `ButtonSelect`, stray `components/index.jsx`). Phase 0 did not touch real Headless wrappers — those are Phases 2-4.

> **Note discovered during Phase 1**: there is a separate "hidden Headless front" — 13 files in `patterns/mapeditor/...` and `patterns/page/.../map_dama/...` import `Menu, Transition, Tab, Dialog` directly from `@headlessui/react`, bypassing `UI` entirely. These weren't on the original audit and are a separate concern from the `ui/components/` Headless count. Worth a dedicated phase later (e.g. Phase 5.5) to migrate or refactor those files alongside the dependency removal.

## Original spec (preserved below)

## Status: PENDING — created 2026-05-14

## Objective

Consolidate the `ui/components/` directory and remove the `@headlessui/react`
dependency. Today 14 files in `ui/components/` import from Headless. The user
finds Headless's runtime perf "quite bad" and has explicitly opted into
sacrificing some accessibility for better perf, so the target is a pragmatic
in-house replacement (escape + click-outside + scroll lock for dialogs,
click-only tabs, plain `:hover`/`:focus`/`:disabled` selectors for inputs) —
**not** a like-for-like swap to `react-aria` or `radix`.

Along the way: delete primitives that aren't actually used, fold thin wrappers
back into their one caller, and merge the dialog and menu families that have
drifted into 3–5 near-duplicate components each.

## Audit (snapshot, 2026-05-14)

### Headless consumers in `ui/components/`

| File | Headless surface | Real work Headless is doing |
|---|---|---|
| `Button.jsx` | `Button` | data-attrs only (`data-hover`, `data-focus`, `data-disabled`) |
| `Input.jsx` | `Headless.Input` | data-attrs only |
| `Textarea.jsx` | `Headless.Textarea` | data-attrs only |
| `List.jsx` | `* as Headless` | **import is unused** (file uses plain `<div>`) |
| `ButtonSelect.jsx` | `* as Headless` | **import is unused** (file uses only the local `Button`) |
| `Menu.jsx` | `MenuSeparator` | a styled `<hr>` |
| `FieldSet.jsx` | `Field, Fieldset, Label, Description` | semantic wrappers + auto id-association |
| `DeleteModal.jsx` | `DialogTitle` | a styled `<h2>` for `aria-labelledby` |
| `Popover.jsx` | `Popover, Transition, Button` | open-state, click-outside, animation |
| `Tabs.jsx` | `Tab, TabGroup, TabList, TabPanel, TabPanels` | arrow-key nav, focus, aria-tabs |
| `Dialog.jsx` | `* as Headless` | focus trap, scroll lock, escape, aria-modal |
| `Modal.jsx` | `Transition, Dialog, DialogPanel` | dialog + animations (built on `Dialog`) |
| `Drawer.jsx` | `Dialog, Transition` | dialog + slide animation (built on `Dialog`) |
| `components/index.jsx` | `* as Headless` | **dead code** — stray second copy of `Dialog`; no consumers |

### Component-usage tiers (from JSX counts across `packages/dms/src`)

| Tier | Components |
|---|---|
| Heavy (10+ files) | Icon, Button, Menu, Pill, Input, MultiSelect, Modal, FieldSet, Switch, Layout, Dialog, Table, Popup, LayoutGroup |
| Light (≤3 files) | Pagination, NavigableMenu, Label, Dropdown, SideNav, Permissions, DraggableList, TopNav, Textarea, Tabs, ColorPicker, Popover |
| Single site | Graph, Drawer, DraggableNav, DraggableMenu, ColorPickerFlat, Card, ButtonSelect, AvlGraph |
| **Zero JSX** | **SideNavContainer** (1 dead destructure), **Logo** (used only as a `{type:'Logo'}` widget token) |

### Duplication clusters

- **Dialog family**: `Dialog.jsx`, `Modal.jsx`, `Drawer.jsx`, `DeleteModal.jsx`,
  plus the stray `components/index.jsx` (another Dialog). 5 files, 1 idea.
- **Menu/popover family**: `Menu`, `Dropdown`, `NavigableMenu`, `Popup`
  (in-house, no Headless), `Popover` (Headless, 2 sites only). Should collapse
  toward 1 floating-content primitive + thin variants — likely converging on
  `Popup` since it already escapes the Headless dependency.
- **ColorPicker**: `ColorPicker` and `ColorPickerFlat` are two exports of the
  same file (`Colorpicker.jsx`), both registered in `UI`. Trivially merge.

### Domain leak

- **Permissions.jsx** lives in `ui/components/` but is an auth-domain feature
  (user/group access controls UI). 3 callers, all in `patterns/admin/...`. Not
  a primitive — should move under `patterns/auth/...` or stay if there's
  cross-pattern reuse coming.

## Phases

The order goes easy → hard. Each phase ships independently. Within a phase,
work file-by-file with a visual diff between commits.

### Phase 0 — Free wins, no Headless impact

These cost nothing and shrink the surface for later phases.

1. **Delete `SideNavContainer.jsx`** — 0 JSX usage; 1 dead destructure in
   `formatManager.jsx`. Drop the export from `ui/index.js` and remove the
   destructure.
2. **Drop unused `Headless` import from `List.jsx`** — file imports `* as
   Headless` but never references it.
3. **Drop unused `Headless` import from `ButtonSelect.jsx`** — file imports `*
   as Headless` but never references it.
4. **Delete `ui/components/index.jsx`** — stray second copy of `Dialog`,
   imported nowhere. (Verified: all `from './components'` matches resolve to
   nested subdirectories, not this file.)
5. **Merge `ColorPickerFlat` into `ColorPicker`** — keep one export with a
   `flat` prop. Both registered in `UI` today; the merged version stays under
   `UI.ColorPicker`, callers pass `flat`.

**Exit:** `grep "@headlessui/react"` count drops by ~2 files; UI registry
shrinks by 2 entries.

### Phase 1 — Consolidate duplicate clusters (no Headless yet)

Pre-work for Phases 3 & 4: collapse the duplication so we have fewer surfaces
to rewrite. Locked-in plan after audit:

1. **Fold `Popover` into `Popup`** — `Popup` is strictly more capable; `Popover`
   only adds a fade/slide transition + decorative triangle. 2 caller sites.
   Drops 1 Headless consumer.
2. **Fold `Menu` into `NavigableMenu`** — NavigableMenu is already built on
   `<Popup>` (line 307 of `navigableMenu/index.jsx`) and supports flat action
   items by default (plain `{name, onClick}` items render as a click-handler
   row when no `type` is set). Three UI.Menu call sites
   (`pagesPane.jsx` x2, `sectionGroupsPane.jsx`); each becomes
   `<NavigableMenu config={items} showTitle={false}>{trigger}</NavigableMenu>`.
   Drops 1 Headless consumer (Menu uses `MenuSeparator`).
3. **Fold `Dropdown` into `NavigableMenu`** — NavigableMenu supports arbitrary
   JSX panels via `{type: () => <jsx/>}` items. 4 caller sites
   (`mapeditor/SourceLayout.jsx` x2, `admin/components/menu.jsx`,
   `auth/components/menu.jsx`). Two sub-patterns: SourceLayout dropdowns are
   lists of nav links → rewrite as `{type:'link'}` config items;
   admin/auth user menus mix a header + action items → use `type: () => ...`
   for the header.
4. **Move `Permissions.jsx` → `patterns/admin/components/Permissions.jsx`** —
   267 lines, one caller (`patterns/admin/pages/patternEditor/default/permissionsEditor.jsx`),
   auth/access-control feature not a primitive. Drop `UI.Permissions` registry
   entry.

**No className passthrough on NavigableMenu.** Call sites that currently pass
bespoke `className` to `<Menu>` or `<Dropdown>` (e.g. `className={``}` on user
menus, `className='text-gray-800 group z-50'` on SourceLayout dropdowns) must
solve their styling needs via `activeStyle` / named theme styles, not by
widening the primitive's API. Short-term visual regressions are acceptable;
preserving the theme as the single source of truth is the priority. Wrap the
primitive in a plain `<div className="...">` at the call site if needed for
purely positional tweaks.

**Leave `ColorPicker` / `ColorPickerFlat` alone.** Visual-merge deferred to a
future task; doesn't block the Headless removal.

**Exit:** `ui/components/` drops by ~6 files (Menu, Menu.theme, Dropdown,
Popover, Popover.theme, Permissions). `UI` registry drops 4 entries (Menu,
Dropdown, Popover, Permissions). Headless consumer count: 11 → 9.

### Phase 2 — Replace thin Headless wrappers with native HTML

The `Headless.Input`, `Headless.Textarea`, `Headless.Button` wrappers don't
provide accessibility — they only emit `data-hover` / `data-focus` /
`data-disabled` attributes for Tailwind's `data-[hover]:` variants. Browsers
already give us `:hover`, `:focus`, `:disabled`. The Headless layer is
overhead for zero a11y gain.

1. **`Button.jsx`** — `<Headless.Button>` → `<button>`. Theme: rewrite
   `data-[hover]:bg-X` → `hover:bg-X`, `data-[disabled]:opacity-50` →
   `disabled:opacity-50`.
2. **`Input.jsx`** + the `Textarea` / `ConfirmInput` exports in it → plain
   `<input>` / `<textarea>`. Same theme rewrite.
3. **`Textarea.jsx`** (separate file) → plain `<textarea>`.
4. **`Menu.jsx`** — replace `<MenuSeparator>` with `<hr>` or `<div
   role="separator">`.
5. **`FieldSet.jsx`** — replace `Field` / `Fieldset` / `Label` / `Description`
   with `<fieldset>` / native `<label htmlFor>` and a manual `useId()` for
   association. Headless's auto-id is convenient but cheap to reimplement.

**Exit:** 5 files no longer touch Headless. Tailwind theme files in
`*.theme.{js,jsx}` get a sed pass: `data-[hover]:` → `hover:`, etc.

### Phase 3 — Build a pragmatic Dialog primitive without Headless, consolidate the family

Single new primitive: `Dialog.jsx`, in-house. Behavior:

- Renders a fixed-position backdrop + a portaled panel (`createPortal` to
  `document.body`).
- Closes on `Escape` (document-level keydown).
- Closes on backdrop click (click-outside on the panel ref).
- Locks body scroll while open (`document.body.style.overflow = 'hidden'`
  with cleanup).
- Sets `aria-modal="true"` and `role="dialog"` on the panel. **Skips full focus
  trap** — the user has accepted this tradeoff. (If a single high-stakes
  surface like delete confirmation later needs trapped focus, add it locally.)
- Animation: a simple CSS transition on a `[data-open]` attribute is
  sufficient.

Then refactor the family onto it:

1. **`Modal.jsx`** → thin variant of the new `Dialog` (centered panel,
   responsive sizes).
2. **`Drawer.jsx`** → variant with `position: 'right' | 'left'` and a slide
   transform instead of fade/scale.
3. **`DeleteModal.jsx`** → either keep as a sugared variant
   (`<Modal kind="confirm">`) or fold into a generic `<ConfirmModal>` shared
   primitive. `<DialogTitle>` becomes a semantic `<h2>` referenced by
   `aria-labelledby`.

**Exit:** Headless's `Dialog`, `Transition`, `DialogPanel`, `DialogTitle` all
gone. 4 files no longer touch Headless.

### Phase 4 — Build a pragmatic Tabs without Headless

Headless's `Tab` family gives you arrow-key nav + ARIA. Click-only is fine per
the perf/a11y tradeoff. 2 call sites total.

1. Rewrite `Tabs.jsx` as a controlled-or-uncontrolled component:
   `<TabsContainer>` holds index state, renders a `<TabList>` of `<button>`s
   and the matching `<TabPanel>`. ARIA: `role="tablist"`, `role="tab"`,
   `role="tabpanel"`, `aria-selected`.
2. Skip arrow-key handling unless we find a real ergonomic problem.

**Exit:** Tabs.jsx no longer touches Headless.

### Phase 5 — Final sweep + remove the dependency

1. `grep -rn "@headlessui/react" packages/dms` should return 0.
2. Remove `@headlessui/react` from `packages/dms/package.json`.
3. `npm install`; verify dev server boots and golden screens render
   (dialogs, drawers, menus, inputs, tabs, multiselect).
4. Visual smoke against the heaviest-usage screens: edit pane, theme editor,
   admin pattern list, permissions editor, the delete-confirmation flow.

## Backwards compatibility

- `Phase 0` deletions: `UI.SideNavContainer`, `UI.ColorPickerFlat` go away.
  `SideNavContainer` is dead. `ColorPickerFlat` callers (2) move to
  `<UI.ColorPicker flat />`.
- `Phase 1`: `UI.Popover` (2 callers) is folded into `UI.Popup`. `UI.Dropdown`
  / `UI.NavigableMenu` may be folded into `UI.Menu` depending on the audit.
- `Phase 2-4`: pure internals. Public component APIs (`<Button>`,
  `<Input>`, `<Modal>`, `<Tabs>`, etc.) keep the same prop shapes. Themes may
  need a sed pass for `data-[hover]:` → `hover:` etc.
- `Phase 5`: removing the npm dep is the final commit.

## Files (per phase)

### Phase 0
- `ui/components/SideNavContainer.jsx` — delete
- `ui/components/index.jsx` — delete
- `ui/components/List.jsx` — drop unused Headless import
- `ui/components/ButtonSelect.jsx` — drop unused Headless import
- `ui/components/Colorpicker.jsx` — merge `ColorPickerFlat` into `ColorPicker`
- `ui/index.js` — drop `SideNavContainer`, `ColorPickerFlat` exports
- `patterns/page/pages/formatManager.jsx` — drop `SideNavContainer` destructure
- 2 sites currently calling `<ColorPickerFlat>` → `<ColorPicker flat />`

### Phase 1
- `ui/components/Popup.jsx` — absorb `Popover`'s features
- `ui/components/Popover.jsx` — delete (after 2 sites migrated)
- `ui/components/Menu.jsx`, `Dropdown.jsx`, `navigableMenu/` — audit + collapse
- `ui/index.js`, `ui/defaultTheme.js`, `ui/docs.js`, `ui/themeSettings.js` — drop deleted entries
- `ui/components/Permissions.jsx` → `patterns/auth/components/Permissions.jsx`
- `ui/index.js` — drop `Permissions`; affected sites import from auth pattern

### Phase 2
- `ui/components/Button.jsx`, `Button.theme.jsx`
- `ui/components/Input.jsx`, `Input.theme.js`
- `ui/components/Textarea.jsx`
- `ui/components/Menu.jsx`
- `ui/components/FieldSet.jsx`, `FieldSet.theme.js`
- Tailwind theme files broadly: `data-[hover]:` → `hover:`, `data-[disabled]:`
  → `disabled:`, `data-[focus]:` → `focus:` where the data-attr was only
  there to satisfy Headless

### Phase 3
- `ui/components/Dialog.jsx` — rewrite as the in-house primitive
- `ui/components/Modal.jsx` — refactor onto new Dialog
- `ui/components/Drawer.jsx` — refactor onto new Dialog
- `ui/components/DeleteModal.jsx` — refactor onto new Dialog (or fold into Modal)

### Phase 4
- `ui/components/Tabs.jsx`, `Tabs.theme.js`

### Phase 5
- `packages/dms/package.json` — remove `@headlessui/react`

## Testing checklist (per phase)

**Phase 0:**
- [ ] No broken imports. `npm start` boots clean.
- [ ] `<UI.ColorPicker flat />` renders identically to the old `<ColorPickerFlat />`.

**Phase 1:**
- [ ] Each folded primitive's call sites render unchanged (visual diff).
- [ ] Permissions editor screen still works after the move.

**Phase 2:**
- [ ] Inputs / textareas / buttons render visually unchanged.
- [ ] Hover, focus, disabled states all visible.
- [ ] Invalid state still shown on inputs (`:invalid` or a `data-invalid` attr we set ourselves).

**Phase 3:**
- [ ] Modal opens/closes via Escape and backdrop click.
- [ ] Body scroll locks while open, unlocks on close.
- [ ] Delete-confirmation flow still works end-to-end.
- [ ] Drawer slides in from the correct edge.
- [ ] No layout shift when modal opens (scrollbar accounting).

**Phase 4:**
- [ ] Clicking a tab changes the panel.
- [ ] Selected tab visibly highlighted.
- [ ] Controlled mode (with `selectedIndex` / `setSelectedIndex`) still works.

**Phase 5:**
- [ ] `grep -rn "@headlessui/react" packages/dms` returns 0.
- [ ] Dep removed from `package.json`.
- [ ] Production build succeeds.
- [ ] Bundle size shrinks (sanity check).

## Open questions

- **Permissions move target** — confirm `patterns/auth/components/` is the
  right home before the move. Could also be `patterns/admin/` since the only
  callers are admin pages.
- **Menu vs Dropdown vs NavigableMenu** — the Phase 1 audit needs to look at
  each component's actual behavior before deciding which collapse. Possible
  outcome: Menu and Dropdown are mergeable; NavigableMenu stays because
  recursive nav is its own beast.
- **Confirm-flow focus trap** — do we want trapped focus on the
  delete-confirmation modal specifically? The default is no (per the perf/a11y
  tradeoff), but it's a candidate for a per-surface opt-in.
