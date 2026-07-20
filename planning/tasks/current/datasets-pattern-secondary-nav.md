# Datasets pattern — consume `theme.navOptions.secondaryNav` like the page pattern

> Driven by the Freight Atlas shared-nav task
> (`planning/transportny/tasks/current/freight-atlas-secondary-nav.md` in the workspace root planning
> hub): the `freight_data` datasets pattern (2186526) must render the same secondary sidenav as the
> `freightatlas2_copy` page pattern (2175436) so the two navigate to each other.

## Objective

A datasets pattern whose theme sets `layout.options.sideNav.nav = "secondary"` (or topNav) should render
`theme.navOptions.secondaryNav.navItems` in its Layout chrome, exactly as the page pattern does.

## Current State

- Page pattern (`patterns/page/pages/view.jsx:68-71`, `edit/index.jsx:64-66`) computes
  `dataItemsNav(theme?.navOptions?.secondaryNav?.navItems || [], baseUrl, isEdit)` and passes it as
  `secondNav` to `<Layout>`. `Layout.jsx` maps `sideNav.nav/topNav.nav = "secondary"` → `secondNav`.
- All 7 datasets pages render `<Layout navItems={[]}>` with **no** `secondNav`: DatasetsList/index.jsx,
  SourcePage.jsx, SettingsPage.jsx, CreatePage.jsx, Tasks/UdaTasks.jsx, Tasks/UdaTaskPage.jsx,
  dataTypes/default/error.jsx. So `nav:"secondary"` yields an empty sidenav on datasets patterns.
- Cross-pattern imports datasets→page already exist (`datasets/components/ValidateComp.jsx`), so
  importing `dataItemsNav` from `../../page/pages/_utils` is in-pattern for this codebase.

## Changes made — DONE 2026-07-10

Cross-pattern imports are **forbidden** (precedent: `view-as.md` promoted `isUserAuthed` to
`utils/auth.js`), so the nav shaping was promoted to the shared utils layer instead of importing
page-pattern code:

1. **New `packages/dms/src/utils/nav.js`** — `dataItemsNav` + `getChildNav` moved verbatim from
   `patterns/page/pages/_utils/index.js`, with the page-specific in-page-rail lookup replaced by an
   injectable `getInPageMenuItems = () => []` parameter (4th/5th arg). Kept the label-row and
   className passthrough behavior (commit `60084351`). Dropped one dead local
   (`inPageChildrenForD`, computed-but-unused).
2. **`patterns/page/pages/_utils/index.js`** — `dataItemsNav`/`getChildNav` are now thin bindings of
   the utils versions with `(item) => getInPageNav(item)?.menuItems || []` injected, so page nav
   keeps its in-page anchor children and **every existing import site is unchanged** (view.jsx,
   edit/index.jsx, SearchPage.jsx).
3. **7 datasets pages** each compute the canonical read inline and pass it to Layout:
   ```js
   import { dataItemsNav } from "../../../utils/nav";   // depth-adjusted per file
   const menuItemsSecondNav = React.useMemo(
     () => dataItemsNav(theme?.navOptions?.secondaryNav?.navItems || [], '', false),
     [theme?.navOptions?.secondaryNav?.navItems]
   );
   <Layout navItems={[]} secondNav={menuItemsSecondNav}>
   ```
   - **baseUrl is `''`, not the datasets pattern's `base_url`** — datasets patterns mount at a
     sub-path (e.g. `/freight_data`); prefixing would break nav items pointing at sibling patterns
     (the whole point of a shared secondary nav). Items are authored site-absolute.
   - `UdaTasks.jsx` didn't read `ThemeContext` — added the standard read.
   - **BC:** no navItems configured → `[]`; existing datasets patterns keep `sideNav.nav:"main"` and
     render exactly as before. No signature or theme-shape changes for existing callers.

## Files changed

- `packages/dms/src/utils/nav.js` (new)
- `packages/dms/src/patterns/page/pages/_utils/index.js` (functions → bound re-exports)
- `packages/dms/src/patterns/datasets/pages/DatasetsList/index.jsx`
- `packages/dms/src/patterns/datasets/pages/SourcePage.jsx`
- `packages/dms/src/patterns/datasets/pages/SettingsPage.jsx`
- `packages/dms/src/patterns/datasets/pages/CreatePage.jsx`
- `packages/dms/src/patterns/datasets/pages/Tasks/UdaTasks.jsx`
- `packages/dms/src/patterns/datasets/pages/Tasks/UdaTaskPage.jsx`
- `packages/dms/src/patterns/datasets/pages/dataTypes/default/error.jsx`

## Testing Checklist

- [x] `freight_data` pattern (nav:"secondary" + navItems) renders the sidenav on the catalog list
      (Playwright, authed: ATLAS label + 5 items, correct hrefs, catalog filtered to 33 datasets).
- [ ] Per-source page / settings / create / tasks pages spot-checked live (same code path; not yet
      individually screenshotted).
- [x] Default datasets pattern (`/datasources`, no navItems, nav:"main") renders unchanged (authed
      Playwright: catalog + Data Sources/Docs chrome, no stray nav items).
- [x] Page-pattern regressions: tsmo2 secondaryNav all 9 items render; npmrds main nav
      (Home/Routes/Reports/Macro/PM3/Batch Report) renders — the _utils binding preserved behavior.
- [x] Label rows (`type:"label"`) render unlinked with their className (visible in shots).
- [x] Nav items with absolute `path` (`/freight_data?cat=…`) and bare `url_slug` both resolve.

## Known wart (pre-existing shape, noted for follow-up)

In **edit mode** the page pattern prefixes every secondary-nav path with `/edit` — a cross-pattern
item becomes `/edit/freight_data?cat=…`, which isn't a route on the page pattern. Same for any
absolute-path nav item; view mode (the audience for a secondary nav) is unaffected.

## Progress log

- 2026-07-10 — Task created with plan; driven by Freight Atlas shared-nav setup.
- 2026-07-10 — Implemented (utils/nav promotion + 7 pages), verified live with Playwright incl.
  tsmo2/npmrds/datasources regressions. Uncommitted in the submodule — awaiting Alex's review.
