# Datasets Create Page

## Objective

Extract the dataset creation flow from the modal in DatasetsList into a dedicated create page at its own route. The "Add dataset" button on the list page should become a link to this new page instead of toggling a modal.

## Current State

**File**: `pages/DatasetsList/index.jsx`

The `RenderAddPattern` component (lines 100–163) renders a modal with:
1. A **Select** dropdown with three option groups:
   - "Create new" (empty value)
   - Existing sources (cloneable, filtered by `doc_type`)
   - Data types from `damaDataTypes` (e.g., `csv_dataset`, `gis_dataset`)
2. A **name input** field
3. Submit logic:
   - If a `damaDataTypes[type].sourceCreate.component` exists (e.g., gis_dataset's multi-step upload wizard), it renders that component inline in the modal
   - Otherwise, a simple "add" button clones/creates the source, appends to the sources array, calls `updateData()`, and does `window.location.reload()`

The "Add" button (line 217) toggles `isAdding` state which shows/hides the modal inline.

### Problems

- Modal is too small for complex create flows (gis_dataset's 4-step upload wizard renders inside it)
- `window.location.reload()` after create is a poor UX — full page refresh
- No shareable URL for the create flow
- Modal state is lost if user navigates away

## Proposed Changes

### New Route

Add a `/create` child route in `siteConfig.jsx` alongside the existing routes:

```
datasets/
├── ""                                  (DatasetsList)
├── "create"                            (NEW — CreatePage)
├── "tasks"                             (Tasks)
├── "task/:etl_context_id"              (TaskPage)
├── "source/:id/:page?/:view_id?"       (SourcePage view)
└── "internal_source/:id/:page?/:view_id?" (SourcePage edit)
```

### New Page Component

`pages/CreatePage.jsx` — a full page that replicates and improves on the modal flow:

1. **Layout + Breadcrumbs** — matches other source pages (Layout shell, breadcrumb trail: Datasets → Create)
2. **Type selector** — same three option groups as the current modal Select (create new / clone existing / external data type)
3. **Name input** — dataset name field
4. **External create component** — if the selected type has a `sourceCreate.component`, render it with full page width (no modal constraint)
5. **Simple create** — if no external component, show a create button that:
   - Creates the source via `apiUpdate` / `updateData`
   - Navigates to the new source page (no `window.location.reload()`)

### DatasetsList Changes

- Replace the "Add" button's `onClick` handler with a `<Link to={`${baseUrl}/create`}>` (or equivalent navigation)
- Remove `RenderAddPattern` component and `isAdding` state
- Remove the modal-related imports/code (if modal component is no longer used elsewhere)

## Reference

The old DataManagerClient (`references/DataManagerClient/`) handled creation via:
- `Source/create.jsx` — source creation form
- `DataTypes/gis_dataset/pages/Create/` — 4-step wizard (upload → select layer → schema editor → publish)
- The current DMS gis_dataset already has this wizard at `pages/dataTypes/gis_dataset/pages/Create/index.jsx`

The key `sourceCreate.component` convention is already in place:
- `gis_dataset/index.js` exports `sourceCreate: { name: "Create", component: CreatePage }`
- `csv_dataset/index.js` also exports a `sourceCreate` pointing to the same gis_dataset Create component
- `internal_dataset` has no `sourceCreate` (uses upload/validate pages instead)

## Files

| File | Action |
|------|--------|
| `pages/CreatePage.jsx` | Create — new page component |
| `pages/createPage.theme.js` | Create — theme keys for create page |
| `siteConfig.jsx` | Add `/create` route, import CreatePage |
| `pages/DatasetsList/index.jsx` | Replace Add button with Link, remove modal code |
| `defaultTheme.js` | Register createPage theme |

## Implementation

### Phase 1: Create page + route — DONE

- [x] Create `pages/CreatePage.jsx` with Layout, Breadcrumbs, type selector, name input
- [x] Create `pages/createPage.theme.js` with relevant keys (6 keys: pageWrapper, heading, form, fieldLabel, actions, externalWrapper)
- [x] Register theme in `defaultTheme.js`
- [x] Add `/create` route in `siteConfig.jsx` (path: "create", action: "edit")
- [x] Handle simple create flow (non-external types): create source via apiUpdate, navigate back to datasets list
- [x] Handle external create flow: render `sourceCreate.component` at full page width (gis_dataset/csv_dataset upload wizard)
- [x] Handle clone flow: detect existing source selection, clone with incremented copy name
- [x] `npm run build` passes

### Phase 2: Update DatasetsList — DONE

- [x] Replace Add button with `<Link to={`${baseUrl}/create`}>` (Icon stays the same)
- [x] Remove `RenderAddPattern` component (entire function + Modal/Select usage)
- [x] Remove `isAdding` state, `updateData` helper, `damaDataTypes`/`parent` from context destructuring
- [x] Remove unused `cloneDeep` import
- [x] `npm run build` passes

## Verification

- [ ] `/create` route renders the create page with Layout + Breadcrumbs
- [ ] Type selector shows: create new, existing sources, data types
- [ ] Selecting gis_dataset/csv_dataset renders the full upload wizard at page width
- [ ] Simple create (no external component) creates source and navigates to it
- [ ] Clone flow works: clones source, navigates to clone
- [ ] DatasetsList "Add" button navigates to create page
- [ ] No `window.location.reload()` anywhere in the flow
- [ ] `npm run build` passes
