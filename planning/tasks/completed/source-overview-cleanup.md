# Source Overview Cleanup

## Objective

Clean up the source overview page (`overview.jsx`) in the datasets pattern. Constrain the layout like DatasetsList, remove height constraints from tables, show both `display_name` and column `name`, tighten the UI to align with the DatasetsList style, and add a theme entry for this page.

## Current State

**File**: `pages/dataTypes/default/overview.jsx`

This is a single page used for both internal (`isDms=true`) and external (`isDms=false`) sources — no merging needed.

### Current Problems

#### 1. No width constraint
The overview renders as a bare `<div className="flex flex-col">` with no max-width or centering. DatasetsList uses `max-w-6xl mx-auto w-full` via theme key `pageWrapper`. The overview should match.

#### 2. All styles hardcoded
Every class is hardcoded in JSX — nothing goes through theme keys:
- Title: `text-2xl text-blue-600 font-medium`
- Description wrapper: `w-full md:w-[70%] pl-4 py-2 sm:pl-6 ... text-sm text-gray-500 pr-14`
- Metadata labels: `text-sm text-gray-600`, values: `text-l font-medium text-blue-600`
- Column section header: `flex items-center p-2 mx-4 text-blue-600`
- Badge: `bg-blue-200 text-blue-600 text-xs p-1 ml-2 ... border border-blue-300`
- "See more" link: `float-right text-blue-600 underline text-sm`
- Table wrapper: `w-full p-4`
- Local `tableTheme()` function with hardcoded colors/sizes

#### 3. Column name display
The columns table shows `display_name` (or falls back to `name`) and `type` on one line. It should show both `display_name` AND `name` so users can see the human-readable label alongside the actual column identifier.

#### 4. Table height constraints
The columns table is hard-limited to 15 rows with a "see more/less" toggle. In this context (an overview page, not a dashboard widget), the table should show all columns without pagination or height caps.

#### 5. Local `tableTheme()` function
The exported `tableTheme()` factory at the top of `overview.jsx` duplicates styling that should come from the pattern theme. It's also exported and used by other files — need to check consumers.

#### 6. Inconsistent metadata layout
The right sidebar uses a mix of `sm:grid sm:grid-cols-2` (for update_interval and categories) and plain `flex flex-col` (for created/updated/type). The layout is inconsistent and has too much padding.

#### 7. Source tabs (SourceNav) jitter + gap + no active state
The `SourceNav` component in `sourcePageSelector.jsx` has three problems:
- **Jitter on hover**: Inactive tabs use `hover:border-b-2` with no border when idle. Adding a 2px border on hover shifts layout. Fix: add `border-b-2 border-transparent` to all tabs so the border space is always reserved.
- **Gap below tabs**: There is padding between the tab bar and the white content area below (`LayoutGroup`). The tab underline should sit directly on the content section's top edge.
- **No active state tracking**: The `page` param determines which tab is active, but the match logic only checks `p.name === page`. For the Overview tab (`href: ''`), `page` is `undefined` — it should match on `href` not `name`. Active tab should show `border-blue-600`, inactive `border-transparent` (hover: `border-gray-300`).
- **Admin tab order**: Admin is listed second in `navPages` (`[Overview, Admin, ...sourcePagesNavItems]`), but it should always be the last tab. Currently source-type tabs (Table, Upload, Validate, Map, etc.) appear after Admin.

#### 8. Loading flash
`sourcePageSelector.jsx:80` has an early return `if(!source.id && !source.source_id) return loading ? 'loading' : <></>;` that bails out before rendering Layout, Breadcrumbs, or tabs. The page should render its full shell (Layout + Breadcrumbs + SourceNav + LayoutGroup) on first render, then fill in source data as it loads. The guard should be moved inside the Page content area, not block the entire component.

#### 9. Tab bar needs left padding
The tab bar container has no left padding, so tabs sit flush against the left edge while content below has padding from LayoutGroup's `wrapper2` (`p-4`).

#### 10. Tabs still not flush on content
Despite `pb-0` on the tab bar, LayoutGroup's `wrapper1` has `p-2` which adds spacing between the tab bar and the white content box (`wrapper2`). The tab underlines need to visually touch the top edge of the white `bg-white rounded-lg shadow-md` box.

#### 11. max-w-6xl constraint not visible
The `pageWrapper` constraint (`max-w-6xl mx-auto`) is inside `overview.jsx` but the breadcrumbs, tabs, and LayoutGroup are rendered in `sourcePageSelector.jsx` outside it — the constraint needs to wrap the entire content area in sourcePageSelector, not just the page component.

## Files

| File | Action |
|------|--------|
| `pages/dataTypes/default/sourceOverview.theme.js` | Theme keys for overview page (co-located) |
| `pages/dataTypes/default/overview.jsx` | Replace hardcoded classes with theme keys, fix column display, remove table height cap |
| `pages/sourcePage.theme.js` | Theme keys for SourcePage (pageWrapper, tabs) |
| `pages/SourcePage.jsx` | Renamed from `sourcePageSelector.jsx` — fix SourceNav tabs, loading flash, layout |
| `defaultTheme.js` | Register `sourceOverview` + `sourcePage` themes |
| `siteConfig.jsx` | Update import + references to `SourcePage` |

## Implementation

### Phase 1: Theme + layout constraints — DONE

#### Step 1: Create `sourceOverview.theme.js`

Created theme file with ~18 keys covering: page layout (`pageWrapper`), header (`title`), body (`body`, `descriptionCol`, `metadataCol`), metadata (`metaItem`, `metaLabel`, `metaValue`, `metaEditRow`, `metaEditInner`), pencil (`pencilWrapper`, `pencilIcon`), sections (`sectionHeader`, `sectionBadge`), tables (`tableWrapper`, `columnName`, `columnActualName`, `columnType`, `versionsWrapper`).

- [x] Create `components/sourceOverview.theme.js`
- [x] Register in `defaultTheme.js`

#### Step 2: Apply theme keys to overview.jsx

- [x] Import ThemeContext, get `theme?.datasets?.sourceOverview`
- [x] Add `pageWrapper` (max-w-6xl mx-auto) wrapping all content
- [x] Replace hardcoded title, description, metadata classes with theme keys
- [x] Replace local `tableTheme()` calls with `theme?.datasets?.table` (shared `sourceTableTheme`)
- [x] Removed exported `tableTheme()` function (no external consumers)
- [x] RenderPencil now accepts `theme` prop instead of hardcoded classes

#### Step 3: Fix column name display

Shows both names: `display_name` (primary, bold) + `name` (secondary, muted, only when different from display_name) + `type` (italic).

- [x] Update column `Comp` to show both names

#### Step 4: Remove table height constraint

- [x] Removed `pageSize` state and "see more/less" toggle
- [x] Pass full `columns` array to Table (no `.slice()`)

#### Step 5: Tighten metadata layout

All metadata items now use consistent `metaItem` / `metaLabel` / `metaValue` pattern. Removed `sm:grid sm:grid-cols-2` / `dt`/`dd` elements. All fields use flex-col with tight gap-1 spacing.

- [x] Standardize all metadata items to use the same theme-driven layout

#### Step 6: Build + verify

- [x] `npm run build` passes
- [ ] Internal source overview renders correctly
- [ ] External source overview renders correctly
- [x] All visual changes captured in theme keys

### Phase 2: Fix source tabs (SourceNav) — DONE

#### Step 1: Add tab theme keys to `sourceOverview.theme.js`

Added 5 keys: `tabNav`, `tabBar`, `tab` (base with `border-b-2`), `tabActive` (`border-blue-600`), `tabInactive` (`border-transparent hover:border-gray-300`).

- [x] Add tab keys to `sourceOverview.theme.js`

#### Step 2: Fix SourceNav in `sourcePageSelector.jsx`

- [x] Import ThemeContext, resolve `theme?.datasets?.sourceOverview`
- [x] All tabs get `border-b-2 border-transparent` base (eliminates jitter) — `border-b-2` is in `tab` base class
- [x] Active tab gets `border-blue-600` — match on `p.href === (page || '')` (Overview: `page` undefined → `''` matches `href: ''`)
- [x] Tab bar wrapper uses `pb-0` to sit flush on content below
- [x] Apply theme keys with inline fallbacks
- [x] Move Admin tab to end — `[overviewNav, ...sourcePagesNavItems, adminNav]`

#### Step 3: Build + verify

- [x] `npm run build` passes
- [ ] Tabs don't jitter on hover
- [ ] Active tab shows blue underline
- [ ] Tab underline sits flush on content area
- [ ] Overview tab is active when `page` param is undefined
- [ ] Admin tab appears last after all source-type tabs

### Phase 3: Layout shell, constraint, tab gap — DONE

#### Step 1: Move max-w-6xl to sourcePageSelector

Wrapped Breadcrumbs + tab bar in `pageWrapper` div in `sourcePageSelector.jsx`. LayoutGroup remains outside the wrapper (it has its own full-width styling). Removed `pageWrapper` from `overview.jsx` — the inner page now uses a plain `flex flex-col` wrapper.

- [x] Add `pageWrapper` wrapper div around Breadcrumbs + tab bar in `sourcePageSelector.jsx`
- [x] Remove `pageWrapper` from `overview.jsx` (inner page no longer needs it)

#### Step 2: Eliminate loading flash

Removed the early return guard. Replaced with `sourceLoaded` boolean. Layout + Breadcrumbs + SourceNav always render. Inside LayoutGroup, a ternary shows Page when loaded or a "Loading..." placeholder when not. Source-dependent values (`sourcePages`, `sourcePagesNavItems`) safely default to empty when source not loaded. Breadcrumb name falls back to `'...'` while loading. Also added `?.` to `source?.type` in SourceNav prop to prevent crash on empty source.

- [x] Remove early return guard at line 80
- [x] Show loading/empty state inside LayoutGroup instead of blocking the whole component
- [x] Source-dependent values (sourceType, sourcePages, sourcePagesNavItems, allNavItems, Page) need safe defaults when source is empty

#### Step 3: Fix tab bar left padding and flush alignment

Updated `tabBar` theme key to include `pl-2 items-end`. The pageWrapper div closes before LayoutGroup so the tab border sits at the bottom of the constrained area, directly above LayoutGroup's white content box. Note: the remaining visual gap between tabs and content is LayoutGroup's `wrapper1` padding (`p-2`) which is theme-controlled and can be adjusted site-wide — not overridden here.

- [x] Add left padding to tab bar (`pl-2` in theme)
- [x] Tab bar positioned directly above LayoutGroup

#### Step 4: Build + verify

- [x] `npm run build` passes
- [ ] Page renders Layout + tabs immediately, data fills in after load
- [ ] Tabs sit flush on white content area
- [ ] max-w-6xl constraint visible on breadcrumbs, tabs, and content
- [ ] No loading flash

### Phase 4: Rename + theme split — DONE

#### Step 1: Rename `sourcePageSelector.jsx` to `SourcePage.jsx`

- [x] Rename file from `sourcePageSelector.jsx` to `SourcePage.jsx`
- [x] Update import in `siteConfig.jsx` (line 13)
- [x] Update component references in `siteConfig.jsx` (lines 94, 104): `SourcePageSelector` → `SourcePage`

#### Step 2: Split SourcePage theme from sourceOverview theme

SourcePage uses its own layout/tab keys (`pageWrapper`, `tabBar`, `tabNav`, `tab`, `tabActive`, `tabInactive`), while overview.jsx uses content-specific keys. These were previously all in `sourceOverview.theme.js`.

- [x] Create `pages/sourcePage.theme.js` with SourcePage-specific keys (6 keys)
- [x] Remove those keys from `pages/dataTypes/default/sourceOverview.theme.js`
- [x] Update theme resolution in `SourcePage.jsx`: `fullTheme?.datasets?.sourcePage`
- [x] Register `sourcePage: sourcePageTheme` in `defaultTheme.js`

#### Step 3: Build + verify

- [x] `npm run build` passes
- [x] No stale `SourcePageSelector` or `sourcePageSelector` references remain
- [ ] Source pages render correctly with split themes

## Verification

- [x] Overview page has `max-w-6xl mx-auto` constraint matching DatasetsList
- [x] Columns table shows all columns (no 15-row cap)
- [x] Columns table shows both `display_name` and `name`
- [x] No hardcoded classes in JSX — all via theme keys (with fallback defaults)
- [x] Theme registered in `defaultTheme.js` as `sourceOverview`
- [x] Metadata sidebar has consistent, tight layout
- [x] Blue/gray color palette consistent with DatasetsList
- [ ] Both internal and external source overviews render correctly
- [ ] Source tabs don't jitter on hover (transparent border when idle)
- [ ] Active tab shows blue underline, matches current page
- [ ] Tab underline sits flush on white content below
- [ ] Admin tab appears last
- [ ] No loading flash — shell renders immediately
- [ ] max-w-6xl constraint visible on all content (breadcrumbs, tabs, page)
- [ ] Tab bar has left padding aligned with content
- [x] `npm run build` passes
