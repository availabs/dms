# A reload of the page on screen keeps its sections; link pages redirect from the loader

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** done (2026-11-27, owner: committed and deployed) · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

Found 2026-11-25 while tracing why FUSION's `reports` and `export` pages sent every data request three times
(`uda-result-cache.md`, "The triple fetch on reports and export, traced"). Two separate problems, both on the
full-site path (a page not served as static HTML with islands).

## What was wrong

1. **Every section fetched again after each of sync's two start-up loads.** Preload on, islands off, one load
   of FUSION national-overview: 128 data requests for 59 distinct, although the page HTML carried the rows
   for 31 of its 34 data sections.
   - Each start-up load ends in `router.revalidate()` (`render/spa/dmsSiteFactory.jsx`). The loader ran with
     `reload: true`, the page pattern skipped the preload (`section-data-query-repeats.md`, step 2a) and
     returned the sections without rows.
   - `dms-manager/wrapper.jsx` builds its attributes again on such a render, and `getViewComp`
     (`dms-manager/_utils.jsx`) returns a new wrapper function for the `sections` array attribute each time.
     `sectionGroup.jsx` held it with `useMemo(…, [])`, but the React Compiler (production builds only)
     re-derives a memo's dependencies and compiled it to a plain expression. So every band got a new
     component type and its content was rebuilt: 7,058 of 7,345 elements, twice per load.
   - The rebuilt sections started from the row-less settings and fetched.
   - Step 2a's fix looked complete only because of the rebuild. With the rebuild alone removed, the
     sections' "sync when value changes" effect (`dataWrapper/index.jsx`) replaced their rows with the
     row-less settings and they did not fetch (same fetch key): the page dropped to 2,962 elements.
2. **A link page booted the whole site to redirect.** A page with `nav_link` and no sections (FUSION
   `reports` → `/fusion/national-overview`, `export` → `/fusion/explore#method`) was served as an empty
   shell; the browser loaded the full site, redirected with `<Navigate>` (`patterns/page/pages/view.jsx`) and
   built the destination there with no server HTML and no preloaded rows.

## What was built

- [x] **The band's section list component is held in state** (`patterns/page/components/sections/sectionGroup.jsx`):
      `useState(() => …)` in place of `useMemo(…, [])`. Nothing is rebuilt on a reload.
- [x] **An unchanged reload keeps the page on screen.** `render/dmsPageFactory.jsx` hands the preload hook the
      loader data on screen (`shown`, with `reload`). The page pattern's hook (`patterns/page/siteConfig.jsx`)
      calls `keepShownPage` (`api/preloadSectionData.js`): when the page row and each published section have
      the same id and save time as on screen, the fresh data is returned with that page swapped for the shown
      one. Otherwise the reload preloads like a first load, so a change arriving through sync shows with its
      rows (it did not before: the open question in `section-data-query-repeats.md`).
  - Save times are compared as instants: the server's route gives `2026-11-25 19:11:39.994597+00` and sync's
    local copy `2026-11-25T19:11:39.994Z` for the same save. Without that, sync's second load looked like a
    changed page and the browser preloaded once more (49 requests).
- [x] **A link page's URL is answered by the loader with a redirect** (`patterns/page/pages/_utils/linkPage.js`
      `linkPageTarget`, thrown from the page pattern's preload hook): a 302 from the server, a router redirect
      on an in-app navigation. Left to the view as before: an edit route, a page with `authPermissions`, a
      `sub://` link on the server, a link that is neither a full URL nor a path from the root, a link to the
      page's own URL.
- [x] `documentation/extension-points.md`: a row for the `preload` hook on a `siteConfig` entry.
- [x] Tests: `packages/dms/tests/pageReloadKeepsSections.test.js` (7).

## Measured (2026-11-25, FUSION on the hub data, test server 5558, preload on, cache on)

Data requests for one load on the full-site path (islands off), build `nav1` → build `reload2`:

| Page | Before | After |
|---|---|---|
| national-overview | 128 (59 distinct) | 10, none repeated |
| reports (link to national-overview) | 177 (59 distinct) | 10, none repeated |
| hazard | 48 (23 distinct) | 2 |
| explore | 58 (28 distinct) | 2 |

- Elements rebuilt after sync's first load, national-overview: 7,058 of 7,345 → 0.
- `GET /fusion/reports` → `302 Location: /fusion/national-overview`; `GET /fusion/export` →
  `302 Location: /fusion/explore#method`.

## Not done

- `getViewComp` / `getEditComp` still return a new function per call; any other holder of an array
  attribute's component across renders has the same exposure under the compiler.
- Other `useMemo(…, [])` guards in the library may be compiled away the same way. Not audited.
- A section that fetched its own rows (not preloaded) and whose page was saved since still gets its settings
  replaced on the reload; unchanged from before.
- Not checked in a signed-in browser or in the editor.

### Full test on the new build (2026-11-25, 21:10)

14 pages, five runs, one at a time, islands on, preload on, cache on: run
`2026-11-25-2110-fusion-full-reload2-cache-on` against `2026-11-25-2025-fusion-full-preload-cache-on`.

- Warm load: reports 4.06 → 2.06 s, export 3.84 → 1.60 s (each now matches its destination page). The other
  twelve pages unchanged, as expected: islands pages do not start sync.
- Median warm load 1.46 → 1.44 s, median click 0.61 → 0.60 s, 8-click journey 5.40 → 5.32 s.
- Library suite: 992 pass, the same 15 failures in 7 files as before this change.
