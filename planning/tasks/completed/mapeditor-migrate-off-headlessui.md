# Migrate mapeditor pattern off `@headlessui/react` onto the UI kit

## Status: COMPLETE — 2026-05-14

### Phase 7 — what shipped (2026-05-14)

Removed `@headlessui/react` from `packages/dms/package.json` (`^2.2.0` line dropped). Confirmed zero remaining imports across `packages/dms/src` via `grep -rn "from '@headlessui"`. The dms submodule is now Headless-free.

**Note:** the broader transportNY repo (`src/pages/DataManager/`, `src/sites/freightatlas/`, etc.) still has many other `@headlessui/react` consumers. Those are out of scope for this task — the goal here was the **dms package + its mapeditor pattern**, and downstream consumers bring their own copy if they still use it.

### Phase 6 — what shipped (2026-05-14)

`section_components.jsx` `TagComponent` used Headless `Combobox` as the picker UI. On close inspection it wasn't really a Combobox — no `onChange` on the wrapper, `Combobox.Option`'s `value` prop never read, `({active})` was the only Combobox-provided thing. The actual interaction is: free-text typeahead, click suggestion to fill input, Enter to commit to tag list.

So no `UI.MultiSelect` migration (would be a square peg for a round hole). Inlined to plain `<input>` + `<div role="listbox">` + `<div role="option">` with `hover:bg-gray-100` replacing the `({active})` styling.

**Headless consumer count: 1 → 0.**

### Phase 5 — what shipped (2026-05-14)

Five files migrated off `<Tab>`. Split: 1 file used `UI.Tabs` cleanly; 4 needed inline tabs (`useState` + `role="tab*"` ARIA) because either (a) sibling content lives in the same flex row as the tablist, or (b) tabs are derived from runtime state (UI.Tabs's `Component`-per-tab API would force re-mount on each state change).

- **`LayerEditor/index.jsx`** — clean `UI.Tabs` migration. Module-level `LAYER_EDITOR_TABS = [{name, Component}]` array; `<Tabs tabs={LAYER_EDITOR_TABS} />`.
- **`LayerManager/index.jsx`** — **inline tabs**. SourceSelector is a sibling of the tab triggers in the same flex row — UI.Tabs owns its tablist `<div>` and can't accept siblings inside it. Pattern: `useState` for `tabIdx`, `TABS` array at module level, `aria-selected={i === tabIdx}` on each `<button role="tab">`, `<ActivePanel />` rendered inside `role="tabpanel"`. Comment added explaining the deviation.
- **`ExternalPluginPanel/index.jsx`** — **inline tabs**. Tabs are derived from `Object.keys(state.symbology.plugins)`. UI.Tabs would force Component re-mounts on each plugin-state change. Added `safeIdx = Math.min(tabIdx, tabs.length-1)` to handle plugin removal mid-render.
- **`InternalPluginPanel/index.jsx`** — same as ExternalPluginPanel. Tabs derive from `Object.keys(state.symbology.plugins)`. Active controls computed inline (`displayDefaultLegendControl` prepended to `PluginLibrary[activePluginName]?.internalPanel({state,setState})`).
- **`map_dama/MapManager/MapManager.jsx`** — **inline tabs** + cleanup. Side-tab layout: 45px-wide vertical tab rail with `SymbologyMenu` and `Plus` button as siblings in the same flex column, panels on the right. Same `safeTabIdx` pattern. Also dropped the now-empty `Fragment` import (only `<Tab as={Fragment}>` used it) and fixed 6 broken JSX blocks left over from the Phase 4 batch `<Menu.Item>` → `<div>` replace_all where `({active}) => (jsx)` render-prop children had been left orphaned inside plain `<div>`s.

**API mismatch found:** `UI.Tabs` takes `tabs={[{name, Component}]}` and renders its own tablist `<div>`. Two failure modes — neither blocking, both informed migration choice:
1. **Sibling content** (LayerManager): can't inject sibling JSX into UI.Tabs's tablist.
2. **Dynamic tabs** (plugin panels, MapManager): runtime-derived tabs would need stable Component refs to avoid re-mount. With state-driven panels this gets awkward.

Both cases resolved with inline tabs. If a third dynamic-tab site shows up we should consider adding either a `header` slot or a child-mode API (`<UI.Tabs.List>...</UI.Tabs.List>` etc.) to `UI.Tabs`. For now, 1 in / 4 out is fine — the inline pattern is 15 lines and reads clearly.

**Headless consumer count: 6 → 1.** Only `section_components.jsx` (Phase 6) remains. (The second match in `ui/components/useModalOverlay.js` is a code-comment string, not an import.)



### Phase 4 — what shipped (2026-05-14)

Five files migrated. Two patterns dominated: action menus (→ `UI.NavigableMenu`) and "menu-as-filter-dropdown / info-card" (→ `UI.Popup` since `<Menu.Item>` was being used as a generic wrapper, not as an action). Also fixed the `<LayerInfo>` exports in two files — they were Menus with no actions, just static info content; both became `UI.Popup`.

- **`LayerManager/LayerPanel.jsx`** — `LayerMenu` (3-item action menu: ZoomToFit, DuplicateLayerItem, Remove) → `UI.NavigableMenu` with `type: () => <jsx/>` items for ZoomToFit/DuplicateLayerItem and plain `{name, onClick}` for Remove. The Remove item's `({active})` bg-pink-50 styling lost — uses NavigableMenu's hover theme now. `LayerInfo` (static source info card) → `UI.Popup`. Dropped Headless import.
- **`LayerManager/LegendPanel.jsx`** — `DynamicFilterControl` was a `<Menu>` with checkbox list children inside. Not an action menu — `<Menu.Item>` was just acting as a wrapper around `<input type="checkbox">`. Migrated to `UI.Popup` with a plain `<div>` per checkbox row. Dropped Headless import.
- **`MapViewerLegend.jsx`** — same two patterns as LayerPanel: `LayerInfo` → `UI.Popup`; `DynamicFilterControl` → `UI.Popup`. Near-identical to the LegendPanel migration.
- **`LayerEditor/Controls.jsx`** — most complex Phase 4 file. The internal `ControlMenu` helper wrapped Headless `<Menu><Menu.Button><Menu.Items>`; rewrote to `UI.Popup`. Then all `<Menu.Item>` consumers (color-swatch palette pickers, section headers) became plain `<div>`. Render-prop `({active})` styling for color swatches dropped — uses plain `hover:bg-blue-50` now. Also migrated the 2 remaining Headless `<Switch>` usages here to `UI.Switch` via ThemeContext (same shape as Phase 5 partial work from prior task). Dropped Headless import entirely.
- **`map_dama/MapManager/MapManager.jsx`** — Menu portion migrated (Tab kept for Phase 5). `SymbologyMenu` wrapper → `UI.Popup`. The ~14 `<Menu.Item>` instances became `<div>` via replace_all (most were plain wrappers without render-props). One icon-picker with `({active})` was hand-converted to `hover:bg-pink-50`. `DynamicFilterControl` → `UI.Popup` (same checkbox-list pattern). File still imports `Tab` from Headless — finishes in Phase 5.

**Pattern note discovered:** `LayerInfo`, `DynamicFilterControl`, and `LayerMenu` shapes are near-duplicates across `LayerPanel.jsx`, `LegendPanel.jsx`, and `MapViewerLegend.jsx`. The mapeditor pattern appears to have copy-pasted these between viewer/editor surfaces. Folding into shared components is a separate cleanup; out of scope here.

**Headless consumer count: 10 → 6.**



### Phase 3 — what shipped (2026-05-14)

Both files use the same `PopoverControl` shape: a labeled trigger that opens a floating panel with a close button. Both migrated to `UI.Popup` via `ThemeContext`.

- **`mapeditor/.../PluginControls/PluginControlWrappers.jsx`** — Headless `<Popover>` + `<Popover.Button>` + `<Transition>` + `<Popover.Panel>` with render-prop `({close})` collapsed to `<Popup button={trigger}>{({setOpen}) => panel}</Popup>`. Bundled Headless import dropped (`Popover, Transition`). The bespoke `-translate-x-[325px] -translate-y-[78px]` positioning is gone — UI.Popup handles viewport-aware placement. Accepted visual regression.
- **`mapeditor/.../LayerEditor/ControlWrappers.jsx`** — same pattern, same migration. Also dropped dead Menu/Tab/Dialog from the bundled import.

**Pattern note:** these two `PopoverControl` implementations are near-identical. After migration they share even more structure. Out of scope for this task, but a future cleanup could fold them into a single shared `PopoverControl` component (both files would import it from a common location). Flagging here in case it's worth a follow-up.

**Headless consumer count: 12 → 10.**



### Phase 2 — what shipped (2026-05-14)

Audit found this phase's scope wasn't quite slide-in panels — both files turned out to be different shapes than expected. Also took the opportunity to clean up the Phase 1 back-compat scaffolding.

- **`LayerManager/SourceSelector/index.jsx`** — was actually using the same shared local `Modal` wrapper from `SymbologyControl/index.jsx`, not a slide-in panel. Migrated to `UI.Modal` via `ThemeContext`. Dropped the bundled Headless import (only `Dialog.Title` was used; Menu/Transition/Tab were dead). The `width={'w-[1200px]'}` prop on the local Modal is no longer honored — UI.Modal renders at its default `sm:max-w-lg`. Accepted visual regression per the no-className-passthrough directive.
- **`page/components/search/index.jsx`** — search/command palette using `Dialog` + `DialogPanel` + `Transition` + Headless `Input`. Migrated to `UI.Modal` + `UI.Input` via `ThemeContext`. Dropped Transition wrapping. Bespoke search-palette modal styling (637px-wide centered panel, custom backdrop opacity) no longer applies — palette will render at UI.Modal's standard `sm:max-w-lg`. Acceptable regression; if a wider/more-prominent search look becomes important later, the right move is to add an `activeStyle` to UI.Modal (e.g. `activeStyle="commandPalette"`) rather than a per-call className override. The `afterLeave={() => setQuery('')}` reset behavior replicated via a `useEffect` watching `open`.
- **`SymbologyControl/index.jsx`** — deleted the back-compat `Modal` re-export that Phase 1 added as scaffolding. All 6 consumers (the 5 sub-components from Phase 1 + SourceSelector this phase) now use `UI.Modal` directly via `ThemeContext`, eliminating the convenience-wrapper indirection per the no-1-2-line-wrappers rule in CLAUDE.md.

**Decision on `UI.CommandPalette` primitive:** not adding it. Only 1 consumer, and the pattern reduces cleanly to `UI.Modal` + `UI.Input` + bespoke result-list rendering. If a second command-palette-style surface emerges, revisit.

**Headless consumer count: 14 → 12.**



### Phase 1 — what shipped (2026-05-14)

Migrated 6 Dialog files. 5 of the 6 only used `Dialog.Title` as an aria-labelledby `<h3>` (sub-components rendered inside a shared local `Modal` wrapper). The 6th was the wrapper itself.

- **`SymbologyControl/index.jsx`**: the local `Modal` export (used by 5 sub-components) rewritten as a thin wrapper around `UI.Modal` via `ThemeContext`. Dropped Headless `Dialog` + `Transition` imports and ~40 lines of inline Transition.Child boilerplate. Existing consumers keep importing `{ Modal } from '../SymbologyControl'`, so Phase 2 (SourceSelector) won't break. Will delete the local Modal entirely once Phase 2 migrates SourceSelector to `UI.Modal` directly.
- **`SymbologyControl/components/CreateSymbologyMenu.jsx`**: `<Dialog.Title as="h3">` → semantic `<h3>`; Headless import dropped.
- **`SymbologyControl/components/SaveChangesMenu.jsx`**: same `<Dialog.Title>` → `<h3>` swap; also fixed a latent bug — file was importing `Button` from Headless but using it with `themeOptions={{ size, color }}` (UI.Button's prop, ignored by Headless.Button). Now imports `Button` from `UI` via `ThemeContext`, so the themeOptions actually take effect.
- **`SymbologyControl/components/SymbologyControlMenu.jsx`**: `<Dialog.Title>` → `<h3>`; Headless import dropped.
- **`SymbologySelector/index.jsx` (mapeditor)**: same `<Dialog.Title>` → `<h3>` swap; Headless import dropped.
- **`map_dama/MapManager/SymbologySelector/index.jsx`**: same; Headless import dropped.

**Headless consumer count: 20 → 14.**

### Phase 0 — what shipped (2026-05-14)

Two files imported Headless but never used it. Dead imports removed:
- `mapeditor/.../LayerEditor/StyleEditor.jsx`
- `map_dama/LegendPanel/LegendPanel.jsx`

(Plus the 3 Switch migrations from the prior task's partial Phase 5 — already counted in the 22→20 transition.)

**Headless consumer count: 22 → 20.**



## Objective

Migrate every direct `@headlessui/react` import inside `patterns/mapeditor/` (and its sibling `patterns/page/.../map_dama/`) to use DMS UI primitives via `ThemeContext`. The DMS UI kit completed its own Headless migration (see completed task `ui-consolidation-drop-headlessui.md`) and is now 100% in-house. The mapeditor pattern is the last consumer of `@headlessui/react`; once it's done, the package can be uninstalled.

**Secondary goal:** during the migration, audit mapeditor for UI patterns that don't map cleanly to existing UI primitives, and **propose new shared primitives** rather than re-implementing locally. The mapeditor predates the UI kit's consolidation and likely has reusable patterns (e.g. command palettes, side panels) that belong in `ui/components/`.

## Audit (snapshot, 2026-05-14)

22 files outside `ui/` still import from `@headlessui/react`:

| Location | Count | Headless surface |
|---|---|---|
| `patterns/mapeditor/MapEditor/` | 17 | Menu / Transition / Tab / Dialog / Popover / Switch |
| `patterns/page/components/` | 5 | 3 in `map_dama/` (mapeditor sibling); `search/index.jsx`; `section_components.jsx` |

### Per-file actual JSX usage

| File | Uses | Likely UI target |
|---|---|---|
| `mapeditor/.../MapViewerLegend.jsx` | Menu | NavigableMenu |
| `mapeditor/.../PluginControlWrappers.jsx` | Popover | Popup |
| `mapeditor/.../LayerManager/LayerPanel.jsx` | Menu | NavigableMenu |
| `mapeditor/.../LayerManager/index.jsx` | Tab | Tabs |
| `mapeditor/.../LayerManager/LegendPanel.jsx` | Menu | NavigableMenu |
| `mapeditor/.../LayerManager/SourceSelector/index.jsx` | Dialog | Modal or Drawer |
| `mapeditor/.../SymbologyControl/index.jsx` | Dialog, Transition | Modal or Drawer |
| `mapeditor/.../SymbologyControl/components/CreateSymbologyMenu.jsx` | Dialog | Modal |
| `mapeditor/.../SymbologyControl/components/SaveChangesMenu.jsx` | Dialog | Modal |
| `mapeditor/.../SymbologyControl/components/SymbologyControlMenu.jsx` | Dialog | Modal |
| `mapeditor/.../SymbologySelector/index.jsx` | Dialog | Modal |
| `mapeditor/.../LayerEditor/ControlWrappers.jsx` | Popover | Popup |
| `mapeditor/.../LayerEditor/StyleEditor.jsx` | (unused import) | delete import |
| `mapeditor/.../LayerEditor/Controls.jsx` | Menu | NavigableMenu |
| `mapeditor/.../LayerEditor/index.jsx` | Tab | Tabs |
| `mapeditor/.../ExternalPluginPanel/index.jsx` | Tab | Tabs |
| `mapeditor/.../InternalPluginPanel/index.jsx` | Tab | Tabs |
| `page/components/search/index.jsx` | Dialog, Transition, Input | Modal (or new CommandPalette primitive — see below) |
| `page/components/sections/section_components.jsx` | Combobox | MultiSelect (searchable) |
| `page/.../map_dama/MapManager/MapManager.jsx` | Menu, Tab | NavigableMenu + Tabs |
| `page/.../map_dama/MapManager/SymbologySelector/index.jsx` | Dialog | Modal |
| `page/.../map_dama/LegendPanel/LegendPanel.jsx` | (unused import) | delete import |

## UI primitive coverage check

Most usages map cleanly to existing UI primitives:

- **Menu** → `UI.NavigableMenu` ✓ (just shipped; arbitrary JSX panels via `{type: () => <jsx/>}`; flat actions via plain `{name, onClick}` items)
- **Tab** → `UI.Tabs` ✓ (just rewrote)
- **Popover** → `UI.Popup` ✓ (viewport-aware floating panel)
- **Dialog (centered modal)** → `UI.Modal` ✓
- **Dialog (slide-in side panel)** → `UI.Drawer` ✓ (handles right-side; may need a left variant)
- **Switch** → `UI.Switch` ✓ (3 sites already migrated in partial Phase 5 of prior task)
- **Combobox** → `UI.MultiSelect` (with `searchable: true`) ✓

### Patterns that may warrant new UI primitives

To be confirmed during migration — flag if any of these patterns turn out to recur:

- **Command palette** (`search/index.jsx`): full-screen modal with a search input + filtered results list. Not a stock Modal — it's a command-palette interaction with arrow-key nav over results. If the pattern is used elsewhere in DMS, propose `UI.CommandPalette` as a new primitive.
- **Tabbed side panel** (LayerManager, LayerEditor): a slide-in side panel with internal tabs at the top. Could be a composition of `UI.Drawer` + `UI.Tabs`, or a dedicated primitive if it's load-bearing. Lean toward composition unless friction emerges.
- **Floating control wrapper** (PluginControlWrappers, ControlWrappers): `Popover` wrapping a labeled control (a button that opens a floating settings panel). Likely just `UI.Popup` + theme; flag if the pattern recurs at 5+ sites.
- **Left-side Drawer**: current `UI.Drawer` only does right-slide. If any mapeditor Dialog is positioned on the left, add a `position: 'left' | 'right'` prop to `UI.Drawer` rather than rolling a new component.

## Phases

Easy wins first, harder rewrites later. Each phase ships independently; visual-diff between commits.

### Phase 0 — Free wins (~3 files, no behavior change)

- **Delete unused Headless imports** in files that import but never use:
  - `LayerEditor/StyleEditor.jsx` — imports Menu/Popover/Transition/Tab/Dialog; none used
  - `map_dama/LegendPanel/LegendPanel.jsx` — same shape, none used
- **(Already complete in prior task)** Switch migrations: `PluginControls.jsx`, `CategoryControl/index.jsx`, `DynamicFilterBuilder.jsx` (dead import).

**Exit:** Headless consumer count outside `ui/`: 22 → 20.

### Phase 1 — Replace standalone `<Dialog>` usages (~6 files)

Modal/centered-overlay Dialog usages — straight swap to `UI.Modal` via `ThemeContext`.

- `SymbologyControl/components/CreateSymbologyMenu.jsx`
- `SymbologyControl/components/SaveChangesMenu.jsx`
- `SymbologyControl/components/SymbologyControlMenu.jsx`
- `SymbologySelector/index.jsx`
- `map_dama/MapManager/SymbologySelector/index.jsx`
- `LayerManager/SymbologyControl/index.jsx` — also uses Transition; drop the transition wrapper (UI.Modal has no entry animation)

Migration shape:
```jsx
// before
<Dialog open={open} onClose={setOpen} className="relative z-50">
  <Dialog.Panel className="...">{children}</Dialog.Panel>
</Dialog>
// after
<Modal open={open} setOpen={setOpen}>{children}</Modal>
```

**Exit:** 20 → 14.

### Phase 2 — Replace slide-in `<Dialog>` panels (~2 files)

Mapeditor sometimes uses Dialog as a side-mounted slide-in panel (not centered). Map to `UI.Drawer`. If positioning is on the left and Drawer doesn't support left, add a `position` prop to Drawer (one place, one component change) rather than per-call overrides.

- `LayerManager/SourceSelector/index.jsx`
- `search/index.jsx` — **special case**: this is a command palette, not a side panel. Audit during migration; if the search-with-arrow-keys pattern is reusable, propose `UI.CommandPalette`. Otherwise it's a Modal with an Input + filtered list.

**Exit:** 14 → 12.

### Phase 3 — Replace `<Popover>` (~2 files)

Both wrap a labeled control trigger that opens a floating settings card. Direct swap to `UI.Popup`.

- `PluginControlWrappers.jsx`
- `ControlWrappers.jsx`

Migration shape:
```jsx
// before
<Popover className="relative w-full">
  <Popover.Button>{trigger}</Popover.Button>
  <Transition>
    <Popover.Panel className="absolute ...">{content}</Popover.Panel>
  </Transition>
</Popover>
// after
<Popup button={trigger}>{content}</Popup>
```

**Exit:** 12 → 10.

### Phase 4 — Replace `<Menu>` action menus (~5 files)

Headless's `<Menu><Menu.Button><Menu.Items><Menu.Item>` pattern. Each `Menu.Item` is an action; the trigger opens a dropdown. Maps to `UI.NavigableMenu` with `showTitle={false}` and items as `{name, onClick}` config entries.

- `MapViewerLegend.jsx`
- `LayerManager/LayerPanel.jsx`
- `LayerManager/LegendPanel.jsx`
- `LayerEditor/Controls.jsx`
- `map_dama/MapManager/MapManager.jsx` (also has Tab — Phase 5)

Migration shape:
```jsx
// before
<Menu as="div" className="relative inline-block">
  <Menu.Button>{trigger}</Menu.Button>
  <Transition>
    <Menu.Items className="absolute ...">
      <Menu.Item>{({active}) => <div className={...}>...</div>}</Menu.Item>
      <Menu.Item>{({active}) => <div className={...}>...</div>}</Menu.Item>
    </Menu.Items>
  </Transition>
</Menu>
// after
<NavigableMenu
  showTitle={false}
  config={[
    { name: 'Action 1', onClick: () => ... },
    { name: 'Action 2', onClick: () => ... },
  ]}
>{trigger}</NavigableMenu>
```

**Visual delta**: Menu.Item's `active` render-prop styling (typically `bg-gray-100 text-gray-900`) is replaced by NavigableMenu's theme. Per the no-className-passthrough rule, recover via `activeStyle` if needed, not per-call overrides.

**Exit:** 10 → 5.

### Phase 5 — Replace `<Tab>` tab navigation (~5 files)

Headless's `<Tab.Group><Tab.List><Tab/></Tab.List><Tab.Panels><Tab.Panel/></Tab.Panels></Tab.Group>`. Maps to `UI.Tabs` (rewritten in prior task; click-only, no arrow-key nav, `aria-selected` styling).

- `LayerManager/index.jsx`
- `LayerEditor/index.jsx`
- `ExternalPluginPanel/index.jsx`
- `InternalPluginPanel/index.jsx`
- `map_dama/MapManager/MapManager.jsx` (combined with Phase 4 since this file has both Menu and Tab; do in one pass)

Migration shape:
```jsx
// before
<Tab.Group>
  <Tab.List>
    <Tab>Tab 1</Tab>
    <Tab>Tab 2</Tab>
  </Tab.List>
  <Tab.Panels>
    <Tab.Panel><Panel1 /></Tab.Panel>
    <Tab.Panel><Panel2 /></Tab.Panel>
  </Tab.Panels>
</Tab.Group>
// after
<Tabs tabs={[
  { name: 'Tab 1', Component: Panel1 },
  { name: 'Tab 2', Component: Panel2 },
]} />
```

**Note:** UI.Tabs expects `Component` references, not rendered JSX children. May need to wrap inline JSX as small components.

**Exit:** 5 → 0 in mapeditor; 0 → 0 total once section_components.jsx (Phase 6) is done.

### Phase 6 — `<Combobox>` migration (~1 file)

- `section_components.jsx`: uses lowercase `Combobox` from Headless. Likely a typeahead-style picker. Map to `UI.MultiSelect` with `singleSelectOnly searchable`.

**Exit:** 0 Headless consumers anywhere.

### Phase 7 — Remove the dependency

1. Confirm `grep -rn "@headlessui/react" packages/dms/src` returns 0.
2. Remove `@headlessui/react` from `packages/dms/package.json`.
3. `npm install`.
4. Visual smoke test: every mapeditor screen (layer manager, layer editor, legend panel, plugin panels, map viewer, symbology controls), plus the page search palette.
5. Sanity-check bundle size shrunk.

## Cross-cutting principles (apply throughout)

1. **Use ThemeContext for UI primitives.** Per DMS CLAUDE.md, every primitive comes from `const { UI } = useContext(ThemeContext); const { X } = UI;`. Never `import X from 'ui/components/X'` directly inside a pattern.
2. **No className passthroughs on UI primitives.** If a migrated site visually regresses, recover via `activeStyle` / named theme styles on the primitive's theme. Wrap the primitive in a positioning `<div>` at the call site for purely positional tweaks.
3. **Propose new primitives, don't fork locally.** If a pattern doesn't fit existing primitives, write a short proposal (or update this task file) before adding a one-off component inside mapeditor.
4. **Visual regressions are acceptable** during migration. The user has accepted reduced a11y for perf and theme unification. Don't pre-emptively preserve every bespoke style.

## Files (per phase)

### Phase 0
- `mapeditor/.../LayerEditor/StyleEditor.jsx` — drop unused Headless import
- `page/.../map_dama/LegendPanel/LegendPanel.jsx` — drop unused Headless import

### Phase 1
- `mapeditor/.../LayerManager/SymbologyControl/index.jsx`
- `mapeditor/.../LayerManager/SymbologyControl/components/CreateSymbologyMenu.jsx`
- `mapeditor/.../LayerManager/SymbologyControl/components/SaveChangesMenu.jsx`
- `mapeditor/.../LayerManager/SymbologyControl/components/SymbologyControlMenu.jsx`
- `mapeditor/.../LayerManager/SymbologySelector/index.jsx`
- `page/.../map_dama/MapManager/SymbologySelector/index.jsx`

### Phase 2
- `mapeditor/.../LayerManager/SourceSelector/index.jsx`
- `page/components/search/index.jsx` — propose CommandPalette primitive if pattern is reusable

### Phase 3
- `mapeditor/.../PluginControls/PluginControlWrappers.jsx`
- `mapeditor/.../LayerEditor/ControlWrappers.jsx`

### Phase 4
- `mapeditor/.../MapViewerLegend.jsx`
- `mapeditor/.../LayerManager/LayerPanel.jsx`
- `mapeditor/.../LayerManager/LegendPanel.jsx`
- `mapeditor/.../LayerEditor/Controls.jsx`

### Phase 5
- `mapeditor/.../LayerManager/index.jsx`
- `mapeditor/.../LayerEditor/index.jsx`
- `mapeditor/.../ExternalPluginPanel/index.jsx`
- `mapeditor/.../InternalPluginPanel/index.jsx`
- `page/.../map_dama/MapManager/MapManager.jsx` (Menu + Tab)

### Phase 6
- `page/components/sections/section_components.jsx`

### Phase 7
- `packages/dms/package.json` — remove `@headlessui/react`

## Testing checklist (per phase)

Each phase ends with a visual diff of the affected mapeditor screen:
- **Phase 1**: open/close symbology controls, save changes confirmation, create symbology menu.
- **Phase 2**: open layer source picker (slide-in panel), open the page search palette.
- **Phase 3**: open plugin control popovers and layer style control popovers.
- **Phase 4**: open each menu trigger in the layer manager, legend panel, map viewer legend, and layer editor controls; click each action.
- **Phase 5**: switch between tabs in LayerManager (Sources/Layers/Map), LayerEditor (Style/Filters/etc.), and the plugin panels.
- **Phase 6**: open the help-text picker in `section_components.jsx`.
- **Phase 7**: production build succeeds; bundle size drops.

## Open questions

- **Is `map_dama/` an active code path?** It looks like a copy of `mapeditor/` inside the page pattern. Confirm whether both are live or one is legacy before sinking effort into duplicates.
- **CommandPalette primitive — yes/no?** Audit `search/index.jsx` during Phase 2 and decide whether the pattern is general enough for `ui/components/`. If only used once, just inline it as a Modal + Input + filtered list.
- **Left-position Drawer.** Decide on `position: 'left' | 'right'` API for `UI.Drawer` once we see whether any mapeditor side panel needs the left edge.
