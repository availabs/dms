# Modernize Datasets Pattern — UI, Theme, and Structure

## Objective

Update the datasets pattern to follow current best practices established by the page pattern:
1. The siteConfig top-level wrapper should be **context-only** (no `<Layout>` wrapping all routes)
2. Each rendered page should have its own `UI.Layout` component with appropriate nav items
3. Create a `defaultTheme.js` for the datasets pattern with its own theme defaults
4. Replace hardcoded Tailwind throughout with UI components and theme-driven classes
5. Use UI components (Table, Tabs, Icon, Button, Input, Dialog, etc.) for all layout

## Current State Assessment

### siteConfig.jsx — 3 configs, all with the same anti-pattern

All three configs (`adminConfig`, `externalSourceConfig`, `internalSourceConfig`) follow this structure:

```jsx
<DatasetsContext.Provider value={{...}}>
  <ThemeContext.Provider value={{theme, UI}}>
    <Layout navItems={[]} Menu={() => <DefaultMenu/>}>  // <-- Layout wraps ALL children
      {children}
    </Layout>
  </ThemeContext.Provider>
</DatasetsContext.Provider>
```

**Problem**: `<Layout>` wraps every child route with the same empty `navItems={[]}`. Individual pages can't customize their nav, header, or footer. Compare with the page pattern:

```jsx
// page pattern siteConfig.jsx — context only, no Layout
<CMSContext.Provider value={{...}}>
  <ThemeContext.Provider value={{theme, UI}}>
    {children}  // <-- each page renders its own Layout
  </ThemeContext.Provider>
</CMSContext.Provider>
```

### Theme handling — inconsistent across configs

- `adminConfig`: Uses `getPatternTheme(themes, pattern)` (correct)
- `externalSourceConfig`: Uses `merge(cloneDeep(defaultTheme), cloneDeep(themes[pattern?.theme_name] || themes.mny_datasets))` (manual, bypasses pattern theme system)
- `internalSourceConfig`: Same manual merge as external

There is **no `defaultTheme.js`** for the datasets pattern. The page pattern exports one at `patterns/page/defaultTheme.js` that gets merged into the global default theme.

### Context — duplicated setup across all 3 configs

All 3 configs build nearly identical context values. This should be extracted to a shared helper or single context setup.

---

## File-by-File Assessment

### Pages requiring updates

| File | Current State | Work Needed |
|------|---------------|-------------|
| `siteConfig.jsx` | Layout wraps all routes, inconsistent theme merge, duplicated context | Restructure: context-only wrapper, fix theme, deduplicate |
| `pages/DatasetsList/index.jsx` | 100% hardcoded Tailwind, no theme, custom sidebar layout | Add own `<Layout>`, use UI.Table/UI.Icon, theme classes |
| `pages/layout.jsx` (SourcesLayout) | Custom breadcrumbs, nav, all hardcoded | Replace with `<Layout>` + themed breadcrumb/tab components |
| `pages/sourcePageSelector.jsx` | Uses SourcesLayout, hardcoded version selector | Use `<Layout>` with dynamic nav items |
| `pages/dataTypes/default/overview.jsx` | Has `tableTheme()` helper but mostly hardcoded | Use UI.Table properly, theme-driven layout |
| `pages/dataTypes/default/admin.jsx` | Refs `theme?.page?.wrapper1` (borrowed from page pattern) | Own theme keys, use UI components for grids/buttons |
| `pages/metadata.jsx` | Minimal, wraps MetadataComp in SourcesLayout | Use `<Layout>` |
| `pages/dataTypes/default/Tasks/index.jsx` | Uses TasksLayout wrapper | Use `<Layout>` |
| `components/menu.jsx` (DefaultMenu) | Hardcoded Tailwind, icon sizes | Use theme, UI.Icon properly |
| `components/MetadataComp/index.jsx` | Hardcoded Tailwind | Use UI components |
| `ui/index.jsx` | Custom Layout that duplicates UI.Layout | Remove, use UI.Layout directly |

### Files likely fine as-is

| File | Notes |
|------|-------|
| `context.js` | Simple context creation, fine |
| `auth.js` | Permission logic, no UI |
| `datasets.format.js` | Data format definitions, no UI |
| `pages/dataTypes/default/utils.jsx` | Data utilities, no UI |
| `pages/dataTypes/*/index.js` | Config objects, no UI to theme |

---

## Structural Recommendations

### 1. Remove the datasets-specific `ui/Layout` component

The datasets pattern has its own `ui/index.jsx` that defines a custom `Layout` component. This duplicates `UI.Layout` from the shared UI library. The pattern should use `UI.Layout` directly (same as the page pattern does).

The custom nav components (`ui/nav/Top.jsx`, `ui/nav/Side.jsx`) are also duplicates of the shared TopNav/SideNav. Remove them.

### 2. Collapse SourcesLayout into per-page Layout usage

Currently `SourcesLayout` (layout.jsx) provides breadcrumbs + nav tabs for source detail pages. This should be replaced by:
- Each source page renders `<Layout navItems={sourceNavItems}>` directly
- Breadcrumbs become a reusable component (or use UI's built-in if available)
- The nav tabs become `navItems` passed to Layout

### 3. Unify the 3 siteConfig configs

The 3 configs (`adminConfig`, `externalSourceConfig`, `internalSourceConfig`) share ~90% of their code. Extract a shared wrapper component:

```jsx
const DatasetsWrapper = ({children, contextValue, theme}) => (
  <DatasetsContext.Provider value={contextValue}>
    <ThemeContext.Provider value={{theme, UI}}>
      {children}
    </ThemeContext.Provider>
  </DatasetsContext.Provider>
)
```

### 4. Create `defaultTheme.js` for datasets

Following the page pattern's `defaultTheme.js`:

```javascript
// patterns/datasets/defaultTheme.js
export default {
    datasetsList: { ... },     // list page styling
    sourceDetail: { ... },     // source detail page styling
    sourceNav: { ... },        // source navigation tabs
    breadcrumbs: { ... },      // breadcrumb styling
    sourceCard: { ... },       // source card in list
    metadata: { ... },         // metadata editor
    admin: { ... },            // admin page styling
}
```

Register this in `ui/defaultTheme.js` alongside `pages: pagesTheme`:
```javascript
import datasetsTheme from "../patterns/datasets/defaultTheme"
// ...
const components = {
    pages: pagesTheme,
    datasets: datasetsTheme,
    // ...
}
```

### 5. Use UI components throughout

Replace hardcoded elements with UI components:

| Current | Replace with |
|---------|-------------|
| Custom `<Nav>` with Link tabs | UI.Tabs or navItems in Layout |
| Custom `<Breadcrumbs>` with SVG arrows | UI breadcrumb component (or thin themed wrapper) |
| `<select>` for version selector | UI.Select |
| `<input>` for search | UI.Input |
| Custom modal in DatasetsList | UI.Dialog |
| Custom table in overview | UI.Table |
| Custom button styles | UI.Button |
| Custom toggle/switch | UI.Switch |
| Inline SVG icons | UI.Icon |

---

## Implementation Plan

### Phase 0: Combine 3 siteConfig configs into 1 — DONE

The three configs (`adminConfig`, `externalSourceConfig`, `internalSourceConfig`) were combined into a single `datasetsConfig`.

#### What was done

- [x] Fixed `sourcePageSelector.jsx` — derived internal source pgEnv as `${format.app}+${format.type}|source`
- [x] Merged all routes into single `datasetsConfig` using `datasetsFormat` (form-manager)
- [x] Single context wrapper with `getPatternTheme()`, single `DatasetsContext.Provider`
- [x] Preserved per-route auth: `reqPermissions` on admin routes
- [x] Removed `pageBaseUrl` from shared context — computed per-child in `sourcePageSelector.jsx`
- [x] Removed unused params (`columns`, `logo`, `checkAuth`), dead imports
- [x] Verified: build passes, all routes functional

**Design note**: `pageBaseUrl` is still set inside `sourcePageSelector.jsx` via a nested `DatasetsContext.Provider` override for the source detail pages, rather than being removed entirely. This preserves the existing behavior of `SourcesLayout` breadcrumbs.

#### Route analysis — no conflicts

| Config | Current baseUrl | Routes |
|--------|----------------|--------|
| `adminConfig` | `${baseUrl}` | `""` (DatasetsList), `"tasks"` (Tasks), `"task/:etl_context_id"` (TaskPage) |
| `externalSourceConfig` | `${baseUrl}/source` | `:id/:page?/:view_id?` (SourcePageSelector) |
| `internalSourceConfig` | `${baseUrl}/internal_source` | `:id/:page?/:view_id?` (SourcePageSelector isDms=true) |

Combined under one config at `${baseUrl}/*`, all children are distinct:

```
""                                    → DatasetsList
tasks                                 → Tasks
task/:etl_context_id                  → TaskPage
source/:id/:page?/:view_id?          → SourcePageSelector
internal_source/:id/:page?/:view_id? → SourcePageSelector(isDms=true)
```

### Phase 1: Foundation (defaultTheme + siteConfig restructure) — DONE

- [x] Created `patterns/datasets/defaultTheme.js` — minimal placeholder skeleton (expanded in later phases)
- [x] Registered in `ui/defaultTheme.js` — `datasets: datasetsTheme` alongside `pages: pagesTheme`
- [x] Restructured `siteConfig.jsx` wrapper to context-only (no `<Layout>`):
  - [x] Removed `import DefaultMenu` — no longer used
  - [x] Removed `const { Layout } = UI` and `<Layout>` wrapper around `{props.children}`
  - [x] Removed `Menu` from `DatasetsContext` value (dead code — only consumer was never-imported `avail-layout.jsx`)
- [x] Added `<Layout navItems={[]}>` to each page component:
  - [x] `pages/DatasetsList/index.jsx` — destructured `UI` from context, got `Layout`, wrapped `<SourcesLayout>` in `<Layout>`
  - [x] `pages/sourcePageSelector.jsx` — destructured `Layout` from `UI`, wrapped outer return in `<Layout>`
  - [x] `pages/dataTypes/default/Tasks/index.jsx` — imported `DatasetsContext`, got `UI` + `Layout`, wrapped `<TasksLayout>` in `<Layout>`
  - [x] `pages/dataTypes/default/Tasks/TaskPage.jsx` — destructured `Layout` from `UI`, wrapped `<TasksLayout>` in `<Layout>`
  - [x] `pages/dataTypes/default/error.jsx` — no change needed (already had its own `<Layout>`)
- [x] Build passes (`npm run build`)

**Design note**: `Menu` prop is still accepted by the `datasetsConfig` function signature for API compat, but is no longer used or passed into context. The `<Layout Menu={...}>` in the old wrapper was dead code — `Layout.jsx` does not accept a `Menu` prop.

### Phase 2: LayoutGroup + Breadcrumbs + Source Nav — DONE

All dataset pages now wrap content in `<LayoutGroup>` for consistent containment. Duplicated breadcrumb code unified into a single themed component.

#### Step 1: Theme files — DONE
- [x] Created `components/sourceTable.theme.js` — extracted from `overview.jsx`'s `tableTheme()` default output
- [x] Created `components/Breadcrumbs.jsx` — includes `breadcrumbsTheme` export with nav/ol/li/link/homeIcon/separator classes
- [x] Updated `defaultTheme.js` — imports breadcrumbsTheme and sourceTableTheme

#### Step 2: Unified Breadcrumbs component — DONE
- [x] Created `components/Breadcrumbs.jsx` — accepts `items` array (`[{name, href?, icon?}]`), reads theme from `theme.datasets.breadcrumbs` via ThemeContext, renders SVG separators + Icon/Link
- [x] Replaces duplicated breadcrumb code from `layout.jsx` and `TasksBreadcrumb.jsx`

#### Step 3: sourcePageSelector.jsx — DONE
- [x] Removed `SourcesLayout` import, replaced with `Breadcrumbs` + inline `SourceNav` + `LayoutGroup`
- [x] Source tabs rendered as inline `<SourceNav>` component (preserves current visual layout)
- [x] Breadcrumbs built from `[{icon, href}, {name, href}, {name}]` items array
- [x] Version selector kept inline (shows on table/upload/validate/map pages)
- [x] `<LayoutGroup>` wraps `<Page>` content

**Design note**: Source nav tabs kept as inline component rather than Layout `navItems` — passing them as navItems would change the visual layout (tabs appear in SideNav/TopNav). Kept inline to minimize visual disruption. Can convert to navItems in future if desired.

#### Step 4: Source detail pages — DONE
- [x] `overview.jsx` — removed unused `SourcesLayout` import, removed `p-4 bg-white` wrapper div (LayoutGroup handles)
- [x] `admin.jsx` — removed `ThemeContext` import and `theme?.page?.wrapper1` reference (was borrowing page pattern theme)
- [x] `version.jsx` — removed unused `SourcesLayout` import, removed `theme?.page?.wrapper1` and `shadow bg-white` from wrapper
- [x] `internal/pages/upload.jsx` — removed unused `SourcesLayout` import, removed `theme?.page?.wrapper1`
- [x] `internal/pages/create.jsx` — removed unused `SourcesLayout` import, removed `theme?.page?.wrapper1`

**Design note**: `overview.jsx` still uses its own `tableTheme()` function — the `sourceTableTheme` in defaultTheme is the extracted default, but overview.jsx's function supports color/size variants. Full table theme migration deferred to Phase 3/4.

#### Step 5: Tasks pages — DONE
- [x] `Tasks/index.jsx` — replaced `TasksLayout` with `Breadcrumbs` (items: Database > Tasks) + `LayoutGroup`
- [x] `Tasks/TaskPage.jsx` — replaced `TasksLayout` with `Breadcrumbs` (items: Database > Tasks > source name) + `LayoutGroup`. Source name fetch logic moved from `TasksBreadcrumb` into `TaskPageComponent` (useEffect + Falcor query for source name)

#### Step 6: DatasetsList — DONE
- [x] Removed `SourcesLayout` import, replaced with `LayoutGroup`
- [x] DatasetsList is root page — no breadcrumbs needed (SourcesLayout was called with `hideNav={true}`)

#### Step 7: Dead code removal — DONE
- [x] Deleted `pages/layout.jsx` (SourcesLayout) — all consumers updated
- [x] Deleted `Tasks/components/TasksLayout.jsx` — replaced by LayoutGroup
- [x] Deleted `Tasks/components/TasksBreadcrumb.jsx` — replaced by unified Breadcrumbs
- [x] Deleted `Tasks/components/` directory (empty)
- [x] Deleted `pages/metadata.jsx` — confirmed dead code (broken import path, not imported by siteConfig or any route)
- [x] `npm run build` passes (2531 modules, no errors)

#### Additional files discovered and updated (not in original plan)
- `pages/dataTypes/default/version.jsx` — had unused SourcesLayout import + `theme?.page?.wrapper1`
- `pages/dataTypes/internal/pages/upload.jsx` — had unused SourcesLayout import + `theme?.page?.wrapper1`
- `pages/dataTypes/internal/pages/create.jsx` — had unused SourcesLayout import + `theme?.page?.wrapper1`

#### Verification
- [x] `npm run build` — no compile errors
- [ ] Manual: DatasetsList page renders inside LayoutGroup (white card container)
- [ ] Manual: Source detail page shows nav tabs (Overview, Admin, + source-specific)
- [ ] Manual: Source detail breadcrumbs render with themed styling
- [ ] Manual: Tasks page renders breadcrumbs + content in LayoutGroup
- [ ] Manual: TaskPage renders breadcrumbs (with source name) + event table in LayoutGroup
- [ ] Manual: Version selector still appears on table/upload/validate/map pages
- [ ] Manual: Error page unchanged (has its own Layout)

### Phase 3: DatasetsList UI Components — DONE

This phase replaces all hardcoded Tailwind and native HTML elements in `pages/DatasetsList/index.jsx` with shared UI components and theme-driven classes. The file has 3 sub-components: `SourceThumb` (source card), `RenderAddPattern` (add modal), and the main `DatasetsList` export.

#### Step 1: Theme objects — DONE
- [x] Created `components/datasetsList.theme.js` — theme keys for toolbar, body, sidebar, sidebarItem, sidebarItemActive, sidebarBadge, sourceList, sourceCard, sourceTitle, sourceTypeLabel, sourceCategoryBadge, sourceDescription
- [x] Updated `defaultTheme.js` — imports `datasetsListTheme`, registers as `datasetsList`

#### Step 2: SourceThumb — DONE
- [x] Added `ThemeContext` import, reads `theme.datasets.datasetsList` as `t`
- [x] Replaced card wrapper → `t.sourceCard`
- [x] Replaced title link → `t.sourceTitle`
- [x] Replaced type label → `t.sourceTypeLabel`
- [x] Replaced category badges → `t.sourceCategoryBadge`
- [x] Replaced description link → `t.sourceDescription`

#### Step 3: RenderAddPattern — DONE
- [x] Removed `import {Modal} from "../../ui"` — now uses `UI.Modal` from DatasetsContext
- [x] Gets `{Modal, Select, Input, Button}` from `UI` via `useContext(DatasetsContext)`
- [x] Replaced `<select>` → `UI.Select` with `selectOptions` array (`[{label, value}]` format)
- [x] Replaced `<input>` → `UI.Input` for name field
- [x] Replaced add `<button>` → `UI.Button` (default style)
- [x] Replaced cancel `<button>` → `UI.Button type="plain"`
- [x] Added `<div className="flex gap-2 mt-2">` wrapper for button row
- [x] `ExternalComp` render path unchanged

**Design note**: `UI.Input` destructures `placeholder` out of props without forwarding to `Headless.Input`, so placeholder text may not render. This is a pre-existing bug in the shared Input component — not addressed here.

#### Step 4: Main component toolbar — DONE
- [x] Replaced search `<input>` → `UI.Input` with `placeholder="Search datasources"`
- [x] Replaced sort `<button>` → `UI.Button type="plain"` wrapping `UI.Icon` (`SortDesc`/`SortAsc`)
- [x] Replaced add `<button>` → `UI.Button type="plain"` wrapping `UI.Icon icon="CirclePlus"`
- [x] Replaced `actionButtonClassName` hardcoded string → `t.toolbar` theme class on wrapper
- [x] `user?.authed` guard preserved on add button

#### Step 5: Category sidebar — DONE
- [x] Replaced sidebar wrapper className → `t.sidebar`
- [x] Replaced category `<Link>` className → conditional `t.sidebarItemActive` / `t.sidebarItem`
- [x] Kept `<i className="fa fa-category">` — no matching UI.Icon exists for this custom FA icon
- [x] Replaced badge `<div>` className → `t.sidebarBadge`

#### Step 6: Source list area — DONE
- [x] Replaced source list wrapper className → `t.sourceList`
- [x] Replaced body wrapper className → `t.body`

#### Step 7: Dead code removal — DONE
- [x] Removed `import {Modal} from "../../ui"` — replaced by `UI.Modal` from context
- [x] Removed unused imports: `useMemo`, `useRef` from react; `useParams`, `useLocation` from react-router; `isEqual` from lodash-es
- [x] Removed `isListAll` (always `false`) — simplified Link `to` prop and removed no-op filter chain
- [x] Removed `filteredCategories` (always `[]`) — removed no-op category exclusion filter
- [x] Removed `cat2` (always `undefined`) — simplified category match condition
- [x] Removed `actionButtonClassName` — replaced by theme class
- [x] Removed unused `isStale` cleanup in useEffect (was set but never checked)
- [x] Removed `setSources` from `RenderAddPattern` props (was passed but never destructured/used)
- [x] Removed `setSearchParams` destructuring (unused)
- [x] `npm run build` passes (no errors)

#### Verification

- [x] `npm run build` — no compile errors
- [ ] Manual: DatasetsList search input renders with UI.Input styling
- [ ] Manual: Sort/Add buttons render with UI.Button + UI.Icon
- [ ] Manual: Add modal opens with UI.Modal, select/input/buttons use shared components
- [ ] Manual: Source cards render with themed classes (same visual appearance)
- [ ] Manual: Category sidebar renders with themed classes
- [ ] Manual: Theme override in site config propagates to DatasetsList (verify by adding a test override)

### Phase 4: Dead Code Removal + Icon Migration — DONE

**Goal**: Delete all dead local UI code (no live consumers after Phase 3) and migrate the one remaining icon dependency.

**Key finding**: After Phase 3, `ui/index.jsx` has **zero** live consumers. The entire local UI layer (`ui/`, `ui/nav/`, `ui/icons.jsx`, `ui/avail-layout.jsx`) and `components/menu.jsx` are dead code chains. The only live import from the local UI layer is `ValidateComp.jsx` importing `{Filter, FilterRemove}` from `../ui/icons`.

#### Step 1: Delete `components/menu.jsx` (dead code)

- [x] Deleted — exports `DefaultMenu` and `Item`, neither imported anywhere

#### Step 2: Delete `ui/avail-layout.jsx` (dead code)

- [x] Deleted — custom Layout component, never imported anywhere

#### Step 3: Delete `ui/nav/` directory (dead chain)

- [x] Deleted `Top.jsx`, `Side.jsx`, `Item.jsx`, `Menu.jsx` — only imported by avail-layout.jsx

#### Step 4: Migrate `ValidateComp.jsx` icons from local `ui/icons` to shared UI

- [x] Removed `import {Filter, FilterRemove} from "../ui/icons"`
- [x] Added `const {UI} = useContext(cms_context)` and `const {Icon} = UI` at top of Validate component
- [x] Replaced `<Filter>` with `<Icon icon="Filter">` (shared UI icon)
- [x] Inlined `FilterRemoveIcon` SVG component (not available in shared UI, single-use)
- [x] Replaced `<FilterRemove>` with `<FilterRemoveIcon>`

#### Step 5: Delete `ui/icons.jsx` (no remaining consumers)

- [x] Deleted — 30+ custom SVG icons, zero consumers after Step 4

#### Step 6: Delete `ui/index.jsx` (zero live consumers)

- [x] Deleted — Modal, DeleteModal, Dropdown, etc. all unused after Phase 3

#### Step 7: Remove empty `ui/` directory

- [x] Removed — directory empty after Steps 2-6

#### Verification

- [x] `npm run build` — no compile errors (23.86s)
- [x] `grep` for remaining imports from `../ui`, `../../ui`, `./ui` within datasets pattern — zero matches (only unrelated `uicomponents` in avl-map-2)
- [ ] Manual: ValidateComp filter/filter-remove icons render correctly on source detail pages
- [ ] Manual: All existing functionality still works (no regressions from deletions)

#### Summary

**Files deleted** (7 files + 1 directory): `components/menu.jsx`, `ui/avail-layout.jsx`, `ui/nav/` (4 files), `ui/icons.jsx`, `ui/index.jsx`

**Files modified** (1 file): `components/ValidateComp.jsx` — Filter → shared UI.Icon, FilterRemove → inline SVG, import removed

### Phase 5: MetadataComp Theme, ValidateComp Cleanup, Breadcrumbs Fix, Verification — DONE

**Goal**: Theme the two remaining high-impact components (MetadataComp, ValidateComp), fix the one hardcoded color in Breadcrumbs, verify all routes, and test theme overrides end-to-end.

**Scope boundary**: This phase covers core infrastructure components only. Deeper feature pages (ExternalVersionControls, upload, overview, admin, categories) retain hardcoded styles — they are candidates for future per-page modernization but are out of scope for this task.

#### Step 1: Create `components/metadataComp.theme.js`

- [x] Created with ~30 theme keys covering index.jsx, RenderField.jsx, RenderAddField.jsx, Metadata.jsx
- [x] Keys: container, searchWrapper, dirtyWarning, fieldRow/Even/Odd, dragHandle, fieldControls, advancedToggle, inputWrapper, label, optionTag, deleteButton, mappedGrid, addButton, etc.

#### Step 2: Update `MetadataComp/index.jsx`

- [x] Added `ThemeContext` import and `metadataCompTheme` fallback import
- [x] Replaced dead `const theme = {}//useTheme()` with proper ThemeContext usage
- [x] Replaced 6 hardcoded classes with theme keys
- [x] Removed unused `theme` prop from child component calls

#### Step 3: Update `MetadataComp/components/RenderField.jsx`

- [x] Added ThemeContext to all 10 sub-components (RenderInputText, RenderInputSelect, RenderInputSwitch, RenderInputButtonSelect, RenderInputLexical, RenderAddForm, RenderEditingForm, RenderOptions, RenderMappedOptions, RenderRemoveBtn, RenderField)
- [x] Replaced module-level `labelClass` const with `t.label` from theme
- [x] Replaced ~25 hardcoded classes: field rows, drag handle, options tags, delete modal, input wrappers, advanced panel, mapped options grid
- [x] **Design choice**: Each sub-component gets theme via `useContext(ThemeContext)` rather than prop-threading — cleaner since they already use `useContext(DatasetsContext)`

#### Step 4: Update `MetadataComp/components/RenderAddField.jsx`

- [x] Added ThemeContext import
- [x] Replaced 4 hardcoded classes: addFieldRow, addButton/addButtonError, addButtonContent, addButtonIcon
- [x] Removed unused `theme` prop from component signature

#### Step 4b: Update `MetadataComp/components/Metadata.jsx`

- [x] Added ThemeContext to DataSourceForm, CustomEntryForm, Metadata components
- [x] Replaced hardcoded `customTheme.field` with `t.metadataFieldTheme`
- [x] Replaced grid layouts: `customGrid4`, `customGrid6`
- [x] Replaced `metadataHeader` class

#### Step 5: Create `components/validateComp.theme.js`

- [x] Created with ~20 theme keys covering main layout, stat boxes, re-validate button, mass-update modal, column header badges

#### Step 6: Update `components/ValidateComp.jsx`

- [x] Added ThemeContext import and validateCompTheme fallback
- [x] **RenderMassUpdater**: replaced all hardcoded classes with theme keys, removed inline `style={{backgroundColor}}` (now `bg-black/40` in theme), replaced 2 native `<button>` → `UI.Button`
- [x] **Main Validate**: replaced container/innerWrapper/headerRow, stat boxes, section header with theme keys, replaced native `<button>` for Re-Validate → `UI.Button`
- [x] **Column header displayFn**: replaced columnHeader, errorBadgeGroup, errorCount, filterToggle with theme keys

#### Step 7: Fix Breadcrumbs hardcoded color

- [x] Added `homeLink: 'hover:text-[#bbd4cb] text-[#679d89]'` to `breadcrumbsTheme`
- [x] Replaced hardcoded `className="hover:text-[#bbd4cb] text-[#679d89]"` with `t.homeLink`

#### Step 8: Register new themes in `defaultTheme.js`

- [x] Added `metadataCompTheme` and `validateCompTheme` imports and registrations

#### Step 9: Build verification

- [x] `npm run build` — no compile errors (24.20s, 2532 modules)

#### Steps 10–11: Route verification + Theme override test

- [ ] Manual: DatasetsList page renders correctly
- [ ] Manual: Tasks/TaskPage pages render with breadcrumbs
- [ ] Manual: Source detail pages render with metadata editor, validate tab, admin tab
- [ ] Manual: Theme overrides propagate from site config to all themed components

#### Summary

**New files** (2): `metadataComp.theme.js` (~30 keys), `validateComp.theme.js` (~20 keys)

**Modified files** (7): `MetadataComp/index.jsx`, `RenderField.jsx`, `RenderAddField.jsx`, `Metadata.jsx`, `ValidateComp.jsx`, `Breadcrumbs.jsx`, `defaultTheme.js`

**Key changes**: 3 native `<button>` → `UI.Button`, ~50 hardcoded classNames → theme keys, 1 hardcoded hex color → theme key, 1 inline style removed

#### Out of scope (future work)

These files have extensive hardcoded styles but are deeper feature pages, not core infrastructure:

- `components/ExternalVersionControls.jsx` — modal controls, native checkboxes/radios/selects
- `components/upload.jsx` — file upload form, drop zones, native inputs/selects
- `pages/dataTypes/default/overview.jsx` — data display layout, inline table theme
- `pages/dataTypes/default/admin.jsx` — access control panels, native inputs
- `pages/DatasetsList/categories.jsx` — category editor, native inputs
- `pages/dataTypes/gis_dataset/pages/Create/` — GIS creation workflow pages

---

## Key Principles

- **Context wrapper only in siteConfig** — Layout belongs in individual pages
- **Every className should come from theme or UI component** — no raw Tailwind in page-level code
- **UI components for all interactive elements** — Button, Input, Select, Dialog, Table, Tabs, Icon
- **Pattern-specific theme keys** — `theme.datasets.*` not borrowed `theme.page.*`
- **Shared code extracted** — context setup, nav item builders, breadcrumb rendering
