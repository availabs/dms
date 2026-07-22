# Section header extensions — generic extension point for inline header content

## Status: NOT STARTED. Scoped 2026-07-21 from a design-audit artifact (see root task
[avl-graph-quick-controls.md](../../../../planning/tasks/current/avl-graph-quick-controls.md) for
the theme-side consumer and full origin context). This file is the library-side primitive only.

## Objective

Add a small, generic extension point — structurally identical in shape to the existing
`sectionMenuExtensions` mechanism — that lets a theme inject custom React content directly into a
page section's header band (the row that shows the title and the "⋮" Settings-menu trigger),
instead of only being able to add item-groups to the Settings drawer.

This is pure plumbing. It doesn't know anything about NPMRDS, Measure, or comparison modes — any
theme can register header content for any `ComponentRegistry` component name.

## Scope

### In scope
- A new registry module mirroring `sectionMenuExtensions.js` exactly (register replaces, not
  appends — see "Non-obvious gotcha" below).
- Wiring into `siteConfig.jsx`'s `pagesConfig` so `theme.sectionHeaderExtensions` auto-registers,
  the same way `theme.sectionMenuExtensions`/`theme.pageComponents`/`theme.columnTypes` already do.
- Consuming the registry inside `section.jsx` (both `SectionEdit` and the View-mode header,
  `ViewSectionHeader` in `section_components.jsx`) and rendering the result as a new row directly
  below the existing title/menu row.
- A new theme key (`theme.pages.section.headerExtensionsRow` or similar — confirm exact theme
  object shape while implementing) for styling the row's background/padding, defaulted to empty/no
  styling in the base theme so sites that don't use this feature see zero visual change.
- Exporting the new `registerSectionHeaderExtensions` function from the package's public `index.js`.

### Out of scope (belongs in the theme-side task)
- Anything NPMRDS-specific: the actual pill controls, Measure/Comparison Mode vocabulary, reading
  `state.display._measurePick`, calling `dwAPI.setState`. None of that belongs in this library
  change — see `src/themes/transportny/` in the sibling task.

## Current state (confirmed by direct code reading, 2026-07-21)

**Precedent this mirrors** — `sectionMenuExtensions.js`
(`src/dms/packages/dms/src/patterns/page/components/sections/sectionMenuExtensions.js`, 28 lines):

```js
const registry = {};
export function registerSectionMenuExtensions(componentName, builders) {
    if (!componentName) return;
    registry[componentName] = Array.isArray(builders) ? builders : [builders];
}
export function getSectionMenuExtensions(componentName) {
    return registry[componentName] || [];
}
```

Consumed in `sectionMenu.jsx:628-647`:
```js
const extensionMenus = getSectionMenuExtensions(currentComponent?.name)
    .flatMap(build => {
        try {
            return build({
                state, dwAPI, mapAPI, isEdit, canEditSection,
                currentComponent, sectionState, actions, auth, ui,
                dataSource, pageDataSources, siblingSections,
            }) || [];
        } catch (e) {
            console.error('sectionMenu extension failed', e);
            return [];
        }
    })
    .filter(item => !item.cdn || item.cdn());
```

Registered in `siteConfig.jsx:70-78`:
```js
if (theme.sectionMenuExtensions) {
    Object.entries(theme.sectionMenuExtensions).forEach(([componentName, builders]) =>
        registerSectionMenuExtensions(componentName, builders))
}
```

Theme-side registration precedent, `src/themes/transportny/themev2.js:2411-2412`:
```js
sectionMenuExtensions: { "AVL Graph": [npmrdsMeasureMenu] },
```

**Section header rendering today** — `section.jsx`:
- Edit mode (`SectionEdit`, lines 249-284) — title + menu in one flex row, no extra row beneath it:
```jsx
<div className={`flex flex-row font-display font-medium uppercase scroll-mt-36 items-center`}>
    <div className='flex-1'>
        <TitleViewComp className={...} value={value?.['title']}/>
    </div>
    <div className={theme.topBar}>
        <div className={theme.topBarSpacer}/>
        <div className={theme.topBarButtonsEdit}>
            <HelpTextEditPopups .../>
            <div className={theme.menuPosition}>
                <NavigableMenu config={sectionMenuItems} title={'Settings'} .../>
            </div>
        </div>
    </div>
</div>
```
- View mode splits into `theme.topBar` (menu only, lines 463-482) + `<ViewSectionHeader .../>`
  (line 485, defined in `section_components.jsx:5-68` — title row + a small fixed set of icons,
  Tags/Help popups).
- **No existing extension point in either header** — confirmed by exhaustive grep (no
  `headerExtensions`/`quickControls`/similar hook name anywhere in the codebase). `cardHints`
  (`card-layout.md`) is unrelated — it's a per-column-cell mechanism inside `Card.jsx`'s data grid,
  nothing to do with section chrome. `authoring-graphs.md`'s "header + hero-stat" pattern is an
  explicit workaround (a separate sibling Card section stacked above the graph), not a real slot.

**Non-obvious gotcha, already hit once by `sectionMenuExtensions` and must not be repeated**: the
registry must **replace**, not append, on each registration call. `pagesConfig` re-registers on
every site-config build, and Vite HMR re-runs it on every hot-reload — an append-based registry
caused the Measure item-group to render 14 times in production before this was caught live (see
`report-graph-vocabulary-picker.md`, "design deviation" note). Copy the replace-based
implementation verbatim; do not "improve" it to accumulate.

## Proposed changes

1. **New file**: `src/dms/packages/dms/src/patterns/page/components/sections/sectionHeaderExtensions.js`
   ```js
   const registry = {};
   export function registerSectionHeaderExtensions(componentName, builders) {
       if (!componentName) return;
       registry[componentName] = Array.isArray(builders) ? builders : [builders];
   }
   export function getSectionHeaderExtensions(componentName) {
       return registry[componentName] || [];
   }
   ```

2. **`siteConfig.jsx`**: alongside the existing block at lines 70-78, add:
   ```js
   if (theme.sectionHeaderExtensions) {
       Object.entries(theme.sectionHeaderExtensions).forEach(([componentName, builders]) =>
           registerSectionHeaderExtensions(componentName, builders))
   }
   ```

3. **Builder contract** (deliberately simpler than sectionMenu's item-group objects — there's no
   drawer chrome to build, just inline JSX):
   ```
   build(ctx) => ReactNode | ReactNode[] | null
   ```
   where `ctx` is the **same shape** `sectionMenu` extensions already receive — `{state, dwAPI,
   isEdit, canEditSection, currentComponent, siblingSections, mapAPI, sectionState, actions, auth,
   ui, dataSource, pageDataSources}` — so a theme-side builder can share code/context assumptions
   directly with an equivalent `sectionMenuExtensions` builder for the same component name (this is
   exactly what the theme-side task needs: the Quick Controls builder and the Measure Picker
   builder must read/write identical state).

4. **`section.jsx`** — both call sites:
   - Import `getSectionHeaderExtensions` from the new file.
   - Compute once per render (mirroring the `extensionMenus` try/catch pattern in
     `sectionMenu.jsx:628-647`, so one broken extension can't blank the header):
     ```js
     const headerExtensions = getSectionHeaderExtensions(currentComponent?.name)
         .flatMap(build => {
             try {
                 return build({ state, dwAPI, isEdit, canEditSection, currentComponent, siblingSections, ... }) || [];
             } catch (e) {
                 console.error('sectionHeader extension failed', e);
                 return [];
             }
         });
     ```
   - Render conditionally, directly below the existing title/menu flex row (both `SectionEdit`'s
     inline JSX and `ViewSectionHeader` in `section_components.jsx`):
     ```jsx
     {headerExtensions.length > 0 && (
         <div className={theme.headerExtensionsRow}>{headerExtensions}</div>
     )}
     ```
   - `dwAPI` is already in scope at both call sites (see `report-graph-vocabulary-picker.md`'s
     "Round 2" notes — `section.jsx` already derives `siblingSections` from `PageContext` for the
     sectionMenu extension ctx; reuse the same values here rather than re-deriving).

5. **Theme key**: add `headerExtensionsRow: ""` (or equivalent empty default) to the base
   `section.theme.jsx` so sites with no registered extensions render byte-identical to today.
   transportny's `themev2.js` supplies the actual styling once the visual spec is confirmed (see
   the theme-side task's "visual spec" section — this library task does not need to guess the
   right classes, just provide the hook).

6. **Export** `registerSectionHeaderExtensions` from `src/dms/packages/dms/src/index.js` (mirrors
   how `registerSectionMenuExtensions` is exported there).

## Files requiring changes

| File | Change |
|---|---|
| `src/dms/packages/dms/src/patterns/page/components/sections/sectionHeaderExtensions.js` (new) | Registry: `registerSectionHeaderExtensions`/`getSectionHeaderExtensions`, replace-not-append |
| `src/dms/packages/dms/src/patterns/page/siteConfig.jsx` | Auto-register `theme.sectionHeaderExtensions`, mirroring the existing `sectionMenuExtensions` block |
| `src/dms/packages/dms/src/patterns/page/components/sections/section.jsx` | Compute + render `headerExtensions` in both `SectionEdit` and the View-mode header path |
| `src/dms/packages/dms/src/patterns/page/components/sections/section_components.jsx` | `ViewSectionHeader` renders the same new row in View mode |
| `src/dms/packages/dms/src/patterns/page/components/sections/section.theme.jsx` (base theme) | New empty-default `headerExtensionsRow` key |
| `src/dms/packages/dms/src/index.js` | Export `registerSectionHeaderExtensions` |

## Testing checklist

- [ ] Regression: a page with zero registered header extensions for any component type renders
      byte-identical to before this change (no stray empty `<div>`, no layout shift) — check both
      Edit and View mode.
- [ ] A stub extension (`() => <span>test</span>`) registered for `"AVL Graph"` renders in the
      correct position (below the title, above the section body) in both Edit and View mode.
- [ ] A throwing stub extension does not blank the rest of the header or crash the page (try/catch
      isolation works, matching `sectionMenu.jsx`'s existing pattern).
- [ ] Registering twice (simulating HMR/re-registration) does not duplicate the rendered content —
      confirms the replace-not-append fix was actually applied here too, not just copied as a
      comment.
- [ ] Multiple `<div>` instances of the same component type on one page (e.g. two AVL Graph cards)
      each render their own independent extension output, reading their own section's `state`/
      `dwAPI` — not a shared/stale reference.
