# Routes keep pre-login pattern stubs after a client-side sign-in

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_qa_ticketing](../../../../../planning/initiatives/dms_qa_ticketing.md) · **Status:** next · **Created by:** rdubowsky@albany.edu · **Edited by:** —

Logged 2026-10-09, not scheduled (owner: "not worth fixing at this moment"). Found by the owner on `qa_test`;
diagnosed from the code, not yet reproduced with a probe.

## Symptom

1. Signed out, open the site. A gated page redirects to login (correct).
2. Sign in, then keep navigating client-side, with no refresh.
3. Open `/qa`. It shows "This install isn't set up yet".
4. Refresh, and `/qa` renders normally.

**Workaround:** refresh once after signing in.

## Why

The site's routes are built once, at boot, from site data whose content depends on who's signed in. Nothing rebuilds
them when that changes.

- `DmsSite` (`render/spa/dmsSiteFactory.jsx`, `load()` effect ~130-205) fetches the site row and its patterns once
  on mount, and `pattern2routes` turns them into routes. Each route's config keeps the pattern object it was built
  from (`props.pattern`, `render/spa/utils/index.js` ~458-475).
- A signed-out boot gets each pattern the user can't read as a stub (`dms-server/src/routes/dms/dms.route.js`
  ~111-143). The stub has routing info, `theme` and, for `qa`, `qa.intake`, but none of the pattern's settings. After
  ref expansion it keeps its real `id` and gets `no_access: true` (`api/proecessNewData.js` ~219-237).
- Sign-in (`patterns/auth/pages/authLogin.jsx:27-31`) stores the token, calls `setUser` and navigates client-side.
  `DmsSite` sits *above* the auth provider (`authProvider(RouterProvider, …)`, `dmsSiteFactory.jsx:225`), so it
  never learns about the sign-in. The routes and their stub patterns stay.
- QA builds every page from `pattern.qa.datasets` (`patterns/qa/pages/index.js`, `buildQaPages`). The stub has
  none, so the install looks unset. A refresh re-runs the boot fetch with the token, and the full row comes back.
- Other pattern types read pattern settings (`config`, `filters`, …) from the same object, so they likely go stale
  the same way. QA shows it most because all of its state is in settings.

**Existing partial fixes for the same root cause**, all below the route level:
- `render/dmsPageFactory.jsx`: the loader retries blocked rows when the token changes, and the `DMS` component
  revalidates once after sign-in. These fix page *data*, not the route-level pattern.
- `render/spa/utils/snapshot.js`: never persists a site snapshot that holds stubs.

**Related, found in passing:** `render/spa/utils/index.js:454` checks `pattern?.id !== 'no-access'` before adding
the public `view-page` default. Ref expansion replaces the stub's `id` with the real one, so this never matches,
and a stubbed pattern without a `public` group gets public `view-page` in its route config. The server still
blocks the page rows, so this is a weakened client check, not an exposure. It should test `no_access` like
`snapshot.js` does.

## Fix options

1. **Recommended: rebuild the routes once after sign-in, only when the boot fetch got stubs.**
   - Let `DmsSite` see auth changes, either by putting the auth provider above it or by having the provider report
     user/token changes upward.
   - When the token differs from the one the boot fetch used *and* that site data held `no_access` patterns,
     re-run `dmsSiteFactory` and `setDynamicRoutes`.
   - The token condition matters. A signed-in user without access to some pattern always gets a stub for it. A
     stubs-only condition would cost them a refetch and a full remount on every page load.
   - Cost: one full-tree remount on the first navigation after sign-in.
   - Falcor cache: `App.jsx` passes no `falcor`, so `dmsSiteFactory` creates a fresh model per call
     (`falcorGraph()`, and `cacheFromStorage()` is commented out). If a shared instance is passed, invalidate the
     stub rows first (`['dms','data',app,'byId',id]` and `['dms','data','byId',id]`, as `api/index.js:585-586`).
2. **Full page reload after sign-in.** The smallest change, but it uses `window.location`, which the library
   rules forbid, and it drops SPA state.
3. **QA reloads its own pattern row when it sees `no_access`.** Fixes QA only; other pattern types stay stale.

Whichever lands, consider whether `dmsPageFactory.jsx`'s token-change retries can then be simplified. Don't do that
in the same change.

## Testing checklist

- [ ] Reproduce on `qa_test`: sign out, sign in, navigate client-side to `/qa` → "isn't set up yet".
- [ ] After the fix: the same flow renders install 126's Overview with no refresh.
- [ ] A signed-in user lacking access to some pattern: a normal page load does no second site fetch and no remount.
- [ ] Sign out after the fix: no rebuild (the site data had no stubs); gated pages still redirect to login.
- [ ] Line 454's check uses `no_access`, with a unit test.
