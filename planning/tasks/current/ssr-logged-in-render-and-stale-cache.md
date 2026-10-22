# SSR: logged-in users get a mismatched first render, and production mode may serve stale pages

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) (primary), [plat_qa_automation](../../../../../planning/initiatives/plat_qa_automation.md) · **Status:** next · **Created by:** rdubowsky@albany.edu · **Edited by:** —

Found 2026-10-22 on the first local SSR run, ahead of the per-site SSR switch in the parent repo's
[serve-sites-from-mercury.md](../../../../../planning/shared/tasks/current/serve-sites-from-mercury.md) ("Later").
Fix these before any site turns SSR on.

## What was seen

Setup: dms-server in dev-mode SSR (Vite middleware, no build) on TransportNY (`npmrdsv5` + `dev2`), from
`src/dms/packages/dms-server`:
`DMS_SSR=1 PORT=3001 VITE_DMS_APP=npmrdsv5 VITE_DMS_TYPE=dev2 VITE_DMS_PG_ENVS=npmrds2 npm start`, then
`http://www.localhost:3001/`. (Shell values win over the root `.env` for both Node and Vite.)

**Works:** logged out, `/` arrives with ~28 KB of real page HTML in `#root` and hydrates with no errors (checked in a
fresh headless browser with no token).

| # | Issue | Seen? | Known before today? |
|---|---|---|---|
| 1 | **Every page view while logged in fails hydration.** Console: "Hydration failed because the server rendered HTML didn't match the client." React throws away the server HTML and rebuilds the page in the browser, so a logged-in user pays for SSR and gets none of its benefit. | Yes, on `/` | No. Nothing in either planning hub records it. |
| 2 | **A restricted page shows "You do not have permission to view this page", then the real page a few seconds later** (hard refresh, logged in, `/npmrds/reports/single_route`). Loads more slowly than it does without SSR. | Yes | Partly. Perf fix #3 in [perf-auth-revalidate-duplicate-fetch.md](./perf-auth-revalidate-duplicate-fetch.md) (2026-09-02) fixed the page being stuck on that message *forever*. The interim message and the extra wait weren't recorded. |
| 3 | **Production mode probably never refreshes page data.** An edit to a public page wouldn't show on a hard refresh until the server restarts, and since the browser reuses the server's data when it hydrates, users would see the old version until they navigate away. | No: read from code; dev mode rebuilds per request, so it can't show this | Partly. [pattern-filter-sync.md](../completed/pattern-filter-sync.md) and the parent repo's `county-site-mass-deployment.md` record the route cache never clearing (pattern/filter changes stale until restart), left out of scope. The page-*content* consequence isn't recorded. |

## Cause

**Issues 1 and 2: the server always renders as a logged-out visitor.** The login token lives in the browser's
`localStorage` (`userToken`); a page request never carries it, and the SSR `window` stub returns `null` for it.

- **Issue 1:** the browser's first render already counts the user as logged in: `authProvider` seeds its state from
  the stored token, `{ authed: true, isAuthenticating: true }` (`patterns/auth/providers.jsx:21-29`). Anything that
  branches on `user.authed` then renders differently from the server. The diff pointed at TransportNY's
  `src/themes/transportny/QuickLinks.jsx:57` (a logged-in-only block in the sidebar), but any component that
  branches on login state does the same.
- **Issue 2:** the sequence on a hard refresh of a restricted page:
  1. The server's page fetch returns `no-access` rows. `PageView` sends a logged-out visitor to login
     (`<Navigate>`), which renders nothing, so `#root` holds only the router's data script.
  2. In the browser, auth is still checking the token, so `PageView` returns `null` and the page is blank.
  3. Once `AuthAPI.getUser()` confirms the user, the page data is still the server's `no-access` stub, so
     `PageView` shows the permission panel (`patterns/page/pages/view.jsx:217-227`).
  4. `DMS()` in `render/dmsPageFactory.jsx:138-146` sees an authed user on `no-access` data and revalidates once;
     the loader refetches with the token and the page appears.

  The wait is that refetch, which can't start until the token check returns. Without SSR, the loader fetches with
  the token from the start.

**Issue 3: production mode caches the route tree per host for the life of the process.** `ssr2/express/setup.mjs`
builds one handler at startup. `ssr2/handler.jsx`'s `ensureRoutes(host)` keeps each host's routes in `routeCache`,
and those routes hold the data model `dmsPageFactory()` creates once per route set (`dmsPageFactory.jsx:26`). That
model has no expiry or size limit, and the page loader doesn't invalidate page rows, so a page is fetched once and
then served from memory. `invalidateRoutes()` exists, but nothing calls it. The cache also grows without limit.

## Proposed changes (not designed yet)

1. **Make the hydration render match the server.** When `window.__dmsSSRData` is present, start the auth state as
   the server had it, then apply the stored token right after hydration.
   - **Open question:** a plain logged-out start would make `PageView` redirect to login before the token is read.
     The start state probably needs `isAuthenticating: true` with `authed: false`. Before choosing, check every
     component that branches on `isAuthenticating` to confirm it renders the same markup as the server's logged-out
     state.
   - Normal loads without SSR must be unchanged.
2. **Restricted pages:** don't show the permission panel while the one recheck with the token is pending, and start
   that recheck as soon as hydration finishes when a token exists, not after `getUser()` returns. Per the perf task's
   standing rule, shorten the wait rather than hide it.
   - **Option to weigh:** the server leaves out the loader data for a route whose fetch came back `no-access`, so
     the client router runs that loader itself on hydration, with the token.
3. **Refresh SSR data.** Options:
   - (a) a fresh data model per request (what dev mode does);
   - (b) keep the route tree cached but give page loads a fresh model;
   - (c) clear the cache when data changes. The SSR mount runs inside dms-server, which sees every write.

   Decide together with [route-build-duplicate-falcor-instances.md](./route-build-duplicate-falcor-instances.md),
   which is about the same per-`dmsPageFactory` model.

## Files

- `packages/dms/src/patterns/auth/providers.jsx`: the initial auth state when hydrating SSR HTML.
- `packages/dms/src/patterns/page/pages/view.jsx`: the denied branch.
- `packages/dms/src/render/dmsPageFactory.jsx`: the revalidate effect and the loader.
- `packages/dms/src/render/ssr2/handler.jsx`, `ssr2/express/setup.mjs`: the route cache and its invalidation.

## Testing checklist

- [ ] Logged out, `/`: server HTML present, no hydration error (passes today; it's the baseline).
- [ ] Logged in, `/`: no "Hydration failed" in the console; the logged-in sidebar block appears after load.
- [ ] Logged in, hard refresh on `/npmrds/reports/single_route`: the permission panel never shows; the page is ready
      no later than without SSR.
- [ ] Logged out, restricted page: still redirected to login.
- [ ] Logged in but genuinely denied: the panel shows, and there's no revalidate loop (perf fix #4's regression).
- [ ] Without SSR, logged in and out: unchanged.
- [ ] Issue 3, first confirm it: production build run locally (`npm run build:ssr`, then the server with
      `NODE_ENV=production`), edit a public page, hard refresh. This writes to the prod DB, so get the owner's go.
      Then the same check after the fix.
