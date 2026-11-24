# View pages as static HTML with islands, without server components

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** in progress: this is the chosen path (owner, 2026-11-24). Phase 1 (delivery without RSC) done; the RSC delivery is removed; now working on the three priorities below (click delay, more static section types, less JavaScript) · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

Written 2026-11-23, from the code review of the RSC task
([research/rsc-view-pages-code-review.md](../../research/rsc-view-pages-code-review.md), suggestion 14,
"measure the cheaper alternative") and the Remix 3 comparison (section "Five designs to copy if static
HTML with islands goes ahead"). Successor of [rsc-view-pages.md](../completed/rsc-view-pages.md), whose RSC delivery was removed on
2026-11-24 after the comparison below; that doc's appendix holds the removed sources.

## Objective

Serve a published page the way the RSC spike does (content as static HTML that is never hydrated, one
client component for the chrome, live sections mounted as islands) **on today's SSR pipeline**: no
`@vitejs/plugin-rsc`, no `unstable_` React Router APIs, no second build, one copy of the app in the server.
Then measure it against today's path and the RSC path on the same pages, and decide which to keep.

## Why

- In the spike no section runs as a server component. React Server Components do two jobs there: carry the
  chrome's props to the browser, and supply a router for clicks in the chrome. The gain (2 to 5 times faster
  to Complete) comes from not hydrating content and not loading Lexical, which is ordinary React.
- Remix 3 ships this page model (server HTML, `clientEntry` islands, HTML merged in on navigation) with no
  server-components payload. Its source is a worked design for the two hard parts: navigation, and
  refreshing a page without remounting its live sections.
- Several findings of the RSC code review disappear with one handler and one build: `invalidateRoutes` not
  reaching the RSC copy, memory doubling, the head tags from app settings missing.

What it gives up: the route to real server components (a section type that runs only on the server and
loads its own data). Streaming is still possible without them (phase 4, streaming late sections).

## Decided (owner, 2026-11-24)

- **This path goes ahead; the RSC path is removed, not frozen.** Done the same day: see the log.
- **Next effort, in this order of asking:** the click delay, widening the static section types, and sending
  less JavaScript to the browser ("Priorities" below). They come before phase 2 (one wire format for
  islands), phase 3 (navigation by merging HTML) and phase 4 (streaming late sections).

## The flag

- `DMS_ISLANDS=1` turns this path on. Off, every page is served by today's path.
- Responses carry `X-DMS-ISLANDS: served | pass: <reason>` and `x-dms-islands-count: <n>`.
- A route opts in with `islandsView: 'page-view'` in its `siteConfig` (was `serverComponent`).

## Where the code is

All in `packages/dms/src/render/islands/` (its `README.md` lists every file and what the host app
provides): `captureContext.js`, `servePage.js`, `islandData.js`, `entry.browser.jsx`, `ClientChrome.jsx`,
`StaticSlot.jsx`, `slotHtmlContext.js`, `IslandHost.jsx`, `SectionIslands.jsx`, `clientConfig.js`. Still to
come: `navigate.js` and `morph.js` (phase 3, navigation by merging HTML).

Outside it: the capture in `patterns/page/pages/view.jsx`, `components/sections/CapturedSection.jsx` and
`staticSections.js`, `pages/usePageViewState.js`, `captureRender` and `renderIslands` in
`render/ssr2/handler.jsx`, the mount in `render/ssr2/express/{setup,middleware}.mjs`, the registry keys
`serverStatic` / `serverIsland`, and the app's `vite.config.js` (a second client input, `build.manifest`,
four `@dms-host/*` aliases).

## Design

### Server

1. Express mount (`setup.mjs`), when `DMS_ISLANDS=1`: before today's SSR middleware, for a GET that accepts
   HTML.
2. **Decide before rendering where it can be known**: match the URL against the host's routes; when the
   matched route config has no `serverComponent`, pass straight to today's path with no capture. (RSC code
   review suggestion 6. It removes the double render for the editor, admin and datasets.)
3. Otherwise `handler.captureRender(request, { session })`, with the mount's own handler. Not eligible:
   remember the URL for 5 minutes (per user when signed in), pass to today's path.
4. Eligible: `renderToString` of `ClientChrome` with the island props, the three slots supplied through
   `SlotHtmlContext` (what `generateHTML.js` does now).
5. Fill the normal `index.html` template the way today's middleware does: the chrome HTML into `#root`,
   the title, theme fonts, the server-compiled site CSS link, the app-settings head tags. Replace the
   template's module script with the islands entry's hashed file (from the Vite manifest) and its
   `modulepreload`s. Add the island data as `<script type="application/json" id="dms-islands">`.
6. Headers as today's path: `Vary: Cookie`; `private, no-store` for a signed-in visitor.

### Browser

1. `entry.browser.js` reads `#dms-islands`, calls `configureRscClient` (to be renamed when the shared files
   move), then `hydrateRoot(#root, <RouterProvider>)` where the router is `createBrowserRouter` with one
   `*` route whose element is `ClientChrome` with three `StaticSlot`s.
2. `StaticSlot` reads its HTML back from the page, as now. `IslandHost` loads `SectionIslands` when the
   page has islands, as now.
3. Phase 1 navigation: every link is a full page load. The chrome's `Link`s need `reloadDocument`, or the
   catch-all route would swallow the click.

### The five designs from the Remix 3 comparison

| # | Design | Phase | In DMS |
|---|---|---|---|
| 1 | Navigate by fetching HTML and merging it in | 3 | `navigate.js`: intercept same-origin links with the Navigation API (`window.navigation` and `NavigateEvent.sourceElement`; without them the browser does a normal load). Fetch the destination with `X-DMS-Islands-Nav: 1`; the server answers with the same document. Parse it, merge the three slots and the chrome's props into the page, update the title and head. A destination that is not served answers with today's document: detect by the response header and do a document navigation. |
| 2 | Skip live components during a merge, hand them new props | 3 | `morph.js` walks old and new DOM; at an island boundary it does not descend. `SectionIslands` receives the new island data and re-renders each existing portal with its new section, so a filter change no longer remounts every island (future direction 16 of the RSC task). Islands added or removed by the new page mount or unmount. |
| 3 | One wire format for islands | 2 | Comment markers `<!--dms:i:<key>-->…<!--/dms:i-->` around each island and `<!--dms:slot:<name>-->` around each slot, replacing the `<dms-rsc-slot>` regex and the `data-dms-island` wrapper `div`. One JSON script holds every island's key, section index and props, the page row trimmed as now, and the chrome's props. A run-time check refuses a prop that is not JSON-serializable and names the section. |
| 4 | Attributes that protect client-owned DOM | 3 | `data-dms-preserve-dom` on a subtree and `data-dms-preserve-attrs="a b"` on an element; `morph.js` honours both. Set by the section wrapper for islands, and available to a theme for chrome it mutates in the browser (the colour-scheme attribute). Listed in `documentation/extension-points.md`. |
| 5 | Stream late sections as HTML templates | 4 | Send the document as soon as the chrome and the sections whose data is ready have rendered; a section still waiting on its query sends its fallback. Each late section arrives at the end of the stream as `<template data-dms-late="<key>">`, and a small inline script swaps it in. Needs sections to render independently of one synchronous `renderToString` pass, so it starts with a spike. |

## Priorities (owner, 2026-11-24), ahead of the phases

### A — The click delay

- [x] Reproduce: not reproducible outside the harness (clicks land in about 100 ms)
- [x] Cause, in two parts (log, 2026-11-24): the measurement tool's own wait, and links inside static HTML
      being document loads. Both fixed; County Template click median 7.15 → 2.10 s
- [ ] Still slower than today's path: a click between two pages with heavy live sections (County Template
      drought 11.8 → 17.2 s). The destination's sections fetch their data again in the browser. Priority B
      (more static section types) is the fix

### B — More static section types

- [x] Census (log, 2026-11-24): 810 live sections on 136 pages; Spreadsheet 480, Map 125, Graph 117, Card 61
- [x] **Decided (owner, 2026-11-24): a Spreadsheet wakes on first use.** New registry key `wakeOnUse`
      (`staticSections.js` `sectionWakeOnUse`; Spreadsheet sets it). The section is still an island, but it
      keeps its server HTML and loads no code until the reader points at it, focuses into it or touches it,
      or the page's state stops being what the server rendered with (a filter, an action parameter, URL
      parameters applied after mount). A Spreadsheet whose rows load in the browser mounts at once, as before
- [x] A page whose islands all wait loads no section code and no plugins until the first one is used
- [ ] The first sort or scroll on a waiting table happens after its code has loaded (about 0.5 s on a first
      visit, under 0.1 s once another section has loaded it). A click made before that is lost. If that
      matters in use: fetch the section code when the browser is idle
- [ ] A page with URL-bound filters wakes every waiting table as soon as the section code is there (the
      state check is page-wide). Narrow it to the tables that read page state, if the measurement says so
- [ ] Graph (117): its server HTML has no chart (drawn in the browser). Needs a server-drawn SVG first
- [ ] Card: 33 of 61 are live for edit-in-view (correct); 23 load rows in the browser (look at why)
- [x] Coverage and measurement after the Spreadsheet change (log, 2026-11-24, build `hi5`)
- [ ] Re-run coverage and the measurement after each further type

### C — Less JavaScript in the browser

- [x] What is in the islands entry's static graph, module by module (log, 2026-11-24)
- [x] First cut: the section registry and every built-in section component are out of it
      (1,484 → 1,303 KB uncompressed, 446 → 391 KB gzip)
- [x] A page with live sections preloads its island code with the entry
- [x] **A page loads only the plugins its live sections need.** Owner's direction (2026-11-24): computed,
      never declared by the plugin's maintainer. The plugin host already records what each plugin registers,
      and the server render has every plugin registered, so the server names the plugins for each page
      (`plugins/registries.js` `pluginsOfSections`: the owners of the live sections' types, and of any column
      type or format function their settings name) and sends the list with the page. Nothing is saved on the
      activation row: a compiled-in plugin has no row, and a saved list would go stale on a version change.
      The browser loads each named plugin through the app's loaders (`src/plugins/loaders.js`, one per
      plugin folder, found by glob) or, for a plugin installed at run time, from the API host
- [x] The "Report an issue" nav widget imported the library's index, which put about 1.1 MB of unrelated
      code on every page of a site with a QA install; it now imports the modules it uses
- [ ] The chrome imports the whole `UI` object (table, Card, column types: about 400 KB of source); a
      chrome-sized `UI` with the heavy members lazy
- [ ] Icons (147 KB of source, all icon definitions), falcor (271 KB), lodash-es whole (137 KB)

## Phases

### Phase 1 — Delivery without RSC, measured (the go/no-go for this task)

- [x] `vite.config.js`: second client input for `render/islands/entry.browser.jsx`, `build.manifest`,
      the `@dms-host/*` aliases
- [ ] Confirm the section registry and Lexical are not in that entry's graph. **Not done:** the entry's
      static graph is 3 files, about 1,484 KB uncompressed (its own 8 KB, a shared chunk of 976 KB, vendor
      501 KB) against about 1,185 KB for the RSC client entry; a first load transfers about 28 KB more JS
      than the RSC path. What is in the shared chunk has not been looked at.
- [x] `render/islands/servePage.js`, `islandData.js`; `setup.mjs` mount behind `DMS_ISLANDS`; template fill
- [x] Route-match check before the capture (no `serverComponent`, no capture)
- [x] `render/islands/entry.browser.jsx`. Deviation: chrome links already swap in place (a React Router
      loader fetches the page as JSON); they are not document loads
- [x] Signed-in visitors: rendered as the user, per-user can't-serve key, session in the island data
- [x] `invalidateRoutes` covers this path (the renderer's `clear()`, asserted in a test)
- [x] `dms perf`: detects the island data script, counts it as hydration data
- [x] Coverage census over the 338 measured pages; parity run against today's path
- [x] Three-way measurement, phase tier: off / `DMS_RSC` / `DMS_ISLANDS`, signed out and signed in
- [x] Write the result here (Log, 2026-11-23). The criterion below reads "continue"; the decision is the
      owner's

**Stop if** served pages are clearly slower to Complete than on the RSC path with no explanation that a later
phase removes. **Continue if** they are within run-to-run noise or better.

### Phase 2 — One wire format for islands (design 3)

- [ ] Comment markers for slots and islands; `captureRender` cuts by marker
- [ ] One JSON script; serializable check with the section named in the error
- [ ] `StaticSlot` and `SectionIslands` read the new format
- [ ] `captureContext.js` documents every field; the capture record is built by one function (RSC code
      review suggestion 10)

### Phase 3 — Navigation by merging HTML (designs 1, 2 and 4)

- [ ] `morph.js` with island skip and the preserve attributes; unit tests over DOM fixtures
- [ ] `navigate.js`: interception, fetch, merge, title and head, scroll and focus, back and forward
- [ ] Crossing to a page that is not served is a document navigation
- [ ] Islands take new props without remounting; a map survives a URL-bound filter change
- [ ] Measure click and filter-change timings against today's path and the RSC path

### Phase 4 — Streaming late sections (design 5)

- [ ] Spike: can a section render to HTML independently of the page pass, with its data awaited?
- [ ] If yes: stream the document, templates for late sections, the swap script
- [ ] Measure first byte and first content against phase 3

### Phase 5 — Choose a path and clean up

- [x] Owner decision: this path (2026-11-24)
- [x] Move the shared files out of `render/rsc/` into `render/islands/`; delete the RSC delivery (2026-11-24)
- [ ] Share the registration code between `siteConfig.jsx` and `SectionIslands.jsx` (RSC code review
      suggestion 7); take the `Spreadsheet` check out of `render/` (suggestion 8)

## Risks

- **The second client entry pulls in too much.** Shared chunks are decided by the normal build's
  `manualChunks`. Check the entry's graph in phase 1 before measuring.
- **The merge fights React.** `morph.js` must only touch DOM that React does not own: the static slots.
  The chrome is React's (it gets new props), and islands are skipped. Anything else is a bug.
- **Navigation API support.** Interception needs Chrome 135 or later; other browsers get full page loads.
  That is acceptable only if full loads are fast enough, which phase 1 measures.
- **Two paths drifting.** From phase 2 the shared capture changes. See Open questions.
- **Same weak points as the spike** until phase 2 and phase 5: render-time capture, duplicated
  registration, fragile `serverStatic` tests.

## Open questions for the owner

1. ~~RSC path kept working or frozen?~~ Answered 2026-11-24: removed.
2. Is full-page-load navigation acceptable for browsers without the Navigation API, or is a fallback
   (intercepting clicks by hand) wanted?
3. Flag name: `DMS_ISLANDS`, or something else?

## Testing checklist

- [x] Unit, phase 1 (delivery without RSC): `islandData` round trip, can't-serve cache keys
      (`tests/islandsServePage.test.js`, 14 tests)
- [ ] Unit, later phases: serializable check; `morph` fixtures (island skip, preserve attributes, added and
      removed islands)
- [x] Server (same test file, the capture render stubbed): an eligible page as a document and as a
      navigation, an ineligible page, a route with no `serverComponent` (no capture runs), per-user keys,
      a redirect, a theme that is not a code theme, `clear()` after a route change
- [ ] Server: a malformed session cookie
- [x] Parity with today's path on the sampled pages (34 of 43 match; the rest are the RSC task's explained classes)
- [ ] Flag off: no change on today's path; `DMS_RSC` still serves after phase 1
- [ ] Interactions: a filter island driving other islands, Spreadsheet sort and paging, component actions
      between islands, the editor round trip (view, edit, view)
- [ ] No fixed waits in new page checks: wait on a signal

## Log

- 2026-11-23: task written. Nothing built.
- 2026-11-23: **phase 1 (delivery without RSC) built and measured.** Nothing committed.
  - **Built.** `render/islands/{islandData.js, servePage.js, entry.browser.jsx}` (243 lines);
    `handler.jsx` gains `renderIslands`; `middleware.mjs` serves it (documents and `x-dms-islands-nav: 1`
    JSON); `setup.mjs` builds the template from `.vite/manifest.json`; `dmsPageFactory.jsx` puts
    `handle.serverComponent` on the route; `ClientChrome.jsx` gains `preloadChromeTheme`; `dms perf` detects
    the path. Reused unchanged from `render/rsc/`: the capture, `ClientChrome`, `StaticSlot`, `IslandHost`,
    `SectionIslands`, `clientConfig`. Not used: `rscHandler`, `resolvePage`, `ViewDocument`, `generateHTML`,
    `hydrate`, the three entries, `vite.rsc.config.js` and the second build.
  - **Deviations from the plan.** In-app navigation is already in phase 1, through a React Router loader
    (phase 3, navigation by merging HTML, replaces it); the count header is `x-dms-islands-count` (the
    planned `x-dms-islands` is the same header as `X-DMS-ISLANDS`); the entry is `.jsx`; the `@dms-host/*`
    aliases moved to `vite.config.js`, shared with the RSC build.
  - **Coverage** (338 measured pages): 332 served, 136 with live sections. The same as the RSC path.
  - **Parity** with today's path, same build: 34 of 43 sampled pages match; the 9 differences are the
    classes the RSC task explained (side-nav links only today's client adds, Lexical's empty link, one page
    still loading data).
  - **Measurement.** Build `hi1` on port 5558, served three ways, phase tier, 5 runs, 9 sites signed out
    (44 pages) and 8 signed in (40 pages; weatheranalytics can't sign in with the dev login on any path).
    Medians over pages, today's path / RSC / islands:

    | Signed out, returning load | Today | RSC | Islands |
    |---|---|---|---|
    | Complete | 2.87 s | 1.33 s | 1.28 s |
    | Server responded | 201 ms | 314 ms | 268 ms |
    | Largest paint | 864 ms | 772 ms | 816 ms |
    | Blocking time | 615 ms | 17 ms | 34 ms |
    | Data for hydration | 209 KB | 34 KB | 15 KB |
    | Requests | 57 | 42 | 37 |
    | JS heap | 40 MB | 13 MB | 12 MB |

    | Signed in, returning load | Today | RSC | Islands |
    |---|---|---|---|
    | Complete | 3.82 s | 1.40 s | 1.42 s |
    | Server responded | 299 ms | 346 ms | 330 ms |
    | Blocking time | 894 ms | 20 ms | 52 ms |
    | Data for hydration | 223 KB | 44 KB | 15 KB |
    | Requests | 59 | 44 | 39 |

    Per site, Complete on the two new paths differs by 8% at most, in both directions. First-load JS
    transferred (tny_landing): 1,414 / 872 / 900 KB. No console, page or hydration errors on either new
    path; today's path logs React #419 errors on the County Template.
  - **Clicks.** Median click Complete signed out: 607 / 472 / 536 ms. Both new paths are slower than
    today's on three County Template clicks (annexes 1.8 → 6.6 / 7.1 s, extreme heat 4.7 → 9.6 / 13.2 s,
    drought 11.8 → 19.4 / 18.6 s) and on MitigateNY's natural-environment click, as the RSC task recorded.
    Part of it is the harness: on these clicks the link was not clickable for up to 5 s (Playwright's wait,
    then a scripted click), on both paths, more often on this one (4 of 5 runs against 3 of 5). Why the link
    is not clickable is **not explained**; it needs a look before phase 3 (navigation by merging HTML).
  - **Reading against the criterion:** served pages are within run-to-run noise of the RSC path, so
    "continue". Open: the entry's graph (above), the unclickable link.
  - Raw data: `dms-template/scratchpad/perf-rsc/results-phase.tsv` and `results-phase-signed_in.tsv`,
    labels `hi1-off`, `hi1-rsc`, `hi1-islands`, `si-hi1-*`.
- 2026-11-24: **the RSC delivery removed; this is the path** (owner). Nothing committed.
  - Deleted: `render/rsc/{rscHandler,resolvePage,generateHTML,hydrate}.js`, `ViewDocument.jsx`,
    `entries/`, `vite.rsc.config.js`, `mountRsc` in `setup.mjs`, `@vitejs/plugin-rsc` from `package.json`
    (`node_modules` and the lock file not touched: run `npm install`). Their sources are in the appendix of
    [rsc-view-pages.md](../completed/rsc-view-pages.md), now closed.
  - Moved to `render/islands/`: `captureContext.js`, `ClientChrome.jsx`, `StaticSlot.jsx`,
    `slotHtmlContext.js`, `IslandHost.jsx`, `SectionIslands.jsx`, `clientConfig.js`. Renamed:
    `IslandsCaptureContext`, `configureIslandsClient` / `getIslandsClientConfig`, `staticSections.js`,
    `CapturedSection.jsx`, `captureIneligible`, `<dms-slot>`, the route key `islandsView`,
    `window.__dmsIslandsPage` (now set by the entry: before, an islands page never told `syncSessionCookie`
    it came from dms-server, so signing out there left the session cookie).
  - Verified on build `hi2`: served pages hydrate with no errors; the 14 tests pass.
- 2026-11-24: **priority A (the click delay).**
  - The 5 s was the measurement tool's: it measures three pages at once in one browser, a page that is not
    in front gets no animation frames, and Playwright's click waits for one until its 5 s timeout, then the
    tool clicks from script. Every path has these waits; they were counted only when the click loaded a new
    document, because that clock started before the click. `dms perf` now times such a click from the click
    event (`clickWaitMs`, `clickError` in the record; `perf/README.md`).
  - Why those clicks loaded a document: a link inside static HTML is a plain anchor. `entry.browser.jsx` now
    hands same-origin links inside a slot to the router, so they swap in place like the chrome's.
  - County Template clicks, today's path / before / after (build `hi4`, median of 5): annexes 1.81 / 7.15 /
    2.10 s, FEMA tool 0.14 / 3.69 / 0.17 s, extreme heat 4.72 / 13.23 / 4.36 s, drought 11.81 / 18.64 /
    17.24 s; median click 1.81 / 7.15 / 2.10 s. MitigateNY natural environment 0.54 / 1.18 / 0.46 s.
- 2026-11-24: **priority B (more static section types), census only.** 338 pages, 332 served, 136 with live
  sections, 810 live sections: Spreadsheet 480 (117 pages; 66 pages have nothing else live), Map 125,
  Graph 117, Card 61 (33 edit-in-view, 23 load rows in the browser, 5 paged), Filter 15, others 12. One
  Spreadsheet of 480 reads page filters; 50 share a page with a Filter section. A Spreadsheet's server HTML
  holds the same rows as the mounted section (checked on three pages). Nothing widened yet: see the
  decision under Priorities.
- 2026-11-24: **priority C (less JavaScript).**
  - The entry's static graph was 1,484 KB (3.6 MB of source before minifying). In it: react-dom 548,
    react-router 512, falcor 254, lodash-es 163, and 1.96 MB of app code, of which section components 561,
    icons 147, the table 133, column types 118.
  - The section components came in by two imports that only wanted small things: the plugin host and the
    pattern registry (`registerComponents`), and `PatternColorScheme.jsx` plus two UI primitives
    (`parseIfJSON`, `timeAgo`, `convertToUrlParams` from `pages/_utils`). Fixed with
    `sections/componentRegistryStore.js` (the registry's store, without the built-ins) and
    `pages/_utils/basics.js`. Entry graph 1,484 → 1,303 KB, 446 → 391 KB gzip; the app's main entry
    unchanged at 2,755 KB.
  - That moved code a page with live sections needs into chunks found only after hydration, and three
    MitigateNY pages got about 300 ms slower. `setup.mjs` now gives such a page preload tags for its island
    code (`islandPreloads`); MitigateNY median back to 1.56 s (1.54 before).
  - Pages with live sections download the same total as before (County Template landing 846 KB
    transferred); the saving is on pages with none. Not measured yet on those.
  - Tools: `scratchpad/hi/analyze.sh` (a build that records each chunk's modules and import edges),
    `breakdown.cjs`, `paths.cjs`, `importers.cjs`, in this session's scratch folder (not kept).
  - Test suite: 865 pass, 15 fail in 7 files (admin permissions, graph and radio themes, auth vocabulary,
    collapsible section groups, sync convergence, user menus). None touches a file this work changed; not
    checked against a clean tree, since the branch carries other uncommitted work.

- 2026-11-24 (later) — owner's answers: Spreadsheet wakes on first use; plugin needs are computed, not declared.
  Build `hi5`, signed out, phase tier (median page; today's path / islands build `hi1` / `hi5`):
  - **Priority B (more static section types):** 398 of 480 live Spreadsheets wait (82 load rows in the browser and
    mount at once); on 49 of the 136 pages with live sections every one waits. Coverage unchanged (332 of 338).
    Waking the first table on a first visit: 5 files, 404 KB, about 0.5 s; under 0.1 s once the code is loaded.
    The live table's text matched the server HTML on the pages checked.
  - **Priority C (less JavaScript):** the server names each page's plugins (48 pages ask for `mapeditor`, none for
    the others). "Report an issue" imported the library index: a resting County Template page went from 2,825 to
    1,737 KB of JavaScript once it imported only what it uses.
  - **Numbers:** Complete 2.87 / 1.28 / 1.12 s; MitigateNY 4.51 / 1.54 / 1.27 s; County Template 4.96 / 1.87 /
    1.82 s (drought page alone 50.8 / 14.9 (`hi4p`) / 10.1 s, extreme heat 26.8 / 9.6 / 5.8 s). Click, all pages
    607 / 536 / 296 ms; County Template annexes click 1.81 / 7.15 / 1.67 s. Blocking time 615 / 34 / 26 ms.
  - **Still worse than today's path:** the click to the drought page, 11.8 s today, 17.2 s on `hi4p`, 19.7 s on
    `hi5` (one run each). After a click the page state differs from the server's, so every waiting table wakes
    and fetches along with the live sections. This is the page-wide state check listed under priority B.
  - Bugs met and fixed: a chunk load-order error (`Cannot access … before initialization`) when the plugin host
    was its own dynamic import, so the section code and the plugin host are one lazy module (`islandCode.js`);
    a busy cursor left on a table that woke by a state change before it was pointed at.
  - Focus is lost when a table wakes by keyboard focus (its HTML is replaced). Not handled.
  - Tests: islands file 18 pass; library suite 969 pass, the same 15 failures in 7 files as before this work;
    `src/plugins` 326 pass, one file (`chat/cli/slack/convert_all.test.mjs`) fails to load, not touched here.
