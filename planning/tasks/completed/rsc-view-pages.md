# View pages as React Server Components, with streaming

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** done: closed 2026-11-24. The RSC delivery was measured against static HTML with islands and removed in its favour (owner); phases 0 and 1 and the capture and island code stay live. See the appendix. Earlier status: phase 2 spike behind `DMS_RSC`, with section islands: 332 of 338 measured pages served, every sampled page 2–5× faster to Complete, no errors (measured 2026-11-21); phase 0 (React Router 8) done, no change; phase 1 (session cookie) built and measured (signed in ×1.09, signed out no change), router-rebuild fix measured (signed in back to ×1.02); signed-in visitors on the RSC path built and measured (S9: signed in ×0.37 to Complete, as signed out; signed out unchanged); the go/no-go left for the owner · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

Design written 2026-11-18; revised the same day after review with the owner (route opt-in in `siteConfig`
instead of naming the page pattern; a session cookie in scope; re-unifying on one router as the end state). Replaces the dropped [ssr-streaming.md](./ssr-streaming.md) and brings
[research/ssr-rsc-react-router.md](../../research/ssr-rsc-react-router.md) (February 2026) up to date.

## Objective

Let a route **opt in** to rendering with React Server Components, and opt the page pattern's view route in
first: each section's view version runs on the server where it can, and reaches the browser as HTML with no component code and no copy of its data. Sections
that must stay interactive stay client components. The same change gives streaming: the page shell goes out
first and each data section follows when its query finishes. Routes that don't opt in are not changed. The
server learns who is asking from a session cookie, which this task adds. The end state is every route on one
router, reached a route at a time.

## What we would gain, and what we would not

Today a view page sends three things: the HTML, the loader data again as JSON (so React can re-render the same
HTML in the browser), and the JavaScript for every section type, the editor included. After
[page-hydration-payload.md](../current/page-hydration-payload.md) the lightning risk profile is 3.87 MB of HTML, most of
it that JSON; the client build in `dist/` is 9.8 MB of JS in 167 files (2.08 MB in the main chunk).

| | today | with server components |
|---|---|---|
| A server-rendered section's settings and rows | sent as JSON | not sent |
| A server-rendered section's component code | sent | not sent |
| Lexical editor code on a view page | sent (the view swaps to the live editor) | not sent |
| First byte | after the slowest section query | after the page row loads |
| A client section's props (map, interactive table) | everything saved | only what the server passes |

Not a gain: **the HTML does not get smaller by the size of the rendered sections.** React sends the rendered
tree a second time as its own payload (the "Flight" payload), inlined in the HTML, so the browser can keep the
tree for navigation. A 500-row table rendered on the server is in the document twice, as markup and as tree.
What disappears is everything that was *not* on screen: unused columns, settings, other pages' rows. The spike
(phase 2) measures the real number before we commit.

Not a gain either: total server work. The same queries run. Caching (phase 7) is what cuts that.

## Where things stand

### React Router (checked 2026-11-18 against reactrouter.com and the repo's CHANGELOG)

- Installed: `react-router` **8.5.2** since phase 0 (2026-11-21; was 7.18.3), React 19.2.8, Vite 7.2.7, Node 24.15. Latest: **8.5.2** (2026-11-18);
  8.0.0 was 2026-06-17.
- v8 needs Node 22.22+, React 19.2.7+, ESM only; `react-router-dom` is removed (we have 0 imports of it); the
  only data-mode future flag is `v8_middleware` (context in loaders becomes a `RouterContextProvider`). Vite 7+
  is a framework-mode requirement only. We meet all of it.
- **RSC is still experimental in 8.5.2.** Every API keeps its `unstable_` prefix and the docs warn of breaking
  changes in minor and patch releases. Fixes land in almost every release (8.3.0, 8.5.0, 8.5.1, 8.5.2 all have
  RSC entries), so it is maintained, and moving.
- RSC works in **Data Mode**, which is what we use. The APIs:
  - `unstable_matchRSCServerRequest({ request, routes, generateResponse, … })` — matches and renders to a Flight
    `Response`. `routes` is an argument **per call**, so our per-host route trees built from site data fit.
    `decodeAction`, `decodeReply` and `loadServerAction` are optional: a server with no server functions
    doesn't pass them.
  - `unstable_routeRSCServerRequest({ request, serverResponse, renderHTML, hydrate, nonce })` — turns the
    Flight response into streamed HTML for a document request, and passes it through for a navigation.
    `hydrate: false` gives a page with no client router at all.
  - `unstable_RSCStaticRouter`, `unstable_RSCHydratedRouter`, `unstable_getRSCStream`,
    `unstable_createCallServer` (server functions only).
  - Route entries: `{ id, path, Component | lazy, children }`. A route's default component is a server
    component and may be `async`. `clientLoader`, `clientAction` and `shouldRevalidate` come from a
    `"use client"` module. A whole route can be a client component (a server wrapper that renders it).
    Loaders may return elements.
  - `routeDiscovery`: the browser learns routes as it navigates, so it no longer needs the site's whole route
    tree up front (today we ship site data in `window.__dmsSSRData` so the client can rebuild every route).
- Bundler: `@vitejs/plugin-rsc` (experimental; 0.5.36+ is named in the 8.5.2 notes). Three entries
  (`entry.rsc`, `entry.ssr`, `entry.browser`), three Vite environments (`rsc`, `ssr`, `client`). CSS imported by
  server components is collected and injected. Barrel files can fail its client-only validation. **Its README
  says nothing about the React Compiler**, which our production client build uses.
- **Streaming without RSC is not available to us.** The how-to "Streaming with Suspense" lists Data Mode, but
  `StaticRouterProvider` writes hydration data with a plain `JSON.stringify` (7.18.3 in `node_modules`, and
  `main`): a promise returned by a loader can't be sent. Streaming promises is done by framework mode's
  turbo-stream transport and by the RSC routers. On our current pipeline we would have to send section rows
  ourselves (the plan in the conversation of 2026-11-18: our own hydration script plus a `<script>` per
  streamed section).

### Our code

- **One registry, a view and an edit version per type.** `componentRegistry.js` merges the built-in
  `ComponentRegistry` with what patterns and themes register (`registerComponents`, `theme.pageComponents`).
  An entry has `ViewComp`, `EditComp`, `controls`, and capabilities read off it: `preloadData`, `preload()`
  (code-split chunk), `useDataSource` / `useDataWrapper`, `trimForView`, `componentFunctions`.
- **The view path is one tree of client components**: `pages/view.jsx` → `SectionGroup` → `SectionArray` →
  `SectionView` (`section.jsx`) → `dataWrapper` → the type's `ViewComp`. `view.jsx` holds the page state
  (`useImmer`), reads search params, and provides `PageContext`, `CMSContext`, `DataSourceContext`.
- **Context is everywhere.** 643 `useContext(` calls in the library, 382 of them `ThemeContext`, which
  carries the theme object *and* `UI`, the theme's component set (`UI.Table`, `UI.Graph`, `UI.Icon`…). Server
  components can't read context. This is the largest mechanical cost (design §3).
- **The server already loads section data**: `preloadPageSections` runs each `preloadData` section's request in
  the loader, with a 5 s budget, and writes the rows into the section's settings. A server section replaces
  that with its own `await`.
- **The server renders logged out.** `handler.jsx` never reads the user;
  [ssr-logged-in-render-and-stale-cache.md](../current/ssr-logged-in-render-and-stale-cache.md) is open. A server
  component that decides what a user may see has to know the user (design §6).
- **Two bugs are open in client navigation** (stale content after a click; `sectionSource.find is not a
  function`), both in page-hydration-payload.md. The RSC router replaces the code they live in for view pages.

Section by section, view version only:

| Section | In view it does | Verdict |
|---|---|---|
| Rich text (`lexical`) | Renders saved HTML (`getHtmlSync`, already server-safe), then swaps to the live Lexical editor in read-only mode; collapsible blocks; links that set page params | **Server.** A small client script for collapsibles and param links. Largest code saving |
| Header, MNY header, Footer | Static markup from settings and data | **Server** |
| Card | Formats rows into cells; link cells; reads page params | **Server.** Links are plain `<a>`; params come from the URL |
| Spreadsheet | Table of rows; optional sort, paging, column filters, download, cell editing | **Server when static** (no paging/sort/filter/edit switched on), **client otherwise**, decided per section from its settings. Later: sort and paging through the URL |
| Graph | SVG computed with d3 inside React; measures its width in the browser; hover tooltips | **Client first.** Server SVG is possible with a `viewBox` instead of measured width, plus a client hover layer. Own phase |
| Map (app pattern `mapeditor`) | MapLibre canvas, 1 MB chunk | **Client, always.** A server wrapper passes only the props the map needs, which fixes the 1.8 MB of copied `hover-columns` without a save-format change |
| Filter | Controls that write page params | **Client** (small) |
| PDF export, Upload, Validate | Browser APIs | **Client** |
| Theme-registered types | Unknown | **Client unless the entry opts in** |

## Design

### 1. A route opts in; the core picks the router by that key

One document has one router: today's data router or the RSC router. They can't be nested. So each request is
rendered by one of two paths on the same Express server, and the choice is read off the matched route:

```js
// a pattern's siteConfig, on a route entry (a child)
{
  type: (props) => <PageView {...props} />,   // today's component; kept
  path: "/*",
  action: 'view',
  serverComponent: () => import('./pages/view.server.jsx'),   // opt-in
}
```

- **The core checks for `serverComponent` and nothing else.** It never reads the pattern type or `action`. Any
  pattern, app pattern or theme opts any route in the same way. The key gets a row in
  `documentation/extension-points.md`. (The exact name and shape are settled in the spike; the rule is that it
  is a reference to a module plus data that can be serialized, because that is what the RSC router can carry.)
- `mountSSR` matches the URL against the host's routes, as `ensureRoutes(host)` builds them. Leaf route has the
  key and the site's flag is on → RSC path. Otherwise → today's path (`render/ssr2`).
- **An opted-in route stays in today's route tree too**, with its `type`. That is the flag-off behavior, and it
  makes crossing between the two need no special code:
  - opted-in page → a route that hasn't opted in (the editor): the RSC router doesn't have that route, so it
    is a full page load;
  - back again (editor → view): today's router has the route and renders today's client view, in the browser.
    The next full load of that page is server-rendered.
- Navigation between opted-in routes stays client-side, done by the RSC router: it fetches the next page's
  payload instead of running loaders in the browser.
- A per-site flag (`DMS_RSC`, default off) turns the RSC path off whatever the routes declare.

React Router's RSC API is used in three files only (`render/rsc/entry.rsc.jsx`, `entry.ssr.jsx`,
`entry.browser.jsx`), so a breaking rename is a three-file change. Exact versions are pinned.

**The split is the migration path, not the end state.** The form a route takes to opt in (a module reference
and serializable props, where today a `siteConfig` builds inline components that close over the theme, the
Falcor model and the format) is the same form a single RSC router needs for every route, including routes that
are entirely client components. So each route that opts in is one route migrated. When every route of every
pattern has the key, today's router and the per-request dispatch are removed (phase 8). Doing all of it at once
instead would mean restating the routes of every pattern type (page, admin, auth, datasets, qa, chat, mapeditor,
theme-registered) in one step, on an experimental API.

### 2. The registry gets a server view

Two optional keys on a registry entry, in line with `preloadData` and `trimForView`:

```js
{
  ViewComp,            // client, as today
  EditComp,
  ServerViewComp,      // async server component: (props) => element. Fetches its own data
  serverView,          // (elementData, ctx) => boolean. Missing = always, when ServerViewComp is set
  clientProps,         // (elementData, ctx) => props. What a client ViewComp receives from the server
}
```

The page's server component walks the sections and, for each one:

- `ServerViewComp` present and `serverView(...)` true → render it on the server, inside its own `Suspense`.
- otherwise → render the client `ViewComp` with `clientProps(...)` (default: `trimForView`, then the settings
  as today). Its module starts with `"use client"`.

The core names no section type. The new keys get a row in `documentation/extension-points.md`. A theme or app pattern opts a type in by adding the key; without it the type
behaves as now. `ServerViewComp` lives in its own file (`Card.server.jsx`) so the client bundle never imports
it, and the registry is split into a client map and a server map built from the same entries
(`ComponentRegistry/index.server.js`), because a module that imports both would pull server code into the
browser.

### 3. Theme and UI without context

Server components can't call `useContext`. The 382 `ThemeContext` readers don't all have to change: only the
components a `ServerViewComp` renders.

- One accessor, `useTheme()` (it exists in `ui/useTheme.js`), gets two implementations selected by the
  `react-server` export condition:
  - client: reads `ThemeContext`, as now;
  - server: reads a per-request store (`React.cache`) that the page's server component fills once with the
    resolved theme for the host and pattern.
- `UI` on the server is a second map holding the server-safe components (`Table`, `Card`, `Icon`, `Link`,
  layout pieces). A component is server-safe when it has no state, effects or handlers; where one has a small
  interactive part (a column menu), that part becomes its own `"use client"` file.
- This keeps the library's rule (CLAUDE.md, "UI Component Access Convention"): a component still gets `UI`
  from the theme accessor, never from a direct import. Only where the accessor reads from differs.
- Themes are objects of class strings plus a few functions and components (`Icons`, `pageComponents`). They are
  used on the server and never serialized, so functions are fine there. A client island still gets its theme
  from `ThemeContext`, provided once by a client wrapper around the page, as today.

### 4. Data: each server section loads its own, and streams

A data `ServerViewComp` builds its request with the same `buildUdaConfig` and awaits it:

```jsx
export default async function CardServer({ elementData, pageParams }) {
  const state = resolveForServer(elementData, pageParams);   // page filters applied
  const { data, length } = await getData(falcorForRequest(), state);
  return <CardView state={state} data={data} />;
}
```

- Each one sits in `<Suspense fallback={<SectionSkeleton/>}>`. React sends the shell, then each section as its
  query resolves. This is streaming for the HTML and for the data in one step, and it removes
  `preloadPageSections`, the 5 s budget and the client's "did the server already load this" key for these
  sections.
- `falcorForRequest()` is one Falcor model per request (`React.cache`), so sections that ask for the same thing
  share the result.
- Client sections on the page keep their preload: the server component awaits the rows and passes them as
  props, or passes a promise the client reads with `use()` (React streams it), so they stream too.
- nginx on mercury must not buffer these responses (`X-Accel-Buffering: no`), and compression must flush per
  chunk, or the stream arrives all at once.
- Crawlers get the full document; the response just stays open longer. Status and headers are fixed when the
  shell is sent: the page row decides 200, 404 or redirect before any section runs.

### 5. Page state moves to the URL for server sections

Today `view.jsx` keeps page state in memory and sections talk through it (`setActionParam`, the
`componentFunctions` providers and subscribers). A server section can only react to what is in the request.

- Page filters already sync to search params (`usePageFilterSync`). On the RSC path a filter change is a
  navigation to the same page with new params; the router re-renders the server sections and keeps client
  state in the islands.
- Action params that a server section subscribes to must be in the URL as well. A section whose inputs can't be
  put there (it subscribes to in-memory state only) answers `serverView → false` and stays a client component.
- First version re-renders the whole route on a param change. If that is slow on pages with many data
  sections, a later step fetches one section's payload from a resource route.

### 6. Who is asking: a session cookie (in this task)

The login token lives in the browser's `localStorage` (`userToken`). A page request never carries it, so the
server always renders as a signed-out visitor
([ssr-logged-in-render-and-stale-cache.md](../current/ssr-logged-in-render-and-stale-cache.md), issues 1 and 2). Today
the browser re-renders once it has read the token. A server-rendered section can't be corrected that way: the
browser has neither its code nor its data. So the server must know the user on the first request.

- **Login sets a cookie as well as returning the token**; logout clears it. `HttpOnly`, `Secure`,
  `SameSite=Lax`, same lifetime as the token. On the hub the cookie is per host, like the token is today.
- **The cookie authorizes reading a rendered page and nothing else.** Writes and the Falcor API keep requiring
  the bearer token, so a cross-site request that carries the cookie can change nothing.
- **Both render paths read it.** The handler resolves the user once per request and gives the request's Falcor
  model that identity, so page and section permissions are judged by the same server rules as an API call
  (the judge in dms-server; no second copy of the rules in the renderer). A section the user may not see is
  never rendered or sent.
- On today's path this also fixes the open task's issues 1 and 2: the client's first render starts from the
  user the server rendered with (sent in `__dmsSSRData`), so hydration matches and a restricted page arrives
  rendered.
- A response rendered for a signed-in user is `Cache-Control: private`. Caching (phase 7) keys on what the
  user may read, or covers signed-out renders only.
- Users signed in before the change have a token and no cookie: the client sets the cookie on its next token
  check (one call to a dms-server endpoint that exchanges a valid token for the cookie).

### 7. No server functions, at first

The Flight protocol's serious CVEs (CVE-2025-55182, remote code execution; CVE-2025-55183; CVE-2026-23864) were
all in the path that decodes what a **client sends to the server**. Phases 2–6 expose none of it: no
`"use server"` modules, and `decodeAction` / `decodeReply` / `loadServerAction` are not passed to
`matchRSCServerRequest`. Writes keep going through Falcor and the existing auth. React stays on a patched
version (19.2.8 now) with the lockfile pinned. If server functions are wanted later, each one is a public
endpoint that does its own access check (React Router's docs say the same).

### 8. Build and dev

- `vite.config.js`: add `@vitejs/plugin-rsc` with the three entries, next to the current client and SSR
  builds. The RSC build is additive; the current build keeps working.
- Dev: dms-server mounts Vite in middleware mode today; the RSC entry's handler (`(Request) → Response`) is
  loaded through the plugin's `rsc` environment and called from the same middleware.
- To check in the spike: the React Compiler with the plugin; Tailwind 4 class detection in server-only files;
  the `falcor` alias and the linkedom `document` stub in the `rsc` environment; code-split section chunks
  (`lazyComponent`) as client references.

## Measuring the task

Every phase is measured with `dms perf` ([perf-measurement-tool.md](../current/perf-measurement-tool.md)) on a local
production build of the hub, so each gain (or loss) is tied to the phase that made it. Harness, scripts and
runs live in `dms-template/scratchpad/perf-rsc/` (gitignored, so they exist on one machine only, and runs
are only comparable on the machine and port they were taken on).

**Setup** (`scratchpad/perf-rsc/`): `build_ssr.mjs --env .env-hub` with `VITE_API_HOST=http://api.localhost:5556`
into `build-5556/`; `server.sh start` runs it with `NODE_ENV=production` on port 5556 through
`harness_server.cjs` (DAMA/DMS task polling, schedule sweeps and sync compaction off, so it can't take the
5555 server's task queue). Signed out, sync on, `preload_data` on for every measured pattern (set
2026-11-20; it is the default from now on, owner). The hub database is a dev database.

### Baseline (2026-11-20, rr-rsc = master `b01a10b4`, before any RSC change)

`run_baseline.sh baseline`: every published page of 9 patterns, one pattern at a time, warm + click +
journey, `--parallel 3`. Runs are listed in `scratchpad/perf-rsc/runs.tsv`.

| Site · pattern | Host | Pages × runs |
|---|---|---|
| hub · availabs | `localhost` | 6 × 5 |
| tny · landing, status, Freight Atlas (v2), npmrds2 | `tny.localhost` | 1, 3, 4, 5 × 5 |
| weatheranalytics · Pages | `weatheranalytics.localhost` | 25 × 5 |
| mny · MitigateNY_County_Template_V3 | `countytemplate.mny.localhost` | 45 × 5 |
| tny · platform_docs | `tny.localhost` | 90 × 3 |
| mny · MitigateNY_2025 | `mny.localhost` | 159 × 3 |

Two full baselines, same pages and journeys (the second uses `--pages-from` the first):

1. **`baseline`**: build `build-5556/` from `b01a10b4` (already has the first Lexical fix, the skipped
   second `setEditorState`, lexical-view-double-set-state.md). The owner merged master into rr-rsc
   (`ef077fd3`) while it ran; the build was made before, so **every `baseline` run measured `b01a10b4`**
   whatever commit its `run.json` records (platform_docs and MitigateNY_2025 record `ef077fd3`).
2. **`baseline_lexical`**: build `build-5556-lexical/` from `ef077fd3`, which adds master's Lexical change
   (live editors mount off-page and attach in one commit; empty text nodes kept as `token`,
   lexical-view-keep-empty-text-paragraphs.md). Taken right after the first (owner, 2026-11-20), compared
   page by page with it, and kept as its own baseline. **The RSC phases are compared with this one**, and the
   sampled tiers' references are taken on this build.

**`baseline` results** (`summarize.mjs --tsv runs.tsv baseline`; per page the median over its repetitions,
then the median page, 75th percentile in brackets; times in s, sizes in KB; "comp req" = dataset requests on
a returning load; the journey is the cumulative time of a 2-click walk, first pass / returning pass):

| Pattern | Pages | Failed visits | Warm complete | Server (TTFB) | Script | Blocking | JS | Hydration | Document | Comp req | Click complete | Journey |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| availabs | 6 | 0 | 5.18 (6.93) | 0.23 | 3.41 | 2.93 | 858 | 137 | 291 | 0 | 1.14 (1.78) | 7.34 / 6.30 |
| tny landing | 1 | 0 | 2.04 | 0.06 | 0.85 | 0.42 | 1348 | 44 | 180 | 16 | – | 2.66 / 2.02 |
| tny status | 3 | 0 | 2.58 (10.3) | 0.17 | 0.75 | 0.28 | 1348 | 20 | 189 | 19 | – | 10.6 / 10.3 |
| tny Freight Atlas (v2) | 4 | 0 | 4.31 | 0.22 | 1.78 | 1.09 | 1426 | 55 | 229 | 11 | 1.23 | 6.62 / 5.55 |
| tny npmrds2 | 5 | 0 | 3.49 (3.64) | 0.07 | 1.31 | 0.76 | 1348 | 45 | 179 | 15 | 0.46 | 2.61 / 2.01 |
| weatheranalytics | 25 | 0 | 2.34 (2.61) | 0.09 | 1.21 | 0.75 | 850 | 132 | 238 | 0 | 0.54 (1.46) | 4.28 / 3.41 |
| MNY County Template V3 | 45 | 46 | 16.0 (35.0) | 2.02 | 11.1 | 9.79 | 1268 | 566 | 893 | 61 | 10.7 (18.4) | 16.5 / 12.4 |
| tny platform_docs | 90 | 3 | 3.11 (3.35) | 0.13 | 1.20 | 0.73 | 1348 | 220 | 402 | 0 | 0.16 (0.51) | 9.36 / 8.67 |
| MNY MitigateNY_2025 | 159 | 5 | 5.37 (11.4) | 0.27 | 2.06 | 1.23 | 900 | 550 | 918 | 21 | 1.02 (3.85) | 21.2 / 13.0 |

- County template: all 46 failures are 60 s timeouts on the natural-hazard and jurisdictional-annex pages
  (dataset queries on the 43 GB parcel table, below).

**`baseline_lexical` results** (same columns; `summarize.mjs --tsv runs.tsv baseline_lexical`, page-by-page
comparisons in `logs/*-baseline_lexical.compare.txt` and each run's `compare-*.html`):

| Pattern | Pages | Failed visits | Warm complete | Server (TTFB) | Script | Blocking | JS | Hydration | Document | Comp req | Click complete | Journey |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| availabs | 6 | 0 | 3.68 (4.24) | 0.23 | 1.97 | 1.56 | 858 | 137 | 291 | 0 | 0.50 (0.72) | 3.95 / 3.23 |
| tny landing | 1 | 0 | 2.10 | 0.06 | 0.93 | 0.54 | 1349 | 44 | 180 | 16 | – | 2.84 / 2.07 |
| tny status | 3 | 0 | 2.86 (10.2) | 0.21 | 0.85 | 0.36 | 1349 | 20 | 189 | 19 | – | 11.2 / 10.9 |
| tny Freight Atlas (v2) | 4 | 0 | 4.58 | 0.21 | 1.75 | 1.20 | 1426 | 55 | 229 | 11 | 1.23 | 6.66 / 5.80 |
| tny npmrds2 | 5 | 0 | 3.71 (3.83) | 0.08 | 1.53 | 0.82 | 1349 | 45 | 179 | 15 | 0.47 | 2.75 / 2.09 |
| weatheranalytics | 25 | 0 | 2.61 (2.80) | 0.08 | 1.35 | 0.89 | 851 | 132 | 238 | 0 | 0.53 (1.54) | 4.47 / 3.38 |
| MNY County Template V3 | 45 | 49 | 24.5 (42.0) | 1.66 | 19.3 | 20.3 | 1268 | 566 | 893 | 63 | 8.87 (16.9) | 16.6 / 12.0 |
| tny platform_docs | 90 | 4 | 3.06 (3.37) | 0.13 | 1.20 | 0.77 | 1349 | 220 | 402 | 0 | 0.16 (0.52) | 9.15 / 7.49 |
| MNY MitigateNY_2025 | 159 | 2 | 5.57 (11.8) | 0.28 | 2.18 | 1.33 | 901 | 550 | 918 | 26 | 0.97 (3.85) | 21.3 / 13.0 |

- **The Lexical change paid off where Lexical dominates**: availabs warm complete 4.62 → 3.48 s by page median
  (6 of 6 pages faster), script 3.41 → 1.97 s, click 1.14 → 0.50 s, journey 7.34 → 3.95 s. Elsewhere the
  page-by-page comparison is "no change" (platform_docs 10 faster, 1 slower of 90; MitigateNY_2025 12 faster,
  34 slower of 159, within noise on a dev database shared with other users; tny and weatheranalytics a little
  slower, all inside run-to-run noise).
- The county template's summary median moved 16.0 → 24.5 s, but page by page it is 40 of 45 "no change"
  (median page 28.9 → 28.4 s by the compare tool, which takes the median per page first). Which pages time
  out at 60 s varies between runs, and that moves the summary's median; the parcel-table queries (below) are
  the cause in both runs.
- **Section-type census** (view sections of every page, `analysis/census-<name>.tsv`): availabs,
  platform_docs and weatheranalytics are **rich text only** (288, 988, 499 sections); MitigateNY_2025 is 2527
  rich text of ~3,500 (302 Spreadsheet, 130 footer, 120 header, 119 Card, 89 Map, 64 Graph); the county
  template is the data-heavy one (741 Card, 677 rich text, 181 Spreadsheet, 54 Graph, 46 Map). So rich text on
  the server (phase 2) reaches most of what was measured.
- **The Lexical code is in the 2.2 MB main chunk** (`index-*.js` of 164 files, 11 MB in all), so every page
  downloads it whether or not it shows rich text.

**Found by the baseline** (not RSC; recorded so they are not lost):
- **Signed-out page views write to the database.** Two county-template pages
  (`high_hazard_dams_view_card`, `jurisdictional_annex_form`) sent `dms.data.edit` on every view: 198
  unauthenticated `U` rows in `dms.change_log` for 3 dataset rows during the run, and requests of 0.5–15 s
  (a 5.6 MB response). Cause: the rich-text editor is created with the value in `initialConfig` and then
  sets it again in `UpdateEditor`; the second set is not tagged, so `OnChangePlugin` reports it as a change,
  and a Card column with `allowEditInView` in live-edit mode saves it. Fixed in `ui/components/lexical/editor/index.tsx`
  (the value sync is tagged `history-merge`; patch `fix-lexical-view-save.patch`). **Not fixed, for the
  owner:** the server accepted those writes from a visitor with no token (`auth_state: unauthenticated`) on
  `nys_dams|1459528:data` and `jurisdictions|1346450:data` rows; whether those dataset kinds are meant to be
  writable signed out is an auth-rules question (dms-server `routes/auth/rules.js`, the formats' `rules`).
- **Every view section with a data source lists every source of every environment** on mount
  (`dataWrapper/useDataSource.js` `getSources`, run from the View path too): `hazmit_dama` 0–390 and
  `npmrds2` 0–449 with `name, metadata, categories`, ~300 KB per page, 0.4–3 s, on 77–79 of 159 MNY pages and
  37 of 45 county pages. In view it only feeds the section menu (editors) and a refresh of the saved
  `externalSource.columns`. Future direction (below): load it only when the menu opens or the user can edit.
- **Slowest dataset queries** (`slow_requests.mjs`, warm visits): the parcel table
  `gis_datasets.s1649_v2354_parcel_to_footprint_ny_v_2` (view 2354, 43 GB, 7.1 M rows) filtered by
  `substring(geoid,1,5)`, `rpad(substring(prop_class,1,1),3,'0')`, `owner_type`, `nys_name`: 12 s median,
  up to 27 s, 531 s in all; `mny+capabilities_catalogue` (view 1172519) 2.3 s × 137; `mny+jurisdictions`
  (1346450) on `data->>'geoid'` / `'county_geoid'` 5.5 s median, up to 44 s; `actions_cleaned` (13526);
  `fusion_1648` on `substring(geoid,1,2)`; `ihp_valid_registrations_enhanced_1379` (9.6 GB) by
  `disaster_number`; BILD (2357) and tax parcels (2268) by `substring(bg_geoid,1,5)`. Index candidates for
  the data steps (S7+).

### Sampled runs during the task

`run_sampled.sh <tier> <label>`. Pages per tier in `samples/<tier>.tsv`, picked from the baseline by
`pick_sample.mjs`, which classes each page by its returning load: **text** (no dataset requests), **data**
(1–20), **heavy** (over 20, or over 2 s waiting on dataset rows), **map**, and takes each class's typical page
and slowest page, plus the home page. The first run of a tier is its reference; every later run uses
`--pages-from` the reference (same pages, same journey) and is compared with it.

| Tier | What | When | Time |
|---|---|---|---|
| **quick** | ~2–3 pages per site, 3 runs | after any change meant to move speed, and before a phase is called done | ~15 min |
| **phase** | ~6–8 pages per large pattern, every page of the small ones, 5 runs | at the end of each phase; twice in the spike (flag on / off) | ~60 min |
| **full** | `run_baseline.sh` | at the go/no-go and at the end of the task | ~3 h |

Rules:
- **Flag A/B on one build.** From phase 2 on, each phase run is taken twice on the same build: `DMS_RSC`
  off (must compare as "no change" with the reference: the old path did not regress) and on (the gain).
- Production build only, rebuilt with the same command; nothing else heavy on the machine (the 2026-11-20
  baseline was taken with ~14 GB free); the reference's port.
- A result goes in this doc with the phase it belongs to: what moved beyond the noise, on which class of page.
- Re-take a tier's reference (a new label) when something outside the task changes the pages (content
  edits on measured pages, a preload change, a server upgrade), and say so here.

### What each phase should move (the estimate, checked against the runs)

| Metric (report name) | Today's cause | Phase expected to move it |
|---|---|---|
| Scripts, Blocking time, `bytes.js` on **text** pages | every rich-text section mounts a live Lexical editor in view (perf-measurement-tool.md, availabs `/work`: 12.5 of 15.7 s in two Lexical functions) | 2 (rich text on the server: no Lexical code or mount) |
| Hydration data, document size | the loader data sent again as JSON | 2 for text sections, 3 for Card / static Spreadsheet; partly given back by the Flight payload |
| Server responded (TTFB) on **heavy** pages | preload waits for every section's query (5 s budget) before the first byte | 2 (streaming: shell after the page row) |
| Complete on **data** / **heavy** pages | the same queries, duplicates, client fetches after hydration | 2–3 a little (one Falcor model per request dedups), 7 (caching) most |
| In-app click | client loaders + section fetches | 2 (RSC router fetches a payload): direction not known, measured |
| Map pages | MapLibre, copied `hover-columns` | 5 (server-built props) only |
| Sync's bootstrap tail (Idle) | sync, not rendering | none: RSC does not touch it |

### Step log (owner away from 2026-11-20 evening; autonomous run)

The owner asked for the task to be taken as far as it goes, with permission to change patterns' component
loading settings and to add indexes to data sources. No commits, pushes or deploys (workspace rule): each
step's change is saved as `scratchpad/perf-rsc/patches/<step>.patch` (`git diff`), and measured on its own
against the step before it, so every gain is credited to the change that made it.

| # | Step | Measured as | State |
|---|---|---|---|
| S0 | `baseline` (b01a10b4) | full | **done** 16:00–18:52, results above |
| S1 | `baseline_lexical` (ef077fd3: master's Lexical off-page mount) | full, `--pages-from` S0 | **done** 18:54–22:03, results above |
| S7a | **Indexes** on the slowest data sources (hazmit_dms on mercury), taken early because nothing else measures until the phase reference: see "Indexes added" below | the phase reference is taken with them; their effect alone = S2 vs S1 on the same pages | **done** 22:05–22:13 |
| S2 | Phase-tier reference on the S1 build (`lexical-idx`), indexes in place | phase ref | **done** 22:54–23:46. Also carries S3 (hashed assets cacheable): that fix is in `render/ssr2/express/setup.mjs`, which the server loads from source, so it applied to every build from the moment it was written. S1 → S2 = indexes + S3, see "Phase results" |
| S3+S6 off | The spike build with `DMS_RSC` off: the view-page save fix, `RouterProvider` from `react-router/dom` (phase 0's one code change), Lexical lazy in `columnTypes`, the inert RSC hooks (S3 already in S2, above). Patches `spike.dms.patch`, `spike.template.patch` | phase vs S2 | **done** 23:46–00:38: no change on any page (the old path did not regress) |
| S6 on | Phase 2 spike, `DMS_RSC=1`, same build | phase vs S2 (and vs "off") | **done** 00:38–01:28: served pages 2.7–9× faster; pages left on today's path slower (server renders them twice), and links from a served page to one of those reload the document. See "Phase results" |
| S6b + S7b | The ineligible-page cache (the double render, `rscHandler.js`) and the `force` preload dedup (`preloadedAt`, `useDataLoader.js`), one build `dedup`, flag off and on | phase vs S2 | **done** 01:35–03:15: unserved pages' server time back to the reference (MitigateNY 2.69 → 1.46 s, status 7.0 → 3.55 s); County Template and landing homes now served (6.89 → 1.48 s, 2.01 → 0.54 s); off: no regression. See "Phase results" |
| S8 | **Section islands** (phase 2's "every other type as a client island"): a section that isn't static no longer sends its page to today's path; it stays live in the browser inside the server-rendered page. See "Section islands" below | coverage census, parity, phase vs S2 | built 03:17; coverage **194 → 332 of 338** pages; parity: two bugs found and fixed (app pattern types, section titles), every remaining difference explained. **Measured** 03:58–05:20 (`chain_islands.sh`, build `islands3`): every sampled page is served, warm Complete 0.55–4.8 s (S2: 2.0–14.2 s), no console, page or hydration errors; off: no regression. See "Phase results" |
| S4 | Phase 0: React Router 8 (the package upgrade itself) | smoke (7 vs 8, both paths), phase (expect no change) | **done** 2026-11-21 10:50–12:05 with the owner present: `v8_middleware` on, 8.5.2 installed, smoke identical on 7 and 8 (see "Phase 0" below); measured 12:07–13:30 (`chain_rr8.sh`, build `rr8`, flag off and on): **no change** — 44 pages, warm complete ×0.99 with RSC off and ×1.01 with it on against `islands3` (7.18.3); none >10% slower off, 4 on (noise-sized) |
| S5 | Phase 1: session cookie | phase (signed out: expect no change), and a new **signed-in** phase tier (`run_profile.sh`, `dms perf --profiles signed_in`) | **built and checked** 2026-11-21 (build `p1cookie4`; see "Phase 1" below): `parity/session.mjs` 16 of 16 with RSC off and on, smoke 0 regressions on both paths; **measured** 14:05–18:04 (`chain_signedin.sh`, restarted as `chain_signedin2.sh` at 14:43 after its sign-ins failed: the runner filled the server-rendered form before it hydrated; `perf/runner.mjs` now settles and retries): signed out **no change** (44 pages, warm complete ×1.00 off and on vs `rr8`); signed in **×1.09 slower** off, ×1.11 on (TTFB ×1.29), against `rr8` rendering the signed-in visitor anonymously. See "Phase 1" below |
| S5b | The router rebuild after load (`render/spa/dmsSiteFactory.jsx`) and the signed-in route tree (`render/ssr2/handler.jsx` `hasNoAccessStubs`), build `p1remount2` | parity, phase signed in and out, vs `p1cookie4` | built and checked 2026-11-21 19:22 (`session.mjs` 16 of 16 off and on; every page mounts once, signed in and out); **measured** 19:26–22:23 (`chain_remount.sh`): signed in warm complete **×0.94** off and ×0.93 on vs `p1cookie4`, which brings signed-in visits back to the anonymous render's time (×1.02 vs `rr8`); signed out ×0.94 off (34 pages), ×0.98 on |
| S9 | **Signed-in visitors on the RSC path**, plus the open issues from S5 (template fill, sign-in form, PDF cookie, token stamp), build `rscsi2` | parity signed in (RSC on vs off), smoke, session checks; phase signed in and signed out, RSC on | built and checked 2026-11-22 00:25–00:56, measured 00:57–01:59 (`chain_rscsi.sh`): signed in Complete ×0.37 (40 of 40 pages faster), signed out unchanged (see "S9" below) |
| S7+ | Loading settings (section `fetchMode`), each its own measured step | phase | see "Loading settings" below |

Findings while reading (2026-11-20):
- React Router 8 for us: `RouterProvider` from `react-router/dom` (one file, `render/spa/dmsSiteFactory.jsx`);
  no loader reads `context`, no route sets `hasErrorBoundary`, no `react-router-dom`; ESM-only is fine (the
  server bundle is loaded with `import()`); mercury's image is `node:22-bookworm-slim` (needs 22.22+).
- **The view "route" is not a React Router route.** A pattern mounts one route, `${baseUrl}/*`
  (`render/dmsPageFactory.jsx:171`, loader `:50`); the `view` child in `patterns/page/siteConfig.jsx:257` is a
  dms-manager config matched inside the loader (`dms-manager/_utils-core.js` `getActiveConfig`). So a
  `serverComponent` key on it is invisible to React Router: the RSC entry must run `getActiveConfig` itself, or
  the key goes on the pattern's mount route (`dmsPageFactory`) and that route decides list/view.
- **13 modules call `React.createContext` at top level** (`ui/themeContext.js`, re-exported by
  `ui/useTheme.js`; `patterns/page/context.js`; `ui/mountContext.js`; `patterns/auth/context.js`;
  `utils/userMenuContext.js`; `lexical/useLexicalTheme.js`, …). React's react-server build has no
  `createContext`, so importing almost anything on the view path from a server module throws, including
  `getComponentTheme` / `mergeTheme` (reachable only through `useTheme.js`). Design §3 needs context-free
  modules for the server side (theme merge, `getComponentTheme`, the lexical theme build) before any
  `ServerViewComp` can import them.
- **Rich text is the easy one**: `getHtmlSync` (`lexical/editor/ssr.ts:36`) is synchronous and context-free,
  but needs a global `document` (linkedom, as `handler.jsx` sets) and the nested theme built inline in
  `editor/index.tsx:71-108` (`getLexicalTheme`, `buildLexicalInternalTheme`, icons, brand styles), which has
  to move to a plain function. `PageBreakNode` imports CSS.
- No `'use client'` anywhere; registries (components, column types, formats, widgets) are filled at module
  load / config build, so the server graph must run the same registrations.
- Server render path: `render/ssr2/handler.jsx` (`createStaticHandler` per host, `renderToString`),
  `render/ssr2/express/{setup,middleware}.mjs` (prod: `express.static` + one cached handler; the template gets
  `window.__dmsSSRData` = site data + lazy ids, the router writes its own hydration data).

### Phase results (2026-11-21, phase tier, 5 runs, warm visits)

Median over a pattern's sampled pages of each page's median **Complete** (seconds), and Server responded
in brackets. "Served" = pages the RSC census (`analysis/rsc-coverage.tsv`) found the spike serving.

| Pattern | Pages | S2 reference | S6 off | S6 on | S6b+S7b off | S6b+S7b on | S8 off | **S8 on** |
|---|---|---|---|---|---|---|---|---|
| availabs, served | 5 | 3.25 (0.22) | 2.92 (0.22) | **1.07** (0.25) | 2.80 (0.18) | **1.03** (0.27) | 2.89 (0.23) | **1.27** (0.26) |
| availabs, not served | 1 | 3.43 (0.28) | 3.37 (0.15) | 2.95 (0.18) | 3.31 (0.14) | 3.01 (0.10) | 3.19 (0.14) | **1.79** (0.20) |
| platform_docs, served | 5 | 2.76 (0.13) | 2.66 (0.14) | **1.00** (0.20) | 2.96 (0.21) | **1.00** (0.22) | 3.08 (0.18) | **0.97** (0.19) |
| weatheranalytics, served | 4 | 3.04 (0.23) | 2.74 (0.19) | **1.08** (0.26) | 2.89 (0.17) | **1.05** (0.31) | 2.87 (0.19) | **1.10** (0.23) |
| Freight Atlas (v2), served | 2 | 3.36 (0.09) | 3.06 (0.14) | **1.28** (0.25) | 2.97 (0.09) | **1.30** (0.22) | 2.99 (0.10) | **1.20** (0.20) |
| Freight Atlas (v2), not served | 2 | 6.02 (0.34) | 6.18 (0.24) | 5.65 (0.53) | 6.18 (0.24) | 6.90 (0.25) | 6.17 (0.24) | **4.18** (0.25) |
| MitigateNY_2025, served | 2 | 14.18 (0.54) | 13.56 (0.59) | **1.51** (0.56) | 13.40 (0.58) | **1.75** (0.64) | 13.61 (0.58) | **1.48** (0.57) |
| MitigateNY_2025, not served | 6 | 8.73 (1.36) | 8.99 (1.34) | 10.16 (**2.69**) | 8.45 (1.36) | 9.02 (1.46) | 9.52 (1.38) | **4.76** (1.33) |
| County Template V3, served | 2 | 4.85 (0.18) | 4.93 (0.17) | **1.08** (0.39) | 4.48 (0.16) | **0.99** (0.39) | 4.62 (0.13) | **0.96** (0.33) |
| County Template V3, not served | 6 | 10.19 (1.51) | 11.38 (1.54) | 11.99 (**3.26**) | 8.63 (1.46) | 20.70 (3.06) ¹ | 8.63 (1.49) | **3.55** (1.87) |
| landing (home) | 1 | 2.01 (0.06) | 1.93 | 1.97 | 1.66 | **0.54** (served since S7b) | 1.63 | **0.55** |
| npmrds2, status (none served) | 8 | 2.5–3.4; status 2.64 | no change | no change; status TTFB 0.26 → 0.36 | no change | npmrds2 3.39 → 4.15 ²; status 2.34 | npmrds2 3.79; status 2.17 | npmrds2 **1.72**; status **1.42** |

"Served" / "not served" are the S6 census; with S7b the County Template home and the landing home moved to
served (the rows above keep the S6 classes, so County Template's "not served" row includes its home).

¹ A priming artefact, not server time: see the S6b + S7b bullet below. ² Unexplained, small, no TTFB
change; npmrds2's pages are all still on today's path (the S8 census below says what keeps each). Re-check in the
next run.

S1 → S2 on the same pages (all of a pattern's sampled pages): Complete availabs 3.68 → 3.43, MitigateNY 10.50
→ 8.73, County Template 8.50 → 7.47, platform_docs 3.55 → 2.76, Freight Atlas 4.58 → 4.11, npmrds2 3.71 →
3.39, weatheranalytics 3.35 → 3.04. Downloaded JS on a warm visit 870–1,460 KB → 0 everywhere: that is S3
(a returning visitor no longer downloads the app again), and it is most of the gain. The indexes show only on
the heavy county pages' Server responded (drought 2.21 → 1.51 s, extreme heat 2.09 → 1.71 s, home 0.76 →
0.27 s); the pages that ran the 22-second geoid queries are not in the phase sample.

What the runs say:
- **Served pages: 1.0–1.5 s Complete, whatever they were before** (2.7× on text-only pages, 9× on the
  MitigateNY glossary, 14.2 → 1.5 s). The gain is Lexical not mounting and the content not hydrating; the
  server time is unchanged.
- **S6 off is "no change"** on every page (the comparison tool's verdict, per page): the old path did not
  regress.
- **Pages left on today's path got slower with the flag on: their server time doubled** (MitigateNY 1.36 →
  2.69 s, County Template 1.51 → 3.26 s, status 3.59 → 7.02 s). The RSC handler decides by rendering today's
  route tree once with its loaders (`captureRender`), and a page it can't serve is then rendered again by
  today's SSR. Fix (S6b): `rscHandler.js` remembers a URL it couldn't serve for 5 minutes, so only the first
  request in that window pays twice. Only "can't serve" is remembered; a stale entry sends a page down
  today's path, which is always correct. (Sharing the loader result between the two renders isn't possible
  as built: they are separate bundles.)
- **In-app clicks from a served page to one not served are document loads** (design §1: crossing paths is
  a full page load). Click → home: availabs 0.33 → 2.02 s, MitigateNY 0.89 → 4.10 s, County Template 1.36 →
  6.07 s, Freight Atlas 1.18 → 3.01 s. Clicks between served pages, or starting from a page not served, are
  unchanged. Only coverage fixes this, and every home page in the sample is unserved (Dot Morph on availabs;
  the MNY homes' data sections), which is why "click home" carries the whole regression.
- **Measurement artefact to keep in mind**: a warm context is primed with the site's home page. Where home
  is not served, the first served page in that context downloads the RSC bundle (511–831 KB), so the served
  pages' numbers above include that download, and are if anything pessimistic. A real returning visitor has
  both bundles cached.
- **S6b + S7b (ineligible cache + force dedup)**: the server-time doubling is gone (MitigateNY not served
  1.36 → 2.69 → **1.46 s**, status 3.59 → 7.02 → **3.55 s**; with the flag off, no change anywhere). The
  dedup moved two homes to the RSC path: County Template home **6.89 → 1.48 s**, landing **2.01 → 0.54 s**.
  But County Template's pages left on today's path went 7.5–10 → 16–21 s. Cause, from the visits: the warm
  context is primed with home, and home is now served, so the context never loaded today's bundle (915 KB)
  **or ran the sync bootstrap**: every one of those visits now fetches `/sync/bootstrap?…pattern=…` (3.6–4.8
  s, the County Template pattern's `SELECT *`) and parses the bundle, with 26 more requests (112 → 138) and
  3× the blocking time. A real visitor who lands on a served page and then follows a link to an unserved one
  pays the same (click → annexes 5.6 → 20.3 s, extreme heat 5.0 → 51 s in this run, under 3 parallel
  visits), so it is real for that first crossing, though a returning visitor has both cached. Two fixes:
  coverage (S8, below), and the sync bootstrap for signed-out visitors (future directions).
- The React #418 hydration errors on County Template `home` / `home_legacy` / `changelog` are in the S2
  reference too (today's path), not from the spike.
- **S8 (section islands): every sampled page is served, and every one is faster than S2.** The S8 columns
  keep the S6 classes, so the "not served" rows are now pages served with islands. Warm Complete, S2 → S8:
  MitigateNY island pages 8.73 → **4.76 s**, County Template island pages 10.19 → **3.55 s** (and the
  16–21 s priming artefact is gone: nothing left in the sample to cross to), npmrds2 3.39 → **1.72**,
  status 2.64 → **1.42**, Freight Atlas map pages 6.02 → **4.18**, availabs home (Dot Morph) 3.43 →
  **1.79**. Static pages are where S6b + S7b had them (0.55–1.5 s). Server responded is unchanged except
  County Template island pages (1.51 → 1.87 s: the per-section capture). From the visits
  (`scratchpad/perf-rsc/island_table.cjs`): total blocking time on island pages falls 5–25× (MitigateNY
  1,820 → 81 ms, County Template 2,175 → 287 ms, npmrds2 834 → 23 ms), requests fall (MitigateNY 83 → 68,
  County Template 112 → 67), and **console, page and hydration errors go to zero** (S2: 55 console, 50
  page, 20 hydration errors on County Template, 15 page errors on status). The islands' own code costs
  little on a warm visit (cached); Freight Atlas's map islands download 372 KB (95 KB on today's path,
  where the map code is in the main chunk), and County Template's 109 KB.
- **S8 off: no regression.** The comparison tool's verdict per page (warm visits, 44 pages): 30 no change,
  11 faster, 3 slower (one each on npmrds2, platform_docs and County Template, none on MitigateNY); the `usePageViewState`
  refactor of `view.jsx` costs nothing on today's path.
- **S8 clicks:** clicks between served pages stay fast or get faster (weatheranalytics 1.77 → 0.37 s,
  npmrds2 0.46 → 0.10 s, platform_docs 0.22 → 0.18 s). Two are slower: MitigateNY click → island page 0.89 →
  1.68 s, and County Template's unchanged at 5.6 s. Their slowest requests are the full source lists
  (`uda … sources byIndex 0..449`, ~150 KB each, three of them) that every data section's
  `useDataSource` fetches in view (future direction 2). Today's path fetches them too, on about half its
  warm visits, but there the home page that primes the context already has them in the Falcor cache; an
  RSC document load starts with an empty cache. And the drought page's navigation payload
  (`drought.rsc`) is 240 KB and takes 1.3 s (future direction 14).

### Indexes added (S7a, 2026-11-20 22:05, hazmit_dms on mercury)

Chosen from the slow statements sampled from `pg_stat_activity` during `baseline_lexical`
(`analysis/slow_sql_lexical.jsonl`: every statement running over 1 s, every 2 s). All built `CONCURRENTLY`
(no lock on readers or writers); the list, with each one's `DROP INDEX CONCURRENTLY`, is
`scratchpad/perf-rsc/indexes/indexes.tsv`, the build log `indexes.log`.

| Index | On | For | Size | Query before → after (EXPLAIN ANALYZE, one county) |
|---|---|---|---|---|
| `perf_s1649_geoid5_idx` | parcel footprints (view 2354, 39 GB heap, 7.1 M rows) `(substring(geoid,1,5))` | county-filtered sums | 47 MB | up to 22 s → 0.66 s |
| `perf_s1649_bggeoid5_idx` | same, `(substring(bg_geoid,1,5))` | county-filtered `muni_name` groupings | 47 MB | up to 7.4 s → 0.7 s |
| `perf_s1649_county_cover_idx` | same, `(county_name) INCLUDE (prop_class, owner_type, building_full_market_val, total_av, full_market_val, nys_name, flood_zone, hifld_fcode, muni_name, geoid, bg_geoid)` | the statewide aggregations (`GROUP BY county_name` / `nys_name`, the Spreadsheet totals row), now index-only scans of 680 MB instead of 39 GB | 679 MB | 25–41 s → 1.8 s |
| `perf_s1651_bggeoid5_jur_idx` | BILD simplified (view 2357) `(substring(bg_geoid,1,5), jurisdiction_geoid)` | jurisdiction pages | 49 MB | 4.5 s → 0.2 ms |
| `perf_ihp1379_disaster_geoid_idx` | `open_fema_data.ihp_valid_registrations_enhanced_1379` (9.6 GB) `(disaster_number, geoid)` | disaster pages | 149 MB | up to 10.6 s → 8 ms |

Plus a plain `VACUUM (PARALLEL 0, ANALYZE)` of the parcel table (no exclusive lock; what autovacuum would
have done: 819 k dead rows, last vacuumed 2026-01-30), so its visibility map lets the covering index skip
the heap (heap fetches 2.4 M → 0). The parallel `VACUUM` failed first: **mercury's Postgres has too little
shared memory** (`could not resize shared memory segment … No space left on device`, i.e. `/dev/shm` in its
container), which can also fail large parallel queries (future directions).

Not index-fixable, left for future directions: the parcel table is **39 GB for ~8 GB of live data** (76 M
writes over 7.1 M rows: every derived column was added by an UPDATE pass), so every remaining full scan
reads five times what it needs (`VACUUM FULL` / `pg_repack` in a maintenance window); statewide aggregations
recomputed on every view (precompute or cache); the sync bootstrap's `SELECT *` over a pattern's rows on the
hub (70 ms warm, up to 6 s under load; already indexed, and it is the row size).

### The spike as built (2026-11-20, autonomous run; built and checked 22:10–22:50)

**Shape, and how it departs from the design.** Design §2–§3 have each section's `ServerViewComp` run in the
`rsc` environment, which needs the context-free theme modules first (13 modules call `createContext` at
import). The spike takes a shorter way to the same measurement: the `rsc` environment only orchestrates, and
the page's content is rendered by **today's components in the `ssr` environment**, where everything loads,
then placed in the RSC tree as static HTML. What the browser gets is the same as design §2 for rich text: the
markup, no section code, no copy of the section data. What it does not test is server components reading
theme and data themselves (phase 3 needs that, and the context-free split with it).

- **Opt-in** (design §1): the page pattern's view route carries `serverComponent: 'page-view'`
  (`patterns/page/siteConfig.jsx`). The key reaches `PageView` through the dms-manager wrapper's props,
  since the view is not a React Router route (finding above).
- **Per-page eligibility**: a registry entry may declare **`serverStatic`** (a boolean, or
  `(elementData) => boolean`): its view needs no JavaScript. Set on:
  - Rich Text (unless a button sets a page parameter; collapsibles export as `<details>`);
  - Footer: MNY;
  - **Card** (`Card.config.jsx` `cardServerStatic`): static unless it edits/adds/deletes rows, runs an
    enabled component action (`display._functions`), has a `filter_control` or `liveEdit` cell, or has more
    rows than one page (`display.totalLength > pageSize`, as of its last save);
  - **Header: MNY Data** (the mny theme's `components/mnyHeader/config.js`): static unless the search bar
    is on.

  A page is served by the RSC path only if every section says true **and** no data section will fetch
  after it mounts: the data loader checks that during the server pass (`dataWrapper/useDataLoader.js`,
  the same test as its load effect: `fetchMode` force, local filters, a gated filter, or rows that weren't
  preloaded) and marks the page ineligible (`section Card loads its rows in the browser`). Otherwise today's
  path serves it.
- **Server pass** (`render/ssr2/handler.jsx` `captureRender`): today's route tree, rendered with
  `RscCaptureContext` (`render/rsc/captureContext.js`) set. `view.jsx` checks eligibility, records the
  island's inputs (nav items, `pattern.theme`, the selected theme, the merged user menu, CMS fields) and renders
  its three section-group slots in `<dms-rsc-slot>` elements, which are cut out as HTML.
- **`rsc` environment** (`render/rsc/rscHandler.js`, `ViewDocument.jsx`): one route `*` per request.
  Eligible → `<html>` with the head and `ClientChrome` holding the three slots as static HTML. A document
  request for a page it can't serve → `404 x-dms-rsc: pass`, and the Express mount falls through to today's
  SSR. The router's `.rsc` fetch for such a page → `redirectDocument` (a full page load, design §1).
  Lazy route discovery (`<path>.manifest`, or `/.manifest?paths=…` for several; **not** `/__manifest`,
  which is only the framework-mode name) → React Router.
- **The content's HTML is not repeated in the payload** (`StaticSlot.jsx`, `slotHtmlContext.js`). First
  build: the payload carried every slot's HTML as a prop, so `/work` was 603 KB (303 KB of it payload).
  Now a document request's payload has no slot HTML; `generateHTML` hands it to the SSR render through
  `SlotHtmlContext`, and hydration reads it back from the DOM once. A `.rsc` navigation still carries it
  (there's no DOM to reuse). `/work`: **355 KB** (payload 57 KB: the island), against 633 KB on today's
  path (334 KB of it hydration data).
- The title (`PatternTitle`'s `html_title || name`) goes into the HTML, and the chrome applies the
  pattern's colour scheme (`PatternColorScheme`), as today's route wrapper does.
- **Every nav widget the server registers must be registered by the RSC browser entry**, or the Layout
  draws its empty placeholder (`<div class="h-12">`) where the server drew the widget, and hydration fails
  (React #418, seen on every MNY page). The qa pattern's `ReportIssue` comes in with the pattern on the
  server; `src/rsc/ReportIssueWidget.jsx` registers it on demand in the browser.
- **`ssr` environment** (`render/rsc/resolvePage.js`, `generateHTML.js`): runs the server pass; the head
  is the normal build's own `index.html` head (its CSS link, fonts, the CDN Tailwind runtime, analytics)
  minus its module scripts, plus the theme's font tags, so the page is styled exactly as today's.
- **Client island** (`render/rsc/ClientChrome.jsx`, `'use client'`): the theme's `Layout` with TopNav,
  SideNav, user menu and search. Rebuilds the theme from serializable inputs (`loadThemes([name])` →
  `getPatternTheme` → the captured user menu → `item.theme`), the auth provider, `CMSContext`,
  `PatternAuthContext`. Imports modules directly, never the library barrel. A pattern whose selected
  theme is a database row stays on today's path (spike limit).
- **Lexical out of the chrome's graph**: the user menu reaches `columnTypes` (through `NavigableMenu`),
  and `columnTypes` imported the whole editor. `columnTypes.lexical` is now a `lazyComponent`
  (SSR-preloaded; on pages with rich text the chunk is already loaded). `nav2Level` moved to
  `utils/nav.js` (re-exported from `pages/_utils`, which imports the section registry). The app's
  `widgets.js`, `NavCta.jsx` and `DotMorph.jsx` imported the library barrel; now direct modules.
- **Build** (`vite.rsc.config.js`, entries in `src/rsc/`): `@vitejs/plugin-rsc`, React Compiler on the
  client environment only (as the normal build), client code under `/rsc-assets/`. **Serve**:
  `DMS_RSC=1 DMS_RSC_DIST_DIR=<dir>` (`render/ssr2/express/setup.mjs` `mountRsc`); responses say
  `X-DMS-RSC: served` or `pass: <reason>`.
- **Measuring**: `dms perf` counts the RSC payload (`__FLIGHT_DATA` scripts) as hydration data
  (`perf/detect.js`), and records `rsc` in the mode.
- Known gaps: the site's head tags from app settings (manifest, icons) are not added on the RSC path;
  the theme-provided `registerFromTheme` hooks don't run in the island; TransportNY theme components
  import the library barrel, so a tny page's island would pull the whole library through its theme chunk
  (not fixed: those files are synced to transportNY); a Card whose source has grown past one page since it
  was saved shows a pager that does nothing until the section is saved again; links inside the static
  HTML are plain anchors (a full page load, as design §1 accepts), so only the chrome's own links use the
  RSC router.

**Coverage** (`X-DMS-RSC` for every page the baselines measured, 338 pages):

| Pattern | Served | Falls back, first reason |
|---|---|---|
| availabs | 5 / 6 | Dot Morph (home) |
| tny platform_docs | 90 / 90 | |
| weatheranalytics | 21 / 25 | 4 not page-pattern routes |
| tny Freight Atlas (v2) | 2 / 4 | AVL Graph, Map |
| MNY MitigateNY_2025 | 68 / 159 | Spreadsheet 76, Map 5, Filter 3, Graph 3, other 4 |
| MNY County Template V3 | 8 / 45 | Spreadsheet 26, Filter 5, Map 3, other 3 |
| tny landing, npmrds2, status | 0 / 9 | footer Card loads its rows in the browser (6), Header, Spreadsheet |

194 of 338 measured pages. The first build reached 145 (rich text and footer only); Card and the MNY header
took it to 202; the data-loader check then correctly took 8 back (pages whose Card fetches after mount).
Static Spreadsheet (phase 3) is the next 102.

**Parity** (`parity/parity.mjs`: the same build served with `DMS_RSC` on (5556) and off (5557), each page
loaded, 4 s settle, compared on visible text length, links, images, h1–h3 and title, plus page errors): **39
of 39 sampled served pages match, no errors** (5–8 per pattern). Screenshots of `/work` on both match.
Interactivity checked on an MNY page: the search palette opens; a link to a page the spike doesn't serve
loads it through today's path.

### Entries moved into the library (2026-11-23)

The app's `src/rsc/` folder is gone; mentions of it below and above are history. The three build entries are the
library's (`render/rsc/entries/{rsc,ssr,browser}.js`). The app's `vite.rsc.config.js` names them and defines five
aliases to its own modules (`@dms-host/ssr-handler`, `themes`, `api-host`, `widgets`, `plugins`;
`render/rsc/entries/README.md`). Both entries now take `API_HOST` from the app's `src/apiHost.js` (three
versions of the rule before). The lazy "Report an issue" widget moved to the qa plugin
(`src/plugins/qa/reportIssue/LazyReportIssue.jsx`), registered by the app's `src/widgets.js` when the plugin
has not registered the real one. Checked: the RSC build completes; not served or browser-tested.

### Section islands (S8, 2026-11-21, autonomous run)

Phase 2's "every other type as a client island with today's props". Before S8 one section that wasn't static
sent its whole page down today's path; now it stays live in the browser inside the server-rendered page, and
only a type that refuses (`serverIsland: false`) keeps a page off the RSC path.

**How it works.**
- **Server pass.** `sectionArray`'s view wraps each section in `RscSection` when the capture is on. Each section
  gets its own capture object, so what it finds out while rendering marks that section, not the page
  (`useDataLoader`: "my rows load in the browser"). Its HTML is wrapped in
  `<div data-dms-island="K" style="display:contents">`. `view.jsx` records what the browser needs to rebuild
  the page's contexts (`rscCapture.islandPage`): the page row, the trimmed nav items, the pattern's page
  variables, `datasources`, `pgEnv`, `subdomain` and `additionalSectionAttributes`.
- **Eligibility** (`view.jsx` `rscIneligible`, `components/sections/rscSections.js`): a page is refused only
  for a section that isn't static **and** whose type sets `serverIsland: false`. Only the PDF Generator does,
  because it needs `sitePatterns`, which an island doesn't carry. Both keys are listed in
  `documentation/extension-points.md`.
- **What reaches the browser** (`resolvePage.js` `islandsOf`): the live sections' keys and indexes, plus the
  page row with the static sections' element-data blanked. That copy goes in the payload; static sections
  stay HTML only.
- **Browser** (`render/rsc/IslandHost.jsx`, `SectionIslands.jsx`):
  - After hydration, `IslandHost` lazy-loads the island module together with the app's pattern types
    (clientConfig `loadPatternTypes`; the app's `src/rsc/entry.browser.js` passes `import('../patterns')`,
    which carries the map editor's Map section). A page with no islands loads neither.
  - `SectionIslands` registers what today's page pattern registers per theme: `pageComponents`, column types,
    format functions, section-header extensions, and each pattern type's `registerFromTheme`.
  - It rebuilds `CMSContext` (with `apiLoad`), `DataSourceContext` and one shared `PageContext`. Page state
    comes from `usePageViewState`, the hook that `view.jsx` now uses too (the logic was moved, not rewritten),
    so filters and component actions work across islands.
  - It portals today's `SectionView` into each `data-dms-island` element. The server nodes are removed in a
    layout effect once the section has rendered, so nothing flashes. A section that throws keeps its server
    HTML (`IslandBoundary`).
  - A Spreadsheet gets click-to-activate locally, as `sectionArray` gives it.
- **Size**: the island module is 6 KB. The section code it reaches (dataWrapper, the registry, the column
  types) and the app's patterns are shared chunks loaded only by island pages.
- `x-dms-rsc-islands: <n>` on a served page says how many sections stayed live (census and debugging).

**Coverage** (`analysis/rsc-coverage-islands.tsv`, the same 338 measured pages):

| Pattern | S6 served | **S8 served** | of which with islands | Still on today's path |
|---|---|---|---|---|
| availabs | 5 / 6 | **6 / 6** | 1 (Dot Morph) | |
| tny platform_docs | 90 / 90 | 90 / 90 | 0 | |
| weatheranalytics | 21 / 25 | 21 / 25 | 0 | 4 not page-pattern routes |
| tny Freight Atlas (v2) | 2 / 4 | **4 / 4** | 2 | |
| MNY MitigateNY_2025 | 68 / 159 | **158 / 159** | 90 | 1 PDF Generator |
| MNY County Template V3 | 8 / 45 | **44 / 45** | 35 | 1 not an opted-in route |
| tny landing, npmrds2, status | 0 / 9 | **9 / 9** | 8 | |
| **All** | **194 / 338** | **332 / 338** | 136 | |

**Parity** (`parity/parity.mjs`, now with `ISLANDS_ONLY=1`, `SETTLE=<ms>` and `OUT=`; `parity/diffpage.mjs`
for a line diff of one page). Two bugs were found and fixed in the first build:
- **Map sections showed "Component Map Not Registered".** The Map comes from the app's map-editor pattern
  type, and the RSC browser entry registered no app pattern types. Fixed with `loadPatternTypes`, above.
- **Section titles showed "Title component not found".** The attributes chain was one level too deep:
  `getViewComp`'s array wrapper hands `SectionArray` the `sections` attribute itself as `attr`.

On the second build: **23 of 27** island pages (12 s settle) and **38 of 47** sampled served pages (8 s)
match. Every difference left is explained, and none comes from an island:
- **`/status/status`: today's SSR renders the page twice.** A script error ("Invalid or unexpected token")
  and React #418 make React render again on the client and append a second copy. RSC matches the first copy
  line for line. This is in the S2 reference too.
- **platform_docs pages, and a few MNY pages: 4 links fewer on RSC.** On platform_docs these are side-nav
  entries ("What's new", "Help and feedback") that today's server HTML doesn't have either; only today's
  client adds them after load. The MNY ones are empty `<a href="">`s from Lexical's floating link editor,
  which today's path mounts once per live rich-text editor. So RSC matches today's *server* render; the
  server/client nav mismatch on today's path is separate (future directions).
- **Attribution names**: an island shows the section's saved source name ("AVAIL - Fusion Events V2").
  Today's path shows the current one ("AVAIL Fusion Events"), because it lists every data source on view
  (future direction 2) and renames from that. Cosmetic.
- Text lengths within 2% that change from run to run are data still loading at the settle time.

Unit tests: the whole `packages/dms` suite has 15 failures in 7 files, all failing at HEAD too (an untouched
`git archive` of HEAD fails 17 in 9). `RscSection` reads the static test from the capture
(`capture.sectionServerStatic`, set by `view.jsx`) instead of importing the registry, which would add a
module cycle through `sectionArray`.

**Interactions checked** (05:30–06:10, playwright, 5556 RSC against 5557 today's path, same build; scripts in
`scratchpad/perf-rsc/parity/`: `propagate.mjs`, `sort.mjs`, `loop.mjs`, `prof.mjs`):
- **A filter island driving the other islands works.** County Template `select_jurisdiction` (16 islands):
  picking Callicoon in the Jurisdiction filter updates the annex islands (BETHEL → CALLICOON). The filter is
  URL-bound, so on both paths it is a `navigate()`; on today's path that re-runs the route loader in the
  browser, on RSC it fetches the page's `.rsc` payload and the islands remount. Time until the new
  jurisdiction shows, two runs each: today's path **8.0 / 9.4 s** (184–195 requests, 19.7 MB), RSC **5.4 /
  5.6 s** (30–31 requests, 8.7 MB).
- **The remount re-creates every island, maps included.** In headless Chrome (software GL) the map's
  teardown (`WEBGL_lose_context`) blocks the main thread for 50 s+, so the RSC timings above are with WebGL
  off; on a real GPU it is milliseconds, but the map does re-create on every filter change, which today's
  path avoids (future direction 16).
- **Isolation**: with WebGL off, today's path loses the whole page to the map's error (176 characters of text
  left); RSC keeps every other section and the map's server HTML (`IslandBoundary`).
- **Spreadsheet header menu and sort** (`/status/issue_tracker`): the same menu (Sort, Select…), the same
  options (Not Sorted, A->Z, Z->A) and the same result on both paths; no errors on either.

**Not checked yet**: component actions (`setActionParam`) between islands; Spreadsheet paging; `initNavigate`
on pages whose URL-bound variables are absent from the URL (its navigation now goes through the RSC router,
which serves the same page again).

**Measured** (03:58–05:20, phase tier, build `islands3`): every sampled page served; island pages 1.4–4.8 s
warm Complete against 2.6–10.2 s on S2; no errors; off unchanged. Details in "Phase results" (S8 bullets).

### Loading settings (S7b): 'force' sections queried twice

With `preload_data` on, the page loader reads a section's rows on the server, and a section whose
`fetchMode` is **`force`** then reads them again in the browser on mount (`useDataLoader` bypasses its dedup
for `force`). `force` is common: in `dms_mny` ~4,500 Card and ~1,200 Spreadsheet component rows of the county
template V3 family and ~150–200 per county pattern; in `dms_tny` the npmrds report sections (3,672 AVL Graph,
677 Spreadsheet, 219 Card) and the landing/npmrds2 footer Card ("NPMRDS DATA THRU …"). Every one costs a
duplicate dataset query per view, and keeps its page off the RSC path.

Changing the patterns' settings to `smart` was considered and not done: on a preload pattern a `smart` section
whose preload runs over the 5 s budget falls back to its **saved** rows, and its dedup then never fetches
(the frozen-seeds failure, persisted-cached-rows-freeze-section.md); `force` exists for live data. Instead,
the library: `preloadSectionData` stamps `display.preloadedAt`, and a `force` section skips its **first**
fetch when its rows were preloaded within the last 2 minutes (`useDataLoader.js` `skipFirstForced`). A saved
copy's stamp is old and an over-budget section has none, so both still fetch; later fetches (filter changes)
are as before. Behaviour is unchanged except one fewer query per `force` section per view. Built and
measured after the phase chain (step "preload-dedup").

## Future directions for performance (from the measurements)

Ordered by what the runs say they would save. Each one names its evidence; none is done in this task unless
it says so.

1. **Static Spreadsheet on the server (phase 3).** Since S8 the 102 pages that fell back only because of a
   Spreadsheet are served, with the Spreadsheet as a section island; the island still downloads the section
   code and fetches its rows in the browser. Server-rendered rows, with the header and pager as small client
   islands, would make those pages as light as the text pages. Unlike Card there is no settings rule to
   write: a view Spreadsheet sorts on header click and selects cells unless `disableSort` /
   `disableCellSelection` are set, and pages by infinite scroll.
2. **Stop listing every data source on view.** `useDataSource.getSources` runs in view on every data section:
   ~300 KB and 0.4–3 s per page on 79 of 159 MNY and 37 of 45 county pages, used only by the editor's menu.
   Load it when the menu opens or the viewer can edit. In view it also refreshes the section's saved
   `externalSource` from the list (columns, name: the attribution difference in S8 parity), so the cheap
   version fetches only the bound source(s) by id. Since S8 it is the slowest part of a click to an island
   page (MitigateNY 0.89 → 1.68 s), because an RSC document load has no Falcor cache to find it in.
3. **Shrink the parcel table** (`s1649_v2354`, 39 GB for ~8 GB of rows): `pg_repack` or `VACUUM FULL` in a
   maintenance window makes every remaining full scan ~5× cheaper (the statewide pages). Then
   **precompute the statewide aggregations** (a materialized view per Spreadsheet totals row /
   county grouping, refreshed with the source), which no index can make fast.
4. **Raise mercury Postgres's `/dev/shm`** (the container's `shm_size`): the parallel `VACUUM` failed for
   want of shared memory, and parallel hash joins / sorts can fail the same way under load.
5. **Server-side query cache** (phase 7): many pages run identical dataset queries (statewide totals, the
   capabilities catalogue at 2.3 s × 137 visits); a short-lived cache keyed by view + query in dms-server
   would serve them in milliseconds. Together with streaming, the preload budget (5 s before the first byte
   on heavy pages) stops mattering.
6. **The CDN Tailwind runtime** (`@tailwindcss/browser@4`) loads and compiles CSS in the browser on every
   page, on both paths; move that CSS to build time.
7. **The sync bootstrap for signed-out visitors**: every page load on today's path fetches the pattern's
   rows for local-first sync (`/sync/bootstrap?…pattern=…`, a `SELECT *` of ~7,000 rows on MNY) after the
   page is usable. S6b + S7b measured what it costs when it isn't already cached: **3.6–4.8 s per County
   Template visit**, and 26 more requests. Signed-out visitors can't edit, so skip it or defer it. On the RSC
   path it never runs, which is a large part of the served pages' gain, and the reason the first page
   crossing to today's path is so expensive.
8. **Barrel imports in themes** (transportny, mny components): they pull the whole library into the theme
   chunk, so any island that loads the theme loads everything. Import modules directly (the spike did this
   for `widgets.js`, `NavCta`, `DotMorph`). The same applies to the app's pattern types: `src/patterns/index.js`
   and the map editor import the library barrel, so every page with a section island loads it through
   `loadPatternTypes` (S8). Register app pattern types from their own modules, and give the Map section a
   lazy entry.
9. **The RSC island's payload** (57 KB on `/work`): it carries the pattern's whole theme and nav tree; send
   the selected theme's overrides and the visible nav only.
10. **Route discovery on RSC pages**: every page fetches `/.manifest?paths=…` for every link on it. One
    route serves all pages, so `routeDiscovery: { mode: 'initial' }` would remove that request.
11. **Make the first crossing from a served page to today's path cheaper**, for the pages that stay there
    (now 6 of 338 measured): when a served page goes idle, prefetch today's entry chunk
    (`<link rel=modulepreload>`), so a visitor who then follows a link doesn't parse 0.9 MB after the
    click. It doesn't help the sync bootstrap (item 7).
12. **Measure the crossing on purpose** (the `dms perf` harness): a warm context is primed with home only.
    Once home is served, the warm visits to unserved pages measure "first visit to today's path" (cold
    bundle, cold sync), not a returning visitor (S6b + S7b, County Template 7–10 → 16–21 s). Prime with
    one served and one unserved page, or record the crossing as its own visit type.
13. **Today's path renders some pages twice, and its nav differs between server and client.** `/status/status`
    hits a script error ("Invalid or unexpected token") and React #418, and the client appends a second copy
    of the page. On platform_docs the side nav gains "What's new" and "Help and feedback" only after the
    client loads (they're in the page list the server has, so the server and client nav filters differ).
    The RSC path matches the server render. Both are bugs on today's path (found in S8 parity).
14. **Island payload**: an island page's payload carries the page row (static sections' element-data
    blanked) for `PageContext`. On data-heavy pages, send only the live sections' rows and the page
    variables.
15. **Inline images in dataset cells.** County Template `select_jurisdiction` is a 19.6 MB document on
    today's path (9.96 MB on RSC): one Card cell, Bethel's `lhmp_other_hazards` in the Jurisdictions dataset
    (`mny+jurisdictions`, view 1346450), holds two pasted base64 images (4.0 and 4.3 MB). Today's path sends
    it twice (the HTML and the hydration data), RSC once. Upload pasted images to storage in the Lexical
    editor and rewrite the existing cells to URLs; a size check on save would catch the rest. Not fixed here:
    it is site content.
16. **URL-bound filters on RSC pages: update in place.** A filter change is a navigation that refetches the
    whole page payload and remounts every island (S8 interactions). It is already faster than today's
    path on the page measured, but a page whose static sections don't read page variables could apply the
    change in the browser (`history.replaceState` + the islands' `PageContext`) and skip the round trip.
    Needs a per-page "static sections use page variables" flag from the server census.
17. **Not performance, found on the way:** the server accepts dataset row edits from signed-out visitors on
    `nys_dams` and `jurisdictions` rows (above); for the owner (auth rules).
18. **Signed-in renders start with an empty data cache.** S5: TTFB ×1.29 signed in, because a request-scoped
    Falcor model has nothing cached, while the anonymous one is warm. Confirmed in S9 (2 extra data requests on every signed-in
    render, +15–60 ms unloaded; RSC on/off makes no difference). Depends on issue 3 of
    ssr-logged-in-render-and-stale-cache.md (the shared model never refetches): a per-user cache needs the same
    invalidation on writes, or editors see their own edit late. A per-user model kept a few minutes (like the
    per-user route tree), or reading rows the user's grants make public from the shared model, would recover most
    of it. (Signed-in RSC rendering, the other half of this item, is S9.)
19. **Not performance, found on the way (S5), both fixed in S9 with tasks of their own:** the sign-in form lost
    text typed before it hydrated ([login-form-hydration-race.md](../current/login-form-hydration-race.md)); the login
    token carried the user's bcrypt password hash ([login-token-password-stamp.md](../current/login-token-password-stamp.md)).

## Phases

Each phase ships on its own and leaves the site working with `DMS_RSC` off.

### Phase 0 — React Router 8 (about 1–2 days)

- [x] Turn on `v8_middleware` on 7.18, fix what reads `context` in loaders (nothing reads it: no loader, action
  or middleware takes `context`). Set in `createBrowserRouter` (`render/spa/dmsSiteFactory.jsx`) and
  `createStaticHandler` (`render/ssr2/handler.jsx`); ignored by 8, kept while TransportNY's vendored copy runs 7
- [x] Upgrade to 8.5.x: dms-template `react-router ^8.5.2` (8.5.2 installed); the library's range is
  `^7.5.3 || ^8.0.0` so TransportNY's copy keeps working on 7. `RouterProvider` was already imported from
  `react-router/dom`. All 22 names we import from `react-router` / `react-router/dom` exist in 8
  (`unstable_matchRSCServerRequest` under the `react-server` condition, as before)
- [x] Full regression on the hub: view, edit, admin, datasets, auth, SSR on and off (2026-11-21, below)

Part of this task (owner, 2026-11-18). Kept whatever the spike decides.

**Regression (2026-11-21).** Builds `islands3` (7.18.3) and `rr8` (8.5.2), same code otherwise; `parity/smoke.mjs`
visits 29 URLs on five hosts (view pages, `/edit/…`, admin `/list`, datasets `/cenrep`, `/datasources`,
`/freightatlas/freight_data`, qa `/qa`, `/auth/login`, Spreadsheet `/status/issue_tracker`), signed out and
signed in through each host's login form, and records status, final URL, text, errors and hydration errors.
- SSR on (today's path): **57 of 57 visits the same** on 7 and 8 (two text-length differences are pages caught
  mid-load).
- SSR off (the plain SPA, what a Netlify site serves; `spa_static.mjs` with 5556 as the API): **57 of 57 the
  same**, signed in included (admin, datasets, the editor).
- RSC on (8 only: the old RSC build can't start any more, its server bundle imports `set-cookie-parser`, a
  React Router 7 dependency npm removed): 55 of 57 the same as 8 with RSC off; the two differences are errors
  that go away (County Template home).
- `npx vitest run` (packages/dms): the same 15 failures in 7 files as before, none new.
- Found on the way, on 7 and 8 alike: **every signed-in page view on today's path fails hydration** (React #418;
  issue 1 of ssr-logged-in-render-and-stale-cache.md), and a signed-in `/edit/…` on MitigateNY and County
  Template lands on the view page with SSR on but opens the editor as a plain SPA. Both come from the server
  rendering signed out: phase 1.
- **Performance (`chain_rr8.sh`, phase tier, 12:07–13:30):** no change from the upgrade alone. Per page, the
  warm median `complete` of 8 over 7 (same code, builds `rr8` vs `islands3`), geometric mean over 44 pages:
  ×0.987 with RSC off (5 pages >10% faster, none >10% slower) and ×1.013 with RSC on (2 faster, 4 slower);
  TTFB ×1.005 and ×1.039, FCP ×1.005 and ×0.996, each with about as many pages up as down. Client JS is the
  same size (2.93 MB gzipped, +1 KB). `node scratchpad/perf-rsc/rr_ratio.cjs islands-rsc-off rr8-rsc-off`.
  The RSC-on half ran with the phase 1 server code loaded from source (no cookie set, so only a cookie
  check, `Vary: Cookie` and ~40 bytes of page data).
- weatheranalytics' sign-in form is not found by the smoke (its login page differs); not investigated.
- Deploy note: React Router 8 needs Node 22.22+; mercury's image is `node:22-bookworm-slim` (check the tag's
  current 22.x before deploying).

### Phase 1 — Session cookie (not experimental; ships to both paths)

- [x] dms-server: login sets the cookie, logout clears it, token → cookie exchange endpoint
- [x] `render/ssr2`: resolve the user per request; the request's Falcor model carries it
- [x] Client: first render starts from the server's user; no hydration mismatch signed in
- [x] Restricted page arrives rendered for a user who may read it; `Cache-Control: private`
- [x] Issues 1 and 2 of ssr-logged-in-render-and-stale-cache.md fixed on the hub (closing them waits for a deploy)
- [x] Signed-in measurement (S5, 2026-11-21; below)
- [x] The router rebuild and the signed-in route tree (S5b, measured 2026-11-21)
- [x] Signed-in visitors on the RSC path (S9, built, checked and measured 2026-11-22: signed in ×0.37 to Complete)

**Built (2026-11-21, build `p1cookie4`).** Phase A of [ssr-session-cookie.md](../current/ssr-session-cookie.md) plus a
per-request data model; phase B (the server answering a protected page with a 302) is not done.
- **dms-server** (`auth/session.js`, new): `POST /_session` sets `dms_session=<token>|signed-out`, `HttpOnly`,
  `SameSite=Lax`, `Path=/`, `Secure` on https, `Max-Age` = the token's remaining life (at most 7 days). Same-origin
  JSON only (403 otherwise, 415 for a form post); the token is verified before it is set. `createSessionResolver`
  gives the SSR middleware `{ state: absent|signed-out|user, user, token }`, a bad or expired token counting as
  signed out. The API (`/graph`, REST) ignores the cookie. `auth/jwt.js` `userForToken` (the cached verify) is
  shared with the API's middleware.
- **Server render** (`render/ssr2/handler.jsx`): each render runs in an `AsyncLocalStorage` scope
  `{ session, user, token, models }` (`utils/requestScope.js`). Route models are `requestScopedModel` proxies
  (`dmsPageFactory.jsx`): anonymous requests use the host's shared model, a signed-in one gets a model of its own
  that sends its token, dropped with the request, so a user's rows never reach the shared cache. Host routes are
  built outside any scope; a host whose anonymous site data has `no-access` stubs gets a per-user route tree
  (5 minutes, at most 200). The router is rendered inside `authProvider`, as the browser renders it, seeded from
  the scope's user. **Before this the server had no auth provider at all**, so `useAuth()` returned the context
  default: every server render was signed out whatever the cookie said. The stub `window.location` is set to the
  request's URL before each (synchronous) `renderToString`; it said `localhost` before, which the admin's site
  list prints.
- **Middleware** (`express/middleware.mjs`, `setup.mjs`): `resolveSession` option; `__dmsSSRData.session =
  { state, user }` (no token, no password); `Vary: Cookie` always; `Cache-Control: private, no-store` for a user.
- **Browser** (`patterns/auth`): the first state is the server's user (`__dmsSSRData.session.user` + the stored
  token), so hydration matches. Sign-in, sign-out and create-site call `syncSessionCookie`; on load the cookie is
  rewritten when the server's state and the stored token disagree (a token from before the cookie existed: one
  mismatched first load, then the cookie is set).
- **RSC**: renders anonymously. A signed-in document goes to today's SSR (`X-DMS-RSC: pass: signed in`); a
  signed-in `.rsc` navigation gets a document redirect and is never cached. RSC documents are shared, so they
  carry no session: `hydrate.js` sets `window.__dmsRscPage` and the browser writes the cookie from a stored token
  (the next navigation then goes to today's path, rendered as the user).
- **`dms perf`**: profile `signed_in` signs in through the site's form (`--login-path`, `DMS_PERF_EMAIL` /
  `DMS_PERF_PASSWORD`; finds the form holding a password field, or a "sign in" button); `run_profile.sh`.

**Checked (2026-11-21).** `scratchpad/perf-rsc/parity/session.mjs` (ssr-session-cookie.md's Testing list), on
`tny.localhost` with admin `/list` as the sign-in-only page: **16 of 16 pass with RSC off and with it on**: cookie
`HttpOnly`/`Lax`, 6 h; signed in, `/list` arrives rendered (958 characters of text vs 34 signed out); state `user`
in the page and no token anywhere in it; `private, no-store` + `Vary: Cookie`; **no hydration error signed in** on a
view page, `/list` and the editor (React #418 on all three before); the API gives the cookie alone the anonymous
answer; a cross-origin `/_session` gets 403; a bad token renders signed out; no cookie + stored token stays on the
page and writes the cookie (on an RSC page too); sign-out writes `signed-out`.
Smoke (`parity/smoke.mjs`, 57 visits, vs build `rr8`): **no regressions** on either path. RSC off: 23 signed-in
#418 errors gone, and signed-in `/edit/…` on MitigateNY and County Template now opens the editor (it landed on the
view page). RSC on: the same, plus County Template home signed in now shows today's path's existing "Error fetching
data" (it was served RSC's anonymous page before).
Seen, not caused by this: `#root`'s first `<div>` is replaced after load signed out as well (today's path);
found and fixed in S5b, below.
weatheranalytics is left out of the signed-in runs: the dev account has no group in project
`weatheranalytics` on the hub ("You do not have access to project weatheranalytics"; the "project are
required" message first seen was the sign-in form's hydration race, S9). Not a code bug; a grant, left alone.
Not done: phase B. (The PDF renderer's cookie and signed-in RSC rendering: S9.)

**Measured (S5, 2026-11-21, phase tier, 5 runs, warm visits).** Signed-in references are build `rr8` (no cookie:
the server renders a signed-in visitor anonymously and the browser re-renders as the user), RSC off; 8 sites
(weatheranalytics' sign-in fails on the hub). Median page, warm Complete:

| Site | rr8 off (ref) | p1 off | p1 on | rr8 on ³ |
|---|---|---|---|---|
| availabs | 3.38 s | 4.31 | 4.33 | 1.51 |
| tny_landing | 1.97 | 2.25 | 2.27 | 0.71 |
| tny_status | 2.49 | 2.01 | 2.02 | 1.62 |
| tny_freightatlas | 3.97 | 4.26 | 4.25 | 2.13 |
| tny_npmrds2 | 4.19 | 4.25 | 4.49 | 2.22 |
| tny_platform_docs | 3.01 | 2.84 | 2.78 | 1.21 |
| mny_countytemplate | 7.32 | 7.48 | 7.82 | 2.10 |
| mny | 8.17 | 8.05 | 8.41 | 2.98 |

Per page (40 pages, geo-mean): p1 RSC off warm complete **×1.09**, TTFB **×1.29**, FCP ×1.07; p1 RSC on ×1.11
(signed in goes to today's path, so on ≈ off). Signed out, p1 vs rr8: ×1.00 off and on (44 pages): the cookie
costs anonymous visitors nothing. ³ rr8 with RSC on served signed-in visitors the anonymous RSC page: fast
(×0.40) but not their page, the case phase 1 exists to end. What the slowdown is: the server now renders as the
user with a request-scoped Falcor model that starts empty (an anonymous render reads the host's warm shared
model), hence TTFB; and in the browser the page then rendered twice (two `track/visit`), because of S5b's bug.

**S5b: the router rebuilt after load (found 2026-11-21, fixed, build `p1remount2`).** Two bugs, one symptom:
`#root`'s content was replaced about a second after load and every page mounted twice.
- `dmsSiteFactory.jsx`: after the first render, the full site fetch replaced `dynamicRoutes` unless
  `hydrationData` was set (it never is: `main.jsx` passes `ssrData.hydrationData`, which the server doesn't
  send) or the fetched site data equalled `appliedSiteDataRef`, which started `null` when the first render came
  from `defaultData`. A new routes array rebuilds the router and remounts the page. Fix: the ref starts as the
  first render's site data. Signed out, every page now mounts once.
- `render/ssr2/handler.jsx` `hasNoAccessStubs` looked for `id === 'no-access'`, but ref expansion overwrites a
  stub's `id` and keeps `no_access: true` (`api/proecessNewData.js`, which `render/spa/utils/snapshot.js`
  already reads). So no host ever counted as restricted and **a signed-in visitor always got the anonymous route
  tree and site data** (on tny, four patterns as stubs), which the browser's own fetch then contradicted.
  Fix: read `no_access` too. Signed in, every page now mounts once (one `track/visit`).
Checked: `session.mjs` 16 of 16, RSC off and on; tny and mny, signed in and out, nothing replaced in `#root`
(a signed-out `/list` still swaps once: the redirect to sign-in). React #418 "on availabs" (reported
here first) was the probe's mistake: `availabs.localhost` is no tenant, and its "Tenant not found" page renders
blank on the client's first render (no site data), a mismatch on that error page only. availabs itself is
`localhost`: no error.
Measured (19:26–22:23, `chain_remount.sh`, build `p1remount2` vs `p1cookie4`, warm, per page geo-mean): signed in
complete **×0.94** RSC off and **×0.93** on (40 pages; 10 and 13 pages >10% faster, 1 slower), so signed in is
now ×1.02 of the reference that rendered the visitor anonymously. Median page, signed in, RSC off: availabs
4.31 → 4.25 s, tny_landing 2.25 → 2.06, tny_status 2.01 → 1.92, tny_freightatlas 4.26 → 3.99, tny_npmrds2
4.25 → 3.95, tny_platform_docs 2.84 → 2.77, mny_countytemplate 7.48 → 7.41, mny 8.05 → 7.32. Signed out:
×0.94 RSC off (34 sampled pages; MitigateNY median 7.48 → 7.10 s), ×0.98 on (most pages are RSC-served, which
this does not touch). Signed-in TTFB stays ×1.32 of the anonymous render (future direction 18). TTFB and FCP
moved ±10–30% per site between builds that cannot affect them (County Template FCP 1.72 → 1.18 → 1.94 s across
rr8 / p1 / p1remount2), so their per-page ratios here (×1.03–1.16) are read as noise. Per-user route trees (the
`hasNoAccessStubs` fix) showed no cost: the runner's first, unmeasured visit builds them.

**S9: signed-in visitors on the RSC path (2026-11-22, build `rscsi2`).** Until now a signed-in document went to
today's SSR and a signed-in `.rsc` navigation got a document redirect. Now:
- `render/ssr2/express/setup.mjs`: the mount passes `{ session }` to the RSC handler for every request, marks
  every response `Vary: Cookie`, and a signed-in one (document or payload) `Cache-Control: private, no-store`.
- `render/rsc/rscHandler.js`: `handler(request, { session })`; the can't-serve cache is keyed by user as well
  as URL for a signed-in visitor (what they may read decides what can be served).
- `render/rsc/resolvePage.js` → `render/ssr2/handler.jsx captureRender(request, { session })`: the capture
  render runs in the request's scope (per-user route tree and data model, as `render()`), inside the
  `authProvider` router (it had none: the view page's auth checks saw the context default). The page carries
  who it was rendered for, `island.session` = `{ state: 'user', user }` (no token, no password) or
  `{ state: 'anonymous' }`.
- `render/rsc/ClientChrome.jsx` passes it to `authProvider` as `session`; `patterns/auth/providers.jsx` starts
  from it (in the HTML pass, which has no request scope, as the user without a token), and syncs the cookie
  against it.
- Found on the way, older than this task: **`render/ssr2/express/middleware.mjs` filled the HTML template with
  `String.replace` and replacement strings**, where `$'` means "the text after the match". `/tsmo/home`'s loader
  data holds a SQL regex ending `\d{2}$'`, so the rest of the template (`</div></body></html>`) was pasted into
  the page's data script, which then failed to parse ("Invalid or unexpected token"), and the browser rendered
  the page a second time below the server's copy. Signed out the page is a no-access screen, so it showed only
  once signed-in pages rendered as the user (phase 1). Fix: replacer functions.
- Also built: the sign-in form's hydration race ([login-form-hydration-race.md](../current/login-form-hydration-race.md)),
  the PDF renderer sets the session cookie for the page's host (`dms-server/src/pdf/render.js openTab`), and
  tokens carry a password stamp, not the hash ([login-token-password-stamp.md](../current/login-token-password-stamp.md)).

Checked (2026-11-22, `rscsi1`/`rscsi2`): `parity/session.mjs` 16 of 16 (RSC on); smoke 56 of 57 visits as
`p1cookie4`, the 57th a fix (County Template home signed in: RSC as the user, without today's path's "Error
fetching data"); `parity/rsc_signedin.mjs`, 14 signed-in view pages on four hosts: 13 served by RSC (the 14th,
`/freightatlas/freight_data`, is not an opted-in route), all `private, no-store`, no errors, the user in the
chrome and edit links shown, including `/tsmo` and `/npmrds`, which signed-out visitors can't open. Text, RSC
on vs off, signed in: 11 pages word for word; MitigateNY drought's table rows differ between two runs of the
same path (unordered rows) and its attribution label is S8's known difference; County Template drought shows
"please enter value..." (an empty Card cell's edit placeholder, as text) on today's path only, signed out too;
`/tsmo` was the template bug. A signed-in `.rsc` request: 200, rendered as the user, private, no token in it;
signed out it redirects (no-access page). PDF export (`mode: self`) of `/tsmo/home` and a docs page: both
printed, none skipped. A nav-link click from an RSC page loads a document signed in and signed out alike (as
before).

Measured (2026-11-22 00:57–01:59, `chain_rscsi.sh`, phase profile, warm visits, RSC on, label `si-rsc-on`):
- **Signed in, 40 pages on eight sites:** Complete ×0.37 against today's path (`rr8-rsc-off`) and ×0.36 against
  the previous build with RSC on (`p1rm-rsc-on`, where signed-in documents still went to today's SSR); 40 of 40
  pages more than 10% faster. Site medians, today's path → RSC: MitigateNY 8.17 → 2.34 s, County Template
  7.32 → 2.08 s, npmrds2 4.19 → 1.89 s, freightatlas 3.97 → 1.99 s, availabs 3.38 → 1.42 s, platform_docs
  3.01 → 1.04 s, tny status 2.49 → 1.52 s, tny landing 1.97 → 0.60 s. The same gain signed-out pages got (public,
  today's path → RSC: ×0.37).
- **Signed in, first byte and first paint:** time to first byte ×1.31 and first paint ×1.02 against `p1rm-rsc-on`.
  The RSC render runs before the first byte, as it does signed out (public, today's path → RSC: first byte ×1.30,
  first paint ×1.01). Against `rr8-rsc-off` the figures are ×1.72 and ×1.24: ×1.29 of that is phase 1's, not S9's
  (below), so ×1.29 × ×1.31 ≈ ×1.7.
- **Why signed-in first bytes rose with phase 1 (checked 2026-11-22 after the run):** not drift and not the RSC
  mount. RSC on vs off in the same build changes signed-in first byte by ×0.97 (`p1`) and ×0.995 (`p1rm`); the step
  is `rr8-rsc-off` → `p1-rsc-off` (×1.29, two runs ten minutes apart), the cookie. It is a fixed cost per request:
  pages under 400 ms gained 30–150 ms (`/docs/home` 61 → 152, availabs `/home` 116 → 193), pages of 1.5–3.5 s
  barely moved. Cause, by direct requests to the `rscsi2` server with the server's `[graph]` log
  (`ttfb_probe.mjs`, session scratchpad): a warm anonymous render makes **no** data requests (the shared model has
  everything), a warm signed-in render makes 2 more on every request (`dms.data.<app>+<type>|page.length/byIndex/
  searchOne`, then `dms.data.<app>.byId`), because its request-scoped model starts empty: +15–60 ms per request
  unloaded (availabs `/home` 77 → 100 ms, MitigateNY `/` 124 → 187 ms). Session lookup is cached
  (`userForToken`), the per-user route tree is cached (no extra build seen). Before phase 1 a signed-in document
  rendered anonymously from the warm shared model, so it never paid this. First paint follows first byte: the
  browser's share (first paint − first byte, page median) stays 427–481 ms in every run; the higher means in the
  `p1rm` runs are a few outlier pages.
  What would recover it is future direction 18 (signed-in renders start with an empty data cache), but a per-user
  model kept across requests would be as stale as the shared one, and the shared one never refetches page data
  (the zero requests above are issue 3 of
  [ssr-logged-in-render-and-stale-cache.md](../current/ssr-logged-in-render-and-stale-cache.md), now measured). For editors,
  who reload to see their own edit, that is worse than 20–60 ms. So: invalidate server-side models on writes
  (issue 3) first, then keep per-user models.
- **Signed out, 44 pages:** against `p1rm-rsc-on`, Complete ×1.03, first byte ×1.03, first paint ×0.95: no
  change. weatheranalytics is signed out only (no grant for the dev account, see S5).

### Phase 2 — Spike, one week, with a go/no-go

One site (MitigateNY on the hub), behind `DMS_RSC`.

- [x] `@vitejs/plugin-rsc`, three entries, Express dispatch on the route's `serverComponent` key (spike, 2026-11-20)
- [x] The page pattern's view route opts in: layout and nav, section groups, sections (spike)
- [~] `ServerViewComp` for rich text, header and footer; every other type as a client island with today's props (spike: content rendered by today's components in the `ssr` environment, not `ServerViewComp`; islands done in S8)
- [ ] `useTheme()` by export condition; the request's user from phase 1
- [ ] Streaming on, one `Suspense` per section
- [~] Settle the opt-in key's name and shape; row in `documentation/extension-points.md` (the spike's `serverComponent: 'page-view'` and the RSC entries have rows, marked experimental; the name is still the owner's to settle)

Measure on the lightning and flooding risk profiles and a text-only page, against today, signed out and signed
in: time to first byte, HTML size, JS downloaded, time to interactive, server time per request. **Go** if the
build works with the React Compiler and code splitting, text-only pages ship clearly less JS, and nothing
regresses in the editor. **No-go** → build streaming on the current pipeline instead (our own hydration script
and per-section data scripts), which needs no experimental API. Phases 0 and 1 are kept either way.

Evidence for the go/no-go so far (2026-11-21, autonomous run; the decision is the owner's):
- For go: signed out, every sampled page across five sites is served (S8) and 2–5× faster to Complete on a
  warm visit (S2 → S8: MitigateNY island pages 8.73 → 4.76 s, its text pages 14.18 → 1.48 s, County Template
  10.19 → 3.55 s, platform_docs 2.76 → 0.97 s), with 5–25× less blocking time and no console, page or
  hydration errors where today's path has them; a filter change on the heaviest page tested is faster than
  today's (5.5 s vs 8–9 s); flag off changes nothing.
- Signed in (S9, 2026-11-22): the same gain, Complete ×0.37 on 40 of 40 pages, first byte ×1.31 as signed out.
- Not yet measured: the editor, cold visits (JS downloaded on a first visit), and the lightning / flooding risk profiles
  specifically (the County Template hazard pages are the nearest measured).
- Still open: streaming (S8 serves the whole page at once), the React Compiler in the RSC build, and the
  risks in "Not checked yet" (S8).

### Phase 3 — Card and static Spreadsheet on the server

- [ ] `Card.server.jsx`, `spreadsheet/Spreadsheet.server.jsx`, `serverView` from the section's settings
- [ ] Server-safe `UI.Table` and `UI.Card` pieces
- [ ] Same-markup check against the client version for every such section on the site (as the equivalence
      check in page-hydration-payload.md)

### Phase 4 — Filters and params through the URL

- [ ] Filter changes re-render server sections; client state in islands survives
- [ ] Action params in the URL for server subscribers; sections that can't, stay client

### Phase 5 — Maps and interactive tables get server-built props

- [ ] `clientProps` for Map: the layer and filter settings the map reads, no copied column lists
- [ ] `clientProps` for interactive Spreadsheet and Graph: rows as a streamed promise

### Phase 6 — Graph on the server

- [ ] SVG with a `viewBox` and no measured width; a small client hover layer
- [ ] Only for graph types where it is the same picture; the rest stay client

### Phase 7 — Caching, and pages with no client router

- [ ] Cache a server section's rendered output by section, its `updated_at`, the params it reads and the
      source view
- [ ] `hydrate: false` for pages with no client sections at all

### Phase 8 — Other routes opt in; one router

- [ ] Routes move a route at a time, as it makes sense: client-only routes (the editor, admin, datasets) opt
      in as client components where server rendering adds nothing
- [ ] When every route of every registered pattern has the key: remove today's router and the dispatch
- [ ] Not before React Router drops the `unstable_` prefix

## Risks

- **Experimental API.** Breaking changes in any release. Limited by: three files, pinned versions, the flag,
  the old path kept.
- **Two render paths to maintain** until every route has opted in (phase 8).
- **Server and client versions of a section can drift.** One shared pure function per type turns state and
  rows into markup; the server and client components both call it. The equivalence sweep catches the rest.
- **Themes that register components** work as client islands; nothing breaks, but they gain nothing until
  they opt in.
- **Payload doubling** (above) may eat the size win on table-heavy pages. Measured in phase 2.
- **React Compiler and plugin-rsc** together are untested by us and undocumented by them.

## Decided (owner, 2026-11-18)

- The opt-in is a key on the route in `siteConfig`; the core never names a pattern or an action.
- A full page load between an opted-in route and one that hasn't is acceptable.
- The session cookie and the server knowing the user are part of this task.
- Routes move one at a time; one router is the end state.
- The React Router 8 upgrade (phase 0) is part of this task, not its own.
- Which site turns the flag on after MitigateNY is chosen once the spike has reported.

## Testing checklist

- [ ] Phase 0 regression (above)
- [ ] Spike measurements: the phase tier, `DMS_RSC` off and on, against its reference ("Measuring the task")
- [ ] Perf baseline before any change: full run of 9 patterns (started 2026-11-20, "Baseline")
- [ ] Hydration errors: 0 on every page of the site, signed out and signed in, on both paths
- [ ] Cookie: set at login, cleared at logout, exchanged for an existing token; a request with the cookie and no
      token can't write
- [ ] Markup equivalence, server vs client, per migrated section type
- [ ] Streaming through nginx on mercury: sections arrive separately
- [ ] Editor unchanged: edit, save, publish; view → edit → view
- [ ] `DMS_RSC` off: byte-identical to today

## Sources

- React Server Components how-to: https://reactrouter.com/how-to/react-server-components
- `unstable_matchRSCServerRequest`: https://reactrouter.com/api/rsc/matchRSCServerRequest
- `unstable_routeRSCServerRequest`: https://reactrouter.com/api/rsc/routeRSCServerRequest
- Streaming with Suspense: https://reactrouter.com/how-to/suspense
- Updating from v7: https://reactrouter.com/upgrading/v7
- Changelog: https://github.com/remix-run/react-router/blob/main/CHANGELOG.md
- `StaticRouterProvider` source: https://github.com/remix-run/react-router/blob/main/packages/react-router/lib/dom/server.tsx
- `@vitejs/plugin-rsc`: https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc

## Appendix: the code this task wrote, and what became of it (2026-11-24)

The owner chose the islands path ([static-html-islands.md](./static-html-islands.md)) on 2026-11-24
after the three-way measurement (that doc's log, 2026-11-23): the two paths load pages equally fast, and the
islands path needs one build, no unstable APIs and less code. The RSC delivery was removed from the tree the
same day. None of it was ever committed, so **this appendix is the only copy of the removed files.** They are
reproduced in full below, as they stood at removal, so the path can be rebuilt if React Router's RSC APIs
become stable and a reason appears (server functions, sections that mix server and client parts).

### Kept, because the islands path uses it

| Written by this task | Where it is now |
|---|---|
| Phase 0 (React Router 8) and phase 1 (the session cookie, `utils/requestScope.js`, per-user server renders) | unchanged, live on every path |
| The capture render: `captureRender` / `captureInScope` in `render/ssr2/handler.jsx`, the capture block in `patterns/page/pages/view.jsx`, the capture's use in `sectionArray.jsx` and `dataWrapper/useDataLoader.js` | unchanged in place; the context is `IslandsCaptureContext` (`render/islands/captureContext.js`, was `RscCaptureContext` in `render/rsc/`); the slot element is `<dms-slot>` (was `<dms-rsc-slot>`) |
| `render/rsc/ClientChrome.jsx`, `StaticSlot.jsx`, `slotHtmlContext.js`, `IslandHost.jsx`, `SectionIslands.jsx`, `clientConfig.js` | moved to `render/islands/`; `configureRscClient` / `getRscClientConfig` are `configureIslandsClient` / `getIslandsClientConfig` |
| `patterns/page/components/sections/rscSections.js`, `RscSection.jsx` | `staticSections.js`, `CapturedSection.jsx` in the same folder |
| The registry keys `serverStatic` and `serverIsland`, and the rules on Card, rich text, footer, the MitigateNY header and the PDF generator | unchanged |
| The route key `serverComponent: 'page-view'` (`patterns/page/siteConfig.jsx`) | renamed `islandsView: 'page-view'` |
| `pages/usePageViewState.js`, `utils/nav.js` (`nav2Level`), `LazyReportIssue.jsx`, the `@dms-host/*` aliases | unchanged |
| `dms perf` RSC detection, the measurement harness in `dms-template/scratchpad/perf-rsc/` | the harness is untouched (scratch); `dms perf` keeps detecting an RSC page so old runs still read |

### Removed

| What | Lines | Purpose |
|---|---|---|
| `dms-template/vite.rsc.config.js` | 56 | the second build: `@vitejs/plugin-rsc`, three environments |
| `render/rsc/rscHandler.js` | 115 | the request handler in front of today's SSR: documents, `.rsc` navigation payloads, `.manifest`, the can't-serve cache |
| `render/rsc/resolvePage.js` | 93 | capture render → the page's props for `ViewDocument`; trims the island page |
| `render/rsc/ViewDocument.jsx` | 39 | the server component: the document around `ClientChrome` and the slots |
| `render/rsc/generateHTML.js` | 28 | payload → HTML in the `ssr` environment |
| `render/rsc/hydrate.js` | 25 | the browser: `RSCHydratedRouter` over the payload |
| `render/rsc/entries/{rsc,ssr,browser}.js`, `README.md` | 46 + 19 | the build's three entries |
| `mountRsc` and its call in `render/ssr2/express/setup.mjs` | 60 | the Express mount behind `DMS_RSC=1` + `DMS_RSC_DIST_DIR` |
| `@vitejs/plugin-rsc` (`^0.5.39`) in `dms-template/package.json` | 1 | the build plugin |
| `window.__dmsRscPage` reads in `patterns/auth/api.js` and `providers.jsx` | 2 | replaced by `window.__dmsIslandsPage` |

To build and serve it, as it was: `DMS_RSC_OUT_DIR=<dir> npx vite build --config vite.rsc.config.js`, then
the server with `DMS_RSC=1 DMS_RSC_DIST_DIR=<dir>`. Last measured build: `hi1` (2026-11-23), earlier
`rscsi2`.

### The removed sources

#### The Express mount (`render/ssr2/express/setup.mjs`)

In `setupSSR`, production branch, before the SSR catch-all:

```js
    // RSC spike (rsc-view-pages.md, phase 2): DMS_RSC=1 with an RSC build in DMS_RSC_DIST_DIR (vite.rsc.config.js)
    // puts the RSC handler in front of today's SSR. It answers what it can serve (an opted-in page view whose
    // sections need no JavaScript, the router's `.rsc` and `.manifest` requests) and passes the rest on.
    if (process.env.DMS_RSC === '1' && process.env.DMS_RSC_DIST_DIR) {
      await mountRsc(app, express, {
        rscDir: path.resolve(root, process.env.DMS_RSC_DIST_DIR),
        handlerConfig,
        templateHead: (cachedTemplate.match(/<head>([\s\S]*)<\/head>/) || [])[1]?.replace('<!--app-head-->', '') || '',
        resolveSession,
        getSiteCss,
      })
    }
```

And the function:

```js
async function mountRsc(app, express, { rscDir, handlerConfig, templateHead, resolveSession, getSiteCss = null }) {
  const { Readable } = await import('node:stream')
  const mod = await import(path.join(rscDir, 'rsc', 'index.js'))
  mod.configure({ handlerConfig, templateHead })
  const handler = mod.default
  const clientDir = path.join(rscDir, 'client')
  app.use(express.static(clientDir, {
    index: false,
    cacheControl: false,
    setHeaders(res, filePath) {
      res.setHeader('Cache-Control', path.relative(clientDir, filePath).startsWith(`rsc-assets${path.sep}`) ? IMMUTABLE : 'no-cache')
    },
  }))
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const isRouterRequest = req.path.endsWith('.rsc') || req.path.endsWith('.manifest')
    // documents only: a browser navigation asks for text/html
    if (!isRouterRequest && !(req.headers.accept || '').includes('text/html')) return next()
    try {
      // Who is asking (the session cookie): the page renders as them, as on today's path, and a signed-in
      // response (document or `.rsc` payload) is theirs alone: private, never stored.
      const session = resolveSession ? await resolveSession(req) : null
      // the site's server-compiled sheet for the head (navigations render it too, so they get the same one);
      // best effort, the build's link otherwise
      let siteCss = null
      if (getSiteCss) {
        try { siteCss = await getSiteCss(req) } catch (e) { console.warn('[RSC] site css failed:', e.message) }
      }
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      const response = await handler(new Request(`${req.protocol || 'http'}://${req.headers.host}${req.originalUrl}`, { method: req.method, headers }), { session, siteCss })
      if (response.headers.get('x-dms-rsc') === 'pass') {
        res.setHeader('X-DMS-RSC', `pass: ${decodeURIComponent(response.headers.get('x-dms-rsc-reason') || '')}`.slice(0, 200))
        return next()
      }
      res.status(response.status)
      response.headers.forEach((v, k) => res.setHeader(k, v))
      res.setHeader('X-DMS-RSC', 'served')
      res.vary('Cookie')
      if (session?.user) res.setHeader('Cache-Control', 'private, no-store')
      if (!response.body) return res.end()
      Readable.fromWeb(response.body).pipe(res)
    } catch (error) {
      console.error('[RSC] error, falling back to SSR:', error)
      if (!res.headersSent) return next()
      res.end()
    }
  })
  console.log(`[RSC] spike mounted from ${rscDir}`)
}
```

#### `dms-template/vite.rsc.config.js`

```js
/* global process */
// RSC spike build (src/dms/planning/tasks/completed/rsc-view-pages.md, phase 2): React Router's RSC Data
// Mode with @vitejs/plugin-rsc, three environments (rsc, ssr, client), built next to the normal SSR build
// and served by the same Express server when DMS_RSC=1 (dms render/ssr2/express/setup.mjs).
//
//   DMS_RSC_OUT_DIR=<dir> node node_modules/vite/bin/vite.js build --config vite.rsc.config.js
//
// Output: <dir>/rsc/index.js (the request handler), <dir>/ssr/, <dir>/client/ (browser code under
// /rsc-assets/, so it never collides with the normal build's /assets/). The page head (CSS, fonts) is the
// normal build's index.html, read at runtime; this build has no CSS of its own to make.
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import rsc from '@vitejs/plugin-rsc/plugin'
import baseConfig from './vite.config.js'

// the entries are the library's; this app says where its own modules are with the `@dms-host/*` aliases in vite.config.js
const RSC_ENTRIES = 'src/dms/packages/dms/src/render/rsc/entries'

export default defineConfig((env) => {
  const base = baseConfig({ ...env, isSsrBuild: false })
  const out = path.resolve(process.env.DMS_RSC_OUT_DIR || 'dist-rsc')
  const isProd = env.mode === 'production'
  const progress = base.plugins.find((p) => p?.name === 'build-progress')
  return {
    // the `@dms-host/*` aliases the library's entries import come with the base config (vite.config.js)
    resolve: base.resolve,
    optimizeDeps: base.optimizeDeps,
    ssr: base.ssr,
    plugins: [
      // React Compiler on browser code only, as the normal build (vite.config.js): memoization is
      // pointless in one-shot server renders, and server components can't use its cache hook.
      react({ babel: (id, { ssr }) => (isProd && !ssr ? { plugins: ['babel-plugin-react-compiler'] } : {}) }),
      rsc({
        entries: {
          client: `${RSC_ENTRIES}/browser.js`,
          rsc: `${RSC_ENTRIES}/rsc.js`,
          ssr: `${RSC_ENTRIES}/ssr.js`,
        },
        serverHandler: false,
      }),
      progress,
    ].filter(Boolean),
    environments: {
      client: {
        build: {
          outDir: path.join(out, 'client'),
          assetsDir: 'rsc-assets',
          rollupOptions: { output: { manualChunks: base.build.rollupOptions.output.manualChunks } },
        },
      },
      ssr: { build: { outDir: path.join(out, 'ssr') } },
      rsc: { build: { outDir: path.join(out, 'rsc') } },
    },
  }
})
```

#### `packages/dms/src/render/rsc/rscHandler.js`

```js
// RSC spike, `rsc` environment: the request handler (rsc-view-pages.md, phase 2, design §1).
// Serves three kinds of request:
//   - a document request for a page the RSC path can serve → the page as RSC, rendered to HTML by the
//     SSR environment (generateHTML). Any other document → a 404 carrying `x-dms-rsc: pass`, and the
//     Express mount (render/ssr2/express/setup.mjs) hands the request to today's SSR;
//   - `<path>.rsc` (the RSC router's navigation fetch) → the payload, or, for a page it can't serve, a
//     document redirect, so the browser loads that page the normal way (design §1: crossing between the
//     paths is a full page load);
//   - `<path>.manifest` and `/.manifest?paths=…` (the router's lazy route discovery) → answered by React Router.
// No server functions: decodeAction / decodeReply / loadServerAction are not passed (design §7).
import React from 'react'
import { createTemporaryReferenceSet, renderToReadableStream } from '@vitejs/plugin-rsc/rsc'
import { unstable_matchRSCServerRequest as matchRSCServerRequest, redirectDocument } from 'react-router'
import { ViewDocument } from './ViewDocument.jsx'

export const RSC_PASS_HEADER = 'x-dms-rsc'

// Pages the RSC path can't serve, remembered for a while. Deciding means running today's route tree once
// (loaders included), and a page that can't be served is then rendered again by today's SSR: measured,
// that doubled the server time of every page left on today's path (S6 on, 2026-11-21). Only "can't
// serve" is remembered: a stale entry sends a page that became servable down today's path, which is
// always correct; a stale "can serve" would not be. A signed-in visitor's render is their own (what they may
// read decides what can be served), so their entries are keyed by user as well as URL.
const INELIGIBLE_TTL_MS = 5 * 60 * 1000
const INELIGIBLE_MAX = 5000
const ineligible = new Map()

function ineligibleKey(docUrl, session) {
  const u = new URL(docUrl)
  u.searchParams.delete('_routes')
  return `${session?.user ? `${session.user.id ?? session.user.email}|` : ''}${u.host}${u.pathname}?${u.searchParams.toString()}`
}

function recallIneligible(key) {
  const hit = ineligible.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > INELIGIBLE_TTL_MS) {
    ineligible.delete(key)
    return null
  }
  return hit.page
}

function rememberIneligible(key, page) {
  if (ineligible.size >= INELIGIBLE_MAX) ineligible.delete(ineligible.keys().next().value)
  ineligible.set(key, { at: Date.now(), page: { eligible: false, status: page.status, reason: page.reason, redirect: page.redirect } })
}

function documentRequest(request) {
  const url = new URL(request.url)
  if (url.pathname.endsWith('/_.rsc')) url.pathname = url.pathname.replace(/_\.rsc$/, '')
  else if (url.pathname.endsWith('.rsc')) url.pathname = url.pathname.replace(/\.rsc$/, '')
  return new Request(url, { headers: request.headers })
}

/**
 * @param {object} o
 * @param {() => Promise<{ resolveRscPage, generateHTML }>} o.loadSsr - the SSR environment's entry
 * @param {() => object} o.getConfig - { handlerConfig, templateHead }, set by the Express mount
 */
export function createRscHandler({ loadSsr, getConfig }) {
  // session: { state, user, token } from the page host's session cookie (the Express mount), or null.
  // The page renders as its user; the mount marks a signed-in response private.
  // siteCss: { href, partial, fallbackHtml } | null, the site's server-compiled sheet for the document head.
  return async function handler(request, { session = null, siteCss = null } = {}) {
    const url = new URL(request.url)
    const isManifest = url.pathname.endsWith('.manifest')
    const isRsc = url.pathname.endsWith('.rsc')
    const ssr = await loadSsr()

    let page = null
    if (!isManifest) {
      const doc = documentRequest(request)
      const key = ineligibleKey(doc.url, session)
      page = recallIneligible(key)
      if (!page) {
        page = await ssr.resolveRscPage(doc, { ...getConfig(), session, siteCss })
        if (!page.eligible) rememberIneligible(key, page)
      } else {
        page = { ...page }
      }
      if (!page.eligible && !isRsc) {
        return new Response(null, { status: 404, headers: { [RSC_PASS_HEADER]: 'pass', 'x-dms-rsc-reason': encodeURIComponent(page.reason || page.redirect || '') } })
      }
      // a navigation's payload carries the section HTML; a document's leaves it to the HTML stream (StaticSlot)
      page.inlineSlots = isRsc
      if (!page.eligible) page.documentUrl = page.redirect || (new URL(doc.url).pathname + url.search)
    }

    const route = { id: 'dms', path: '*' }
    if (page?.eligible) route.Component = function DmsRscPage() { return React.createElement(ViewDocument, { page }) }
    else {
      route.Component = function DmsRscRedirect() { return null }
      if (page) route.loader = () => { throw redirectDocument(page.documentUrl) }
    }

    const rscResponse = await matchRSCServerRequest({
      createTemporaryReferenceSet,
      request,
      routes: [route],
      generateResponse(match, options) {
        return new Response(renderToReadableStream(match.payload, options), {
          status: page?.eligible ? page.status : match.statusCode,
          headers: match.headers,
        })
      },
    })
    if (isRsc || isManifest) return rscResponse
    const html = await ssr.generateHTML(request, rscResponse, { slots: page?.slots })
    // how many sections stay live in the browser (section islands): for the coverage census and debugging
    const islands = page?.island?.sectionIslands?.sections?.length
    if (islands) html.headers.set('x-dms-rsc-islands', String(islands))
    return html
  }
}
```

#### `packages/dms/src/render/rsc/resolvePage.js`

```js
// RSC spike, SSR environment (rsc-view-pages.md, phase 2). Decides whether a request can be served by
// the RSC path, and if so gathers everything the server component needs, as plain data:
//   - today's route tree is rendered once with RscCaptureContext set (render/ssr2/handler.jsx
//     captureRender). An opted-in page view whose sections are all static fills the capture and renders
//     its three section-group slots as HTML;
//   - the head is the normal build's own index.html head (its CSS, fonts, Tailwind runtime, analytics),
//     without the normal client app's module scripts, plus the theme's font tags; as tag data, because
//     the server component renders <head> as React elements.
// Runs in the `ssr` environment, where the whole app (contexts, Lexical, linkedom) can load; the `rsc`
// environment only orchestrates (react-server has no createContext).

let parseHTML = null
async function headTags(html) {
  if (!html) return []
  if (!parseHTML) parseHTML = (await import('linkedom')).parseHTML
  const { document } = parseHTML(`<!doctype html><html><head>${html}</head><body></body></html>`)
  return [...document.head.children].flatMap((el) => {
    const tag = el.tagName.toLowerCase()
    if (tag === 'script' && el.getAttribute('type') === 'module') return []
    if (tag === 'link' && el.getAttribute('rel') === 'modulepreload') return []
    const attrs = {}
    for (const a of el.attributes) attrs[a.name] = a.value
    return [{ tag, attrs, text: el.textContent || '' }]
  })
}

// The sections that stay live in the browser (section islands, patterns/page/components/sections/
// RscSection.jsx) and what the browser needs to run them: the page row, with element-data kept only on the
// island sections (the static ones are HTML already), the page list's nav fields, and the CMS fields the
// data sections read. Null when every section is static.
function islandsOf(capture) {
  const live = (capture.sections || []).filter((s) => !s.eligible)
  if (!live.length || !capture.islandPage) return null
  const page = JSON.parse(JSON.stringify(capture.islandPage))
  const keep = new Set(live.map((s) => s.index))
  if (Array.isArray(page.item?.sections)) {
    page.item.sections = page.item.sections.map((section, i) =>
      keep.has(i) || !section?.element ? section : { ...section, element: { ...section.element, 'element-data': '{}' } })
  }
  return { page, sections: live.map(({ key, index }) => ({ key, index })) }
}

/**
 * @param {Function} createHandler - the app's SSR handler factory (src/entry-ssr.jsx's default export)
 * @returns {(request: Request, config: { handlerConfig, templateHead, session }) => Promise<object>}
 */
export function createRscPageResolver(createHandler) {
  let handler = null
  let templateTags = null
  // session (the Express mount, from the session cookie): { state, user, token }, or null. The page renders
  // as that user, and carries who it was rendered for (never the token) so the browser starts from them.
  return async function resolveRscPage(request, { handlerConfig, templateHead, session = null, siteCss = null }) {
    if (!handler) handler = createHandler(handlerConfig)
    if (!templateTags) templateTags = await headTags(templateHead)

    const r = await handler.captureRender(request, { session })
    if (r.redirect) return { eligible: false, status: r.status, redirect: r.redirect }
    if (!r.capture?.eligible) return { eligible: false, reason: r.capture?.reason || 'not an opted-in route' }

    const island = JSON.parse(JSON.stringify(r.capture.island))
    if (session?.user) {
      const { token, password, ...user } = session.user
      island.session = { state: 'user', user: JSON.parse(JSON.stringify(user)) }
    } else island.session = { state: 'anonymous' }
    const sectionIslands = islandsOf(r.capture)
    if (sectionIslands) island.sectionIslands = sectionIslands
    const { loadThemes } = (await import('./clientConfig')).getRscClientConfig()
    if (island.selection !== 'default' && loadThemes) {
      // the client rebuilds the theme from code themes only; a theme saved in the database stays on today's path
      const themes = await loadThemes([island.selection])
      if (!themes?.[island.selection]) return { eligible: false, reason: `theme ${island.selection} is not a code theme` }
    }
    return {
      eligible: true,
      status: r.status,
      title: island.title || '',
      head: [
        ...(await Promise.all(templateTags.map(async (t) => {
          if (t.tag === 'title' && island.documentTitle) return [{ ...t, text: island.documentTitle }]
          // the build's link to the site's sheet, pointed at the server-compiled one (server-compiled-site-css.md);
          // the in-browser compiler comes with it while that sheet is partial
          if (siteCss && t.tag === 'link' && 'data-dms-site-css' in (t.attrs || {})) {
            return [{ ...t, attrs: { ...t.attrs, href: siteCss.href } }, ...(await headTags(siteCss.fallbackHtml))]
          }
          return [t]
        }))).flat(),
        ...(await headTags(r.themeFontsHtml)),
      ],
      island,
      slots: { top: r.slots.top || '', content: r.slots.content || '', bottom: r.slots.bottom || '' },
    }
  }
}
```

#### `packages/dms/src/render/rsc/ViewDocument.jsx`

```jsx
// RSC spike, `rsc` environment (rsc-view-pages.md, phase 2): the document for a page served by the RSC
// path. A server component: no hooks, no context, nothing that calls createContext at import (react-server
// has none). The page's content arrives as HTML from the SSR environment (resolvePage.js) and is placed as
// static markup (StaticSlot): the browser gets no code for it and no copy of its data. A document request
// leaves the HTML out of the payload (page.inlineSlots false; generateHTML supplies it to the SSR render).
// The chrome is the one client component (ClientChrome, a client reference).
import React from 'react'
import ClientChrome from './ClientChrome.jsx'
import StaticSlot from './StaticSlot.jsx'

const ATTR_NAMES = { class: 'className', charset: 'charSet', crossorigin: 'crossOrigin', 'http-equiv': 'httpEquiv' }

function HeadTag({ tag, attrs, text }) {
  const props = {}
  for (const [k, v] of Object.entries(attrs || {})) props[ATTR_NAMES[k] || k] = v
  if ('defer' in props) props.defer = true
  if ('async' in props) props.async = true
  if ((tag === 'style' || tag === 'script') && text) props.dangerouslySetInnerHTML = { __html: text }
  if (tag === 'title') return <title>{text}</title>
  return React.createElement(tag, props)
}

export function ViewDocument({ page }) {
  return (
    <html lang="en">
      <head>
        {page.head.map((t, i) => <HeadTag key={i} {...t} />)}
      </head>
      <body>
        <div id="root">
          <ClientChrome island={page.island}
            top={<StaticSlot name="top" html={page.inlineSlots ? page.slots.top : null} />}
            content={<StaticSlot name="content" html={page.inlineSlots ? page.slots.content : null} />}
            bottom={<StaticSlot name="bottom" html={page.inlineSlots ? page.slots.bottom : null} />} />
        </div>
      </body>
    </html>
  )
}
```

#### `packages/dms/src/render/rsc/generateHTML.js`

```js
// RSC spike, `ssr` environment: the RSC payload → streamed HTML for a document request
// (React Router's Data Mode RSC setup; rsc-view-pages.md, phase 2).
import React from 'react'
import { createFromReadableStream } from '@vitejs/plugin-rsc/ssr'
import { renderToReadableStream } from 'react-dom/server.edge'
import {
  unstable_routeRSCServerRequest as routeRSCServerRequest,
  unstable_RSCStaticRouter as RSCStaticRouter,
} from 'react-router'
import { SlotHtmlContext } from './slotHtmlContext'

// slots: the page's section HTML (StaticSlot), which the payload of a document request leaves out
export async function generateHTML(request, serverResponse, { slots = null } = {}) {
  return await routeRSCServerRequest({
    request,
    serverResponse,
    createFromReadableStream,
    async renderHTML(getPayload, options) {
      const bootstrapScriptContent = await import.meta.viteRsc.loadBootstrapScriptContent('index')
      return await renderToReadableStream(
        React.createElement(SlotHtmlContext.Provider, { value: slots }, React.createElement(RSCStaticRouter, { getPayload })), {
        ...options,
        bootstrapScriptContent,
        signal: request.signal,
      })
    },
  })
}
```

#### `packages/dms/src/render/rsc/hydrate.js`

```js
// RSC spike, browser: hydrate the document with React Router's RSC router (rsc-view-pages.md, phase 2).
// No server functions, so no setServerCallback (design §7).
import React, { startTransition, StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { createFromReadableStream } from '@vitejs/plugin-rsc/browser'
import {
  unstable_getRSCStream as getRSCStream,
  unstable_RSCHydratedRouter as RSCHydratedRouter,
} from 'react-router/dom'

export function hydrateRsc() {
  // An RSC page: the session cookie is kept in step from here too (patterns/auth/api.js syncSessionCookie).
  // The page says who it was rendered for in its chrome's props (island.session: the user, or 'anonymous'
  // for the document every visitor who isn't signed in shares); providers.jsx reads it.
  window.__dmsRscPage = true
  createFromReadableStream(getRSCStream()).then((payload) => {
    startTransition(() => {
      hydrateRoot(
        document,
        React.createElement(StrictMode, null,
          React.createElement(RSCHydratedRouter, { createFromReadableStream, payload })),
      )
    })
  })
}
```

#### `packages/dms/src/render/rsc/entries/rsc.js`

```js
// RSC path, `rsc` environment entry (rsc-view-pages.md, phase 2). Named in the host app's RSC build config
// (dms-template vite.rsc.config.js); the Express mount (render/ssr2/express/setup.mjs) calls `configure`
// once, then the default export per request. The work is in ../rscHandler.js.
import { createRscHandler } from '../rscHandler.js'

let config = {}
export function configure(values) { config = values }

export default createRscHandler({
  loadSsr: () => import.meta.viteRsc.loadModule('ssr', 'index'),
  getConfig: () => config,
})
```

#### `packages/dms/src/render/rsc/entries/ssr.js`

```js
// RSC path, `ssr` environment entry (rsc-view-pages.md, phase 2): HTML from the RSC payload, and the page
// resolver, which renders today's route tree with the host app's own SSR handler (its themes, plugins and
// widgets). The `@dms-host/*` modules are the host app's, named by aliases in its RSC build config
// (see ./README.md).
import createHandler from '@dms-host/ssr-handler'
import loadThemes from '@dms-host/themes'
import { API_HOST } from '@dms-host/api-host'
import { createRscPageResolver } from '../resolvePage.js'
import { configureRscClient } from '../clientConfig.js'

export { generateHTML } from '../generateHTML.js'

// the client chrome also renders here (to HTML); it fetches nothing on the server
configureRscClient({ loadThemes, API_HOST, AUTH_HOST: API_HOST })

export const resolveRscPage = createRscPageResolver(createHandler)
```

#### `packages/dms/src/render/rsc/entries/browser.js`

```js
// RSC path, browser entry (rsc-view-pages.md, phase 2): the only code a page served by the RSC path loads
// is this, the RSC router, the client chrome (../ClientChrome.jsx) and the theme. The `@dms-host/*` modules
// are the host app's, named by aliases in its RSC build config (see ./README.md).
//
// Every nav widget the server registers must be registered by `@dms-host/widgets` too, or the Layout draws
// its empty placeholder where the server drew the widget, and hydration fails.
import loadThemes from '@dms-host/themes'
import '@dms-host/widgets'
import { API_HOST } from '@dms-host/api-host'
import { configureRscClient } from '../clientConfig.js'
import { hydrateRsc } from '../hydrate.js'

configureRscClient({
  loadThemes, API_HOST, AUTH_HOST: API_HOST, isMultiTenant: import.meta.env.VITE_DMS_MULTI_TENANT === '1',
  // the host's plugins, for the section types they ship: loaded only by a page with section islands
  loadPatternTypes: () => import('@dms-host/plugins'),
})
hydrateRsc()
```

#### `packages/dms/src/render/rsc/entries/README.md`

```md
# RSC build entries

The three entries of the RSC build (`@vitejs/plugin-rsc`: `rsc`, `ssr`, `client`). A host app names them in
its RSC build config and writes no entry code of its own. The islands path's browser entry
(`../../islands/entry.browser.jsx`, a second input of the app's normal client build) works the same way.
What the library can't import itself, it imports through five aliases the host's build config must define:

| Alias | The host module | Used by |
|---|---|---|
| `@dms-host/ssr-handler` | default export `createHandler(config)`: the app's SSR handler factory, with its themes, plugins and widgets loaded | `ssr.js` |
| `@dms-host/themes` | default export `loadThemes(names) => Promise<{ [name]: theme }>` | `ssr.js`, `browser.js` |
| `@dms-host/api-host` | named export `API_HOST` | `ssr.js`, `browser.js` |
| `@dms-host/widgets` | side effect: registers every nav widget the server registers, without loading the plugins | `browser.js` |
| `@dms-host/plugins` | side effect: registers the app's plugins. Loaded lazily, by pages with section islands | `browser.js` |

The islands entry uses `themes`, `api-host`, `widgets` and `plugins`.

Example: `dms-template/vite.config.js` (the aliases, and the islands entry as a second `input`) and
`dms-template/vite.rsc.config.js` (the RSC entries).
```
