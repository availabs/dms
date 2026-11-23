# Code review: view pages as React Server Components

Review of the work recorded in [rsc-view-pages.md](../tasks/current/rsc-view-pages.md), written 2026-11-23.

**What was reviewed.** The task's last saved diff (`dms-template/scratchpad/perf-rsc/patches/rscsi2.*.patch`,
the build measured in step S9, signed-in visitors on the RSC path) and the same files as they stand in the
working tree now. Nothing is committed, and later tasks (server-compiled site CSS, plugins) have since edited
some of the same files; where that matters it is said. Paths are relative to `src/dms/packages/` unless they
start with `dms-template/`.

**What was not done.** No build, no test run and no browser check: this is a reading review. The task doc's
measurements are taken as given. The `perf/` tool changes and the scratchpad harness were not reviewed.

## Verdict

The work is in three parts of quite different quality.

| Part | Quality | Ship state |
|---|---|---|
| Fixes found on the way (Lexical view save, template `$'` bug, router rebuild, `no_access` stubs, asset caching, password stamp, login form race) | Good. Small, well explained, each one a real bug | Ready after tests |
| Phase 0 (React Router 8) and phase 1 (session cookie, server renders as the user) | Good design, careful about the security boundary. A few gaps, no tests | Close; needs tests and the fixes below |
| Phase 2 (RSC spike with section islands) | A sound spike that got its measurement. Not the design in the task doc, and it leans on duplication and render-time side effects | Keep behind `DMS_RSC`; do not build on it as is |

The most important thing for the go/no-go: **what was measured is not React Server Components in the sense
the design describes.** No section runs as a server component. Today's client components are rendered to a
string in the SSR environment, cut out with a regex and placed as static HTML; the RSC machinery carries one
client component (the chrome). The gain (2 to 5 times faster to Complete) comes from not hydrating content and
not mounting Lexical. That gain is real, but it could probably be had on today's pipeline without an
experimental router API. The task doc says this itself under "The spike as built"; it should weigh more in the
decision than its place in the doc suggests.

## The changes, and how well each is done

### 1. Fixes found on the way

| Change | Where | Assessment |
|---|---|---|
| Lexical value sync tagged `HISTORY_MERGE_TAG`, so loading a value is not reported as an edit | `dms/src/ui/components/lexical/editor/index.tsx` (`UpdateEditor`) | Correct and minimal. It stopped signed-out page views writing to the database. The server still accepts those writes; that is noted for the owner and is the real hole |
| Template filled with replacer functions | `dms/src/render/ssr2/express/middleware.mjs` | Correct. A good catch (`$'` in page data pasted the template into the data script) |
| First router build seeds `appliedSiteDataRef` | `dms/src/render/spa/dmsSiteFactory.jsx:156` | Correct, fixes every page mounting twice. It stringifies the whole site data once more at mount; acceptable. Assigning a ref during render is fine here because it only runs once |
| `hasNoAccessStubs` reads `no_access` | `dms/src/render/ssr2/handler.jsx:70` | Correct. It walks the whole site data recursively on each anonymous route build, which is once per host, so cheap enough |
| Hashed assets cached for a year | `dms/src/render/ssr2/express/setup.mjs` | Correct, and the largest single gain for returning visitors. The same `setHeaders` block is written twice (normal and RSC client dirs) |
| Token carries a keyed stamp, not the bcrypt hash | `dms-server/src/auth/utils/crypto.js`, `jwt.js`, `handlers/auth.js` | Good, with tests. The legacy branch has a "remove one release later" note that needs an owner or a date |
| `userForToken` shared by API middleware and the cookie | `dms-server/src/auth/jwt.js` | Good refactor: one verify path, one cache |
| Login form keeps text typed before hydration | `dms/src/patterns/auth/pages/authLogin.jsx` | Correct. `name` and `autoComplete` on the fields are an improvement in their own right |
| `force` sections skip their first fetch when rows were preloaded for this load | `dms/src/api/preloadSectionData.js`, `dataWrapper/useDataLoader.js:259` | Works, and I checked the worry that it could freeze live data: the loader invalidates `uda` paths before each read (`api/index.js`), so preloaded rows are fresh. But it compares a server clock with a browser clock. See suggestion 9 |
| `columnTypes.lexical` code-split | `dms/src/ui/columnTypes/index.jsx` | Good, in line with `lazyComponent` use elsewhere |
| `nav2Level` moved to `utils/nav.js` | `dms/src/utils/nav.js`, `patterns/page/pages/_utils/index.js` | Good: moved, not rewritten, and re-exported so callers are unchanged |

### 2. Phase 0: React Router 8

`dmsSiteFactory.jsx`, `handler.jsx`, both `package.json` files. Clean: one import change, the
`v8_middleware` flag on both routers, and a peer range (`^7.5.3 || ^8.0.0`) that keeps TransportNY's vendored
copy working. Nothing to change.

One mismatch with the design: it says exact versions are pinned, but `dms-template/package.json` has
`"react-router": "^8.5.2"` and `"@vitejs/plugin-rsc": "^0.5.39"`. For APIs that break in patch releases the
lockfile is the only thing holding them.

### 3. Phase 1: session cookie, and rendering as the user

| Change | Where | Assessment |
|---|---|---|
| `POST /_session`, cookie resolver | `dms-server/src/auth/session.js` (new), `dms-server/src/index.js` | Well thought out: `HttpOnly`, `SameSite=Lax`, same-origin JSON only, token verified before it is set, and the API never reads the cookie. The header comment explains the boundary well. Two defects, below |
| Request scope, per-request data model | `dms/src/utils/requestScope.js` (new), `dms/src/render/dmsPageFactory.jsx:35` | Solves the right problem (a user's rows must never reach the shared cache). The mechanism is the hardest code in the task to follow. See suggestion 6 |
| Render in scope, per-user route tree, auth provider on the server | `dms/src/render/ssr2/handler.jsx` | Correct, and the missing auth provider was a real find. `render` / `renderInScope` and `captureRender` / `captureInScope` repeat each other. Per-user route trees are the main cost risk, below |
| Session in page data, `Vary: Cookie`, `private, no-store` | `dms/src/render/ssr2/express/middleware.mjs` | Correct |
| First client state from the server's user; cookie kept in step | `dms/src/patterns/auth/providers.jsx`, `auth/api.js`, `authLogout.jsx`, `createSite.jsx` | Works. The initial-state function now has four branches steered by three globals (`__dmsStub`, `__dmsSSRData`, `__dmsRscPage`); it is hard to read. One edge case, below |
| PDF renderer sets the cookie | `dms-server/src/pdf/render.js` | Correct |

Defects:

- **A malformed cookie breaks the page render.** `readCookie` calls `decodeURIComponent` unguarded
  (`session.js`). A `dms_session` value with a bad percent sequence throws; the RSC mount catches it and
  falls through, then today's middleware throws again and serves the SPA shell. Every page for that browser
  loses server rendering until the cookie expires. Treat an undecodable value as signed out.
- **The cookie can name one user and the stored token another.** `providers.jsx` only rewrites the cookie
  when "is there a user" differs from "is there a token" (`(rendered.state === 'user') !== !!token`). If the
  cookie is user A's and `localStorage` holds user B's token (sign-in in another tab against a different
  account, or a token replaced by `createSite`), the first render is A's page with B's token, and the server
  keeps rendering as A. Compare identities (the email in the session against the token's payload), not
  presence.
- **`SameSite=Lax` with the raw login token as the cookie value** is acceptable given `HttpOnly` and that the
  API ignores it. It does mean the full API credential now travels on every page request, including to any
  proxy that logs cookies. An opaque session id would be stronger; worth a line in the task doc as a known
  trade-off.

### 4. Phase 2: the RSC spike and section islands

New: `dms/src/render/rsc/` (12 files, about 650 lines), `patterns/page/components/sections/RscSection.jsx`,
`rscSections.js`, `patterns/page/pages/usePageViewState.js`, and in the app `dms-template/src/rsc/` (4 files),
`dms-template/vite.rsc.config.js`. Changed: `view.jsx`, `sectionArray.jsx`, `useDataLoader.js`, `siteConfig.jsx`,
`handler.jsx` (`captureRender`), `setup.mjs` (`mountRsc`), four registry configs, the mny header config.

What is good:

- **`usePageViewState`** is the best piece of the phase: the page-state logic was moved out of `view.jsx`
  unchanged and is now shared by the page view and the islands. It also dropped a dead `|| true`.
- **The registry keys** (`serverStatic`, `serverIsland`) follow how DMS already extends section types
  (`preloadData`, `trimForView`): the core names no type, a theme opts in (the mny header does), and both
  have rows in `documentation/extension-points.md`.
- **The can't-serve cache** only remembers the safe answer, and the comment says why.
- **`StaticSlot`** keeping the content HTML out of the payload is a neat answer to the payload-doubling
  risk the design named.
- **`IslandBoundary`** keeps a failing section's server HTML, which is better behavior than today's path.
- File header comments are consistently useful: each says which environment it runs in and why.

What is not:

- **It is not the design.** Design §2 to §4 (a `ServerViewComp` per type, `useTheme()` by export condition,
  one `Suspense` per section, streaming) are all unbuilt. The page is rendered whole before the first byte,
  which is why first byte got 30% slower on the RSC path. The opt-in is `serverComponent: 'page-view'`, a
  string nothing reads except as a truthy flag; the design's module reference does not exist.
- **Deciding by rendering.** Every HTML request, for any route (editor, admin, datasets), is rendered once
  by `captureRender` to find out whether it can be served, then again by today's path if not. The 5-minute
  cache hides this for repeat anonymous URLs, but for signed-in visitors it is keyed per user, so an editor
  pays double on nearly every first visit to a URL. Design §1 had the mount match the route and read the
  key before rendering.
- **Two copies of the app in one server process.** The RSC build bundles its own SSR handler
  (`resolvePage.js` calls `createHandler` again), with its own per-host route cache, per-user route cache
  and shared Falcor cache. Memory doubles, and:
- **`invalidateRoutes` does not reach the RSC copy** (confirmed). `setup.mjs:172` returns
  `() => cachedHandler.invalidateRoutes()`; the handler inside `resolvePage.js` is never exposed. With
  `DMS_RSC` on, a tenant or domain-alias change on the hub leaves RSC-served pages on the old routes until
  restart.
- **Render-time side effects carry the whole capture.** `view.jsx` writes about ten fields onto a context
  object while rendering, `RscSection` pushes into an array from a `useState` initializer, and
  `useDataLoader` flips `eligible` during render. It works because `renderToString` is one synchronous
  pass. It would break silently under streaming or concurrent rendering, which is where the design is
  headed. `captureContext.js` documents three of the fields; the rest (`sections`, `islandPage`,
  `sectionServerStatic`) are only discoverable by reading `view.jsx`, and it names a file
  (`resolvePage.jsx`) that does not exist.
- **Regex extraction of slots** (`handler.jsx:300`): a custom element `<dms-rsc-slot>` cut out with a
  non-greedy regex. Fine while content can never contain that tag.
- **Duplication that will drift.** `SectionIslands.jsx` re-implements what `patterns/page/siteConfig.jsx`
  does inline: theme part registration (`pageComponents`, column types, format functions, header
  extensions), the `filter_control` column type, and the format setup with `additionalSectionAttributes`.
  `ClientChrome.jsx` re-implements the `pages` default-theme merge and the widget registration.
  `dms-template/src/rsc/entry.browser.js` re-implements the API-host rule that
  `dms-template/src/apiHost.js` now exports, and `entry.ssr.js` uses a third, simpler rule. Each copy has a
  comment pointing at the original, which helps, but a new theme hook added to `siteConfig` will not reach
  islands.
- **The core names a section type.** `SectionIslands.jsx` checks `'element-type' === 'Spreadsheet'` for
  click-to-activate, copied from `sectionArray.jsx`. In `render/` that breaks the rule the task doc sets
  for itself.
- **Fragile static tests.** Rich text is static unless its JSON *string* contains `"setParam"`; if
  element-data ever arrives as an object, `String()` gives `[object Object]` and the answer is always
  "static". `cardServerStatic` trusts `display.totalLength` as of the last save, so a source that has grown
  shows a pager that does nothing (the doc lists this as a known gap; it is a visible bug for readers).
- **Islands replace data-bearing HTML with a loading state.** A section becomes an island exactly when
  its rows load in the browser, so its server HTML (which may hold rows) is swapped for the client's first
  render. "Nothing flashes" holds for the swap itself, not for content that then reloads.
- **A filter change remounts every island**, maps included (the doc's future direction 16, update URL-bound
  filters in place). On a real page with a map this is a visible regression against today's path.
- **`StaticSlot` holds the page's content HTML as a JS string for the life of the page** (read from
  `innerHTML` at hydration). On the 10 MB page the doc mentions, that is 10 MB of string plus the
  serialization.
- **Known gaps left open** in the doc and still open: head tags from app settings missing on the RSC path,
  `registerFromTheme` not run in the chrome, links inside static HTML are full page loads, component
  actions between islands and Spreadsheet paging unchecked, the editor unmeasured.

### 5. Tests and docs

- **Tests.** The only tests added are for the password stamp (`dms-server/tests/test-jwt-failures.js`).
  Nothing covers `session.js`, `requestScope.js`, `usePageViewState`, `cardServerStatic`, the `force`
  skip, `hasNoAccessStubs` or the RSC handler. All verification lives in
  `dms-template/scratchpad/perf-rsc/parity/`, which is gitignored and exists on one machine. For code that
  decides who sees what, that is the largest gap in the task.
- **Docs.** The task doc is thorough and honest about what the spike is and is not. It is also 1,240 lines
  with the status in a single 900-character line; the go/no-go evidence is hard to find. The
  extension-point rows exist. The testing checklist at the bottom is entirely unticked although several
  items were done.

## Against the core ideas of DMS

| DMS idea | How the work fits |
|---|---|
| Everything is a registry entry; the core names no type | Kept for `serverStatic` / `serverIsland`. Broken by the `Spreadsheet` check in `SectionIslands.jsx` |
| Patterns and themes opt in through their config | Kept in spirit (`serverComponent` on the route), but the key is a placeholder string and the decision is made inside `view.jsx`, not by the core reading the route |
| UI comes from the theme context, not direct imports | `ClientChrome.jsx` imports `UI` and `Layout` directly. Needed here, since it is the thing that provides the context, but it is a second place that builds the theme value |
| One source of truth, synced copies follow | Weakened: registration logic now lives in `siteConfig.jsx` and again in `render/rsc/` |
| No one-line convenience wrappers | Respected. `publicUser` is small but used for a security purpose; the same strip is written inline in `resolvePage.js` and should be one function |
| Changes to shared primitives stay backward compatible | Respected. `view.jsx`, `sectionArray.jsx` and `useDataLoader.js` behave as before when no capture is set, and the flag-off runs measured no change |

## Suggestions

In the order I would do them.

**Before any of this is committed**

1. **Guard `readCookie`** against an undecodable value (`dms-server/src/auth/session.js`): catch and return
   null. Two lines.
2. **Compare identity, not presence, when syncing the cookie** (`patterns/auth/providers.jsx`): rewrite the
   cookie when the session's email differs from the stored token's.
3. **Add tests for phase 1**, in the repo: `POST /_session` (valid, invalid, cross-origin, form post,
   malformed cookie), `createSessionResolver` states, `requestScopedModel` (anonymous uses shared, a token
   gets its own, two scopes never share), `hasNoAccessStubs`, `tokenMatchesPassword` (exists). Move
   `parity/session.mjs` out of the scratchpad into the server's tests if it can run against the test
   database.
4. **Pin `react-router` and `@vitejs/plugin-rsc` to exact versions**, as the design says.

**If the RSC path is kept (a go)**

5. **Make `invalidateRoutes` reach the RSC handler.** Export an invalidate from the RSC entry and call both
   in `setup.mjs`. Better: stop loading the app twice. Have the RSC build's SSR entry use the handler the
   mount already made, which also lets an ineligible capture hand its finished HTML to today's path
   instead of rendering again.
6. **Decide eligibility before rendering** where it can be known: match the request against the host's
   routes and skip `captureRender` when the matched config has no `serverComponent`. That removes the
   double render for the editor, admin and datasets entirely, and most of the need for the can't-serve
   cache.
7. **Share the registration code.** Extract from `siteConfig.jsx` one function that registers a theme's
   page parts and one that builds the pattern's format, and call them from both `siteConfig.jsx` and
   `SectionIslands.jsx`. Import `API_HOST` from `dms-template/src/apiHost.js` in both RSC entries.
8. **Take the Spreadsheet check out of `render/rsc/`.** Either a registry key (for example
   `activateOnClick`) read by both `sectionArray.jsx` and the islands, or let the section handle its own
   activation.
9. **Replace the two-minute clock comparison** for `force` sections with something that does not depend on
   clocks: mark preloaded rows with a per-render id carried in the page data, or strip `preloadedAt` on
   save and treat its presence as "from this load".
10. **Make the capture explicit.** One function in `view.jsx` that builds the capture record from props
    and returns it, a documented shape in `captureContext.js`, and the section results collected by the
    handler after render. That also makes it testable without a browser.
11. **Simplify `requestScope.js`.** The `Proxy` over a Falcor model, plus patching the private
    `_source.onBeforeRequest`, is clever and opaque. A plain `getFalcor()` accessor that route code calls
    (returning the shared or the request's model) says the same thing in a form the next reader can step
    through. Fold the duplicated scope construction in `render` and `captureRender` into one helper.
12. **Key per-user route trees by what the user may see** (their groups and auth level), not by user id.
    Users with the same grants then share a tree, and the 200-entry cache stops being a memory risk on a
    busy restricted site. Store the in-flight promise so two simultaneous requests build once.
13. **One function for "the user without secrets"**, used by `middleware.mjs` and `resolvePage.js`.

**For the decision itself**

14. **Measure the cheaper alternative before committing to the experimental API.** The gain comes from not
    hydrating static content. Today's SSR could emit the same static slots and hydrate only the chrome and
    the islands (the capture pass already produces exactly this), with no RSC router, no second build and no
    `unstable_` APIs. If that gets most of the 2 to 5 times, RSC should wait for real server components
    and streaming, which is where it pays for itself.
15. **Close the unchecked items before a go**: component actions between islands, Spreadsheet paging, the
    editor round trip (view, edit, view), cold visits, and a map page's filter change on a real GPU.
16. **Split the task doc.** Keep the design, phases and decision in `rsc-view-pages.md`; move the
    measurement log to its own file; give the fixes found on the way their own short tasks so they can ship
    without waiting on the RSC decision. Tick the testing checklist.
