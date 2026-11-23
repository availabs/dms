# View pages as static HTML with islands, without server components

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

Written 2026-11-23, from the code review of the RSC task
([research/rsc-view-pages-code-review.md](../../research/rsc-view-pages-code-review.md), suggestion 14,
"measure the cheaper alternative") and the Remix 3 comparison (section "Five designs to copy if static
HTML with islands goes ahead"). Sibling of [rsc-view-pages.md](./rsc-view-pages.md); both paths stay in
the tree, each behind its own flag, until one is chosen.

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

## The flag, and keeping both paths

- `DMS_ISLANDS=1` turns this path on. `DMS_RSC=1` keeps the RSC path. Setting both is a start-up error.
- One build serves three ways: both off (today's path), `DMS_RSC` (needs the separate RSC build as now),
  `DMS_ISLANDS` (the normal build).
- Responses carry `X-DMS-ISLANDS: served | pass: <reason>` and `x-dms-islands: <n>`, as the RSC path does
  with `X-DMS-RSC`, so the coverage census and `dms perf` work for both.
- **Phase 1 (delivery without RSC) changes no shared file's behaviour**, so the RSC path keeps working
  and the comparison isolates delivery. From phase 2 (one wire format for islands) on, the shared capture
  changes shape. Before starting phase 2, decide whether the RSC path is kept working or frozen at its
  measured state (see Open questions).

## What is reused, what is new

Reused as they are (currently in `packages/dms/src/render/rsc/`; they stay there until a path is chosen):
`ClientChrome.jsx`, `StaticSlot.jsx`, `slotHtmlContext.js`, `IslandHost.jsx`, `SectionIslands.jsx`,
`clientConfig.js`, `captureContext.js`. Also the capture in `patterns/page/pages/view.jsx`, `RscSection.jsx`,
`rscSections.js`, `usePageViewState.js`, `captureRender` in `render/ssr2/handler.jsx`, and the registry keys
`serverStatic` / `serverIsland`.

Not used by this path: `rscHandler.js`, `resolvePage.js` (its `islandsOf` and head handling move),
`ViewDocument.jsx`, `generateHTML.js`, `hydrate.js`, `render/rsc/entries/*`, `vite.rsc.config.js`.

New, in `packages/dms/src/render/islands/`:

| File | Job |
|---|---|
| `servePage.js` | Server. Given the request and the mount's own handler: capture, decide, render the chrome to a string with the slot HTML in `SlotHtmlContext`, return the document parts. Holds the can't-serve cache. |
| `islandData.js` | Server and browser. Builds and reads the island data (what `resolvePage.js` `islandsOf` does today) as one JSON script. |
| `entry.browser.js` | Browser. Reads the island data, configures the client from the `@dms-host/*` modules, hydrates `ClientChrome` inside a plain React Router with one catch-all route. |
| `navigate.js` | Browser, phase 3 (navigation by merging HTML). Intercepts navigation, fetches HTML, merges it in. |
| `morph.js` | Browser, phase 3. The DOM merge, with island skip and the preserve attributes. |

Changed: `render/ssr2/express/setup.mjs` (mount the path when the flag is on, read the build manifest),
`render/ssr2/express/middleware.mjs` (fill the template for an islands page), the app's `vite.config.js`
(a second client input, `build.manifest`, the five `@dms-host/*` aliases that `vite.rsc.config.js` defines today).

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

## Phases

### Phase 1 — Delivery without RSC, measured (the go/no-go for this task)

- [ ] `vite.config.js`: second client input for `render/islands/entry.browser.js`, `build.manifest: true`,
      the `@dms-host/*` aliases; confirm the section registry and Lexical are not in that entry's graph
- [ ] `render/islands/servePage.js`, `islandData.js`; `setup.mjs` mount behind `DMS_ISLANDS`; template fill
- [ ] Route-match check before the capture (no `serverComponent`, no capture)
- [ ] `render/islands/entry.browser.js`; chrome links as document loads
- [ ] Signed-in visitors: rendered as the user, per-user can't-serve key, session in the island data
- [ ] `invalidateRoutes` covers this path (one handler: nothing to add; assert it in a test)
- [ ] `dms perf`: record `islands` in the mode, count the island data as hydration data
- [ ] Coverage census over the 338 measured pages; parity run (`parity/parity.mjs`) against today's path
- [ ] Three-way measurement, phase tier, warm and cold: off / `DMS_RSC` / `DMS_ISLANDS`
- [ ] Write the result here and decide: continue, or stop

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

- [ ] Owner decision: this path, the RSC path, or neither
- [ ] Move the shared files out of `render/rsc/` to where the kept path lives; delete the other path
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

1. From phase 2 on, is the RSC path kept working against the new wire format, or frozen at its measured
   state (build `rscsi2`) for comparison only?
2. Is full-page-load navigation acceptable for browsers without the Navigation API, or is a fallback
   (intercepting clicks by hand) wanted?
3. Flag name: `DMS_ISLANDS`, or something else?

## Testing checklist

- [ ] Unit: `islandData` round trip; serializable check; `morph` fixtures (island skip, preserve attributes,
      added and removed islands); can't-serve cache keys
- [ ] Server: an eligible page, an ineligible page, a route with no `serverComponent` (no capture runs),
      signed in and signed out, a malformed session cookie, `invalidateRoutes` after a route change
- [ ] Parity with today's path on the sampled pages, flag on and off
- [ ] Flag off: no change on today's path; `DMS_RSC` still serves after phase 1
- [ ] Interactions: a filter island driving other islands, Spreadsheet sort and paging, component actions
      between islands, the editor round trip (view, edit, view)
- [ ] No fixed waits in new page checks: wait on a signal

## Log

- 2026-11-23: task written. Nothing built.
