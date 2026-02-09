# DatasetsList Style Cleanup

## Objective

Fix layout and spacing issues on the DatasetsList page, then do a design pass to tighten up the overall look. All visual changes must go through theme keys in `datasetsList.theme.js` — no hardcoded class changes in JSX.

## Current State

The DatasetsList page (`pages/DatasetsList/index.jsx`) renders inside `<Layout>` → `<LayoutGroup>`. The current problems:

### Problem 1: Container background
LayoutGroup's default `wrapper2` applies `bg-white shadow-md rounded-lg p-4` to the entire content area. The user wants the page container to be transparent (inherit parent bg), with only the sidebar categories and source cards having their own backgrounds.

**Current stack:**
```
Layout (bg-slate-100 from site theme)
  └─ LayoutGroup wrapper1 (p-2)
       └─ LayoutGroup wrapper2 (bg-white shadow-md rounded-lg p-4 ← THIS IS THE PROBLEM)
            ├─ toolbar (search + buttons)
            └─ body (flex-row)
                 ├─ sidebar (category list — items already have bg-white)
                 └─ sourceList (source cards — cards already have bg-white)
```

**Fix:** Use LayoutGroup `activeStyle={1}` (the "header" style) which removes bg-white/shadow/rounded/padding from wrapper2. The sidebar and source cards already have their own `bg-white` via theme keys.

### Problem 2: No spacing between breadcrumbs, search, and list
Currently the DatasetsList page does NOT render `<Breadcrumbs>`. Other dataset pages (Tasks, source detail) do. The toolbar and body divs have no gap between them either.

**Fix:** Add `<Breadcrumbs>` to the DatasetsList page (with a home/Database icon link). Add spacing theme keys for gaps between breadcrumbs → toolbar → body.

### Problem 3: Fixed height / doesn't fill screen
Both `sidebar` and `sourceList` use `max-h-[80dvh]` which caps them to 80% of viewport height, leaving empty space below. The content should grow to fill available screen space.

**Fix:** Remove `max-h-[80dvh]` from both. The `flex-1` on LayoutGroup's wrappers combined with Layout's `min-h-svh` will allow content to fill the page naturally. Use `overflow-auto` with `flex-1` to get scrolling when content exceeds available space.

### Problem 4: Design pass
After fixing the structural issues, tighten up the design:
- Card spacing, padding, hover states
- Sidebar item styling, active state contrast
- Toolbar alignment and icon sizing
- Typography hierarchy (source name vs type vs description)
- Category badge styling
- Overall consistent spacing rhythm

**All changes must be theme-key-driven** so sites can override them.

## Files

| File | Action |
|------|--------|
| `components/datasetsList.theme.js` | Update theme keys (primary file) |
| `pages/DatasetsList/index.jsx` | Add Breadcrumbs, set LayoutGroup activeStyle, add any new theme key usage |
| `defaultTheme.js` | No change needed (datasetsList already registered) |

## Implementation

### Phase 1: Layout fixes (container, height, spacing) — DONE

#### Step 1: Remove LayoutGroup wrapper
- [x] Originally used `<LayoutGroup activeStyle={1}>`, but LayoutGroup's `wrapper3` is a plain div (empty className) that breaks the flex chain — `flex-1` on our container had no effect since wrapper3 isn't a flex item
- [x] Removed LayoutGroup entirely — container div is now a direct child of Layout's `childWrapper` (`flex flex-col`), so `flex-1` works and content fills remaining height

#### Step 2: Add Breadcrumbs
- [x] Import `Breadcrumbs` from `../../components/Breadcrumbs`
- [x] Added `<Breadcrumbs items={[{icon: 'Database', href: baseUrl}]} />` before LayoutGroup

#### Step 3: Fix height constraint
- [x] Removed `max-h-[80dvh]` from `sidebar` and `sourceList`
- [x] Added `flex-1 min-h-0` to `body` for flex-based sizing

#### Step 4: Add spacing
- [x] Added `container` theme key: `flex flex-col flex-1 min-h-0 gap-4 p-4`
- [x] Wrapped toolbar + body in `<div className={t.container}>` in JSX

#### Step 5: Build + verify
- [x] `npm run build` passes (22.77s)

### Phase 2: Design pass — DONE

#### Step 6: Tighten source cards
- [x] `sourceCard`: added `rounded-lg`, softened to `shadow-sm`, `border-gray-200`, hover `bg-slate-50`, added `transition-colors`
- [x] `sourceTitle`: `text-base font-semibold`, blue link color (`text-blue-700 hover:text-blue-900`), `transition-colors`
- [x] `sourceTypeLabel`: de-emphasized to `text-xs text-gray-400`, added `ml-2` spacing
- [x] `sourceDescription`: `text-sm text-gray-500 line-clamp-2`, tighter top padding (`pt-1`)
- [x] `sourceCategoryBadge`: pill shape (`rounded-full`), lighter bg (`bg-blue-50`), tighter padding

#### Step 7: Tighten sidebar
- [x] `sidebarItem`: `px-3 py-2 rounded-lg`, added `text-sm text-gray-700 transition-colors`
- [x] `sidebarItemActive`: stronger contrast (`bg-blue-100 text-blue-800 font-medium`)
- [x] `sidebarBadge`: `rounded-full`, lighter (`bg-blue-100`), removed border, `ml-auto` alignment
- [x] Changed sidebar `space-y-1.5` → `gap-1` for tighter spacing

#### Step 8: Tighten toolbar
- [x] Added `toolbarSearch: 'flex-1'` key, wrapped Input in it — search grows to fill space
- [x] Added `gap-1` to toolbar for consistent button spacing

#### Step 9: Overall rhythm
- [x] Consistent `rounded-lg` across cards and sidebar items
- [x] Consistent `gap-2`/`gap-3` spacing scale
- [x] Blues for interactive (links, badges, active states), grays for passive (text, borders)
- [x] `transition-colors` on all interactive elements

#### Step 10: Build + verify
- [x] `npm run build` passes (23.89s)

### Phase 3: Performance upgrades — DONE

#### Problem 1: Sources flash empty on every mount (cache miss on return navigation)

`sources` is initialized as `useState([])`. When navigating back to the list from a source page, the component remounts (DmsManager swaps child components by path). Even though Falcor has the data cached, `getSources` is async — it goes through `falcor.get()` which returns a Promise that resolves near-instantly from cache but still triggers an async render cycle: empty list → populated list. This is the visible flash.

**Fix:** Use a module-level `Map` to cache the processed sources array, keyed by `${format.app}-${siteType}`. Initialize `useState` with the cached value. The `useEffect` still runs (to refresh from Falcor / handle staleness), but the initial render shows cached data immediately.

```jsx
const sourcesCache = new Map();
// ...
const cacheKey = `${format?.app}-${siteType}`;
const [sources, setSources] = useState(() => sourcesCache.get(cacheKey) || []);

useEffect(() => {
    getSources({envs, falcor, apiLoad, user}).then(data => {
        setSources(data);
        sourcesCache.set(cacheKey, data);
    });
}, [format?.app, siteType]);
```

#### Problem 2: SourceThumb uses index key

`key={i}` means React can't stably reconcile cards when filtering or sorting changes order. Every filter/sort change unmounts and remounts every card.

**Fix:** Use `key={source.source_id || source.id || i}` for stable identity.

#### Problem 3: SourceThumb re-renders unnecessarily

Every keystroke in the search input, every sort toggle, every category click causes ALL SourceThumb cards to re-render — even cards whose data hasn't changed. The `Lexical` ViewComp inside each card is particularly expensive.

**Fix:** Wrap `SourceThumb` in `React.memo()`. Since `source` and `format` are reference-stable (from state/context), memo will skip re-renders for unchanged cards.

#### Problem 4: Derived data recomputed on every render

`envs` (via `buildEnvsForListing`), `categories`, and `categoriesCount` are all recomputed on every render. These are pure derivations of `datasources`, `format`, and `sources` — they should be memoized.

**Fix:**
- `envs`: `useMemo(() => buildEnvsForListing(datasources, format), [datasources, format])`
- `categories`: `useMemo` depending on `[sources]`
- `categoriesCount`: `useMemo` depending on `[sources, categories]`

#### Implementation steps

- [x] Step 1: Add module-level `sourcesCache` Map, initialize `useState` from it, update cache in `useEffect`
- [x] Step 2: Change SourceThumb `key={i}` to `key={source_id}`
- [x] Step 3: Wrap `SourceThumb` in `React.memo()`
- [x] Step 4: Memoize `envs`, `categories`, `categoriesCount` with `useMemo`
- [x] Step 5: Build + verify (22.34s)

## Verification

- [ ] Container has no background (inherits from Layout's bg-slate-100 or site theme)
- [ ] Sidebar category items have their own backgrounds
- [ ] Source cards have their own backgrounds
- [ ] Breadcrumbs render above search toolbar
- [ ] Visible spacing between breadcrumbs, search, and list
- [ ] Page content fills available screen height (no 80dvh cap)
- [ ] Sidebar scrolls independently when categories overflow
- [ ] Source list scrolls independently when sources overflow
- [ ] All visual changes are captured in theme keys (no hardcoded classes in JSX)
- [ ] `npm run build` passes
- [ ] Other dataset pages (source detail, tasks) still render correctly
