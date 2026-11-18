# View pages as React Server Components, with streaming

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** design agreed, not started · **Created by:** amuro@albany.edu · **Edited by:** —

Design written 2026-11-18; revised the same day after review with the owner (route opt-in in `siteConfig`
instead of naming the page pattern; a session cookie in scope; re-unifying on one router as the end state). Replaces the dropped [ssr-streaming.md](../completed/ssr-streaming.md) and brings
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
[page-hydration-payload.md](./page-hydration-payload.md) the lightning risk profile is 3.87 MB of HTML, most of
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

- Installed: `react-router` 7.18.3, React 19.2.8, Vite 7.2.7, Node 24.18. Latest: **8.5.2** (2026-11-18);
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
  [ssr-logged-in-render-and-stale-cache.md](./ssr-logged-in-render-and-stale-cache.md) is open. A server
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
([ssr-logged-in-render-and-stale-cache.md](./ssr-logged-in-render-and-stale-cache.md), issues 1 and 2). Today
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

## Phases

Each phase ships on its own and leaves the site working with `DMS_RSC` off.

### Phase 0 — React Router 8 (about 1–2 days)

- [ ] Turn on `v8_middleware` on 7.18, fix what reads `context` in loaders
- [ ] Upgrade to 8.5.x; imports of `RouterProvider` from `react-router/dom`
- [ ] Full regression on the hub: view, edit, admin, datasets, auth, SSR on and off

Part of this task (owner, 2026-11-18). Kept whatever the spike decides.

### Phase 1 — Session cookie (not experimental; ships to both paths)

- [ ] dms-server: login sets the cookie, logout clears it, token → cookie exchange endpoint
- [ ] `render/ssr2`: resolve the user per request; the request's Falcor model carries it
- [ ] Client: first render starts from the server's user; no hydration mismatch signed in
- [ ] Restricted page arrives rendered for a user who may read it; `Cache-Control: private`
- [ ] Close issues 1 and 2 of ssr-logged-in-render-and-stale-cache.md

### Phase 2 — Spike, one week, with a go/no-go

One site (MitigateNY on the hub), behind `DMS_RSC`.

- [ ] `@vitejs/plugin-rsc`, three entries, Express dispatch on the route's `serverComponent` key
- [ ] The page pattern's view route opts in: layout and nav, section groups, sections
- [ ] `ServerViewComp` for rich text, header and footer; every other type as a client island with today's props
- [ ] `useTheme()` by export condition; the request's user from phase 1
- [ ] Streaming on, one `Suspense` per section
- [ ] Settle the opt-in key's name and shape; row in `documentation/extension-points.md`

Measure on the lightning and flooding risk profiles and a text-only page, against today, signed out and signed
in: time to first byte, HTML size, JS downloaded, time to interactive, server time per request. **Go** if the
build works with the React Compiler and code splitting, text-only pages ship clearly less JS, and nothing
regresses in the editor. **No-go** → build streaming on the current pipeline instead (our own hydration script
and per-section data scripts), which needs no experimental API. Phases 0 and 1 are kept either way.

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
- [ ] Spike measurements, before and after, three pages
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
