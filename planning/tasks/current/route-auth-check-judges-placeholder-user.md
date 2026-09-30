# Route auth runs on the placeholder user while sign-in is still loading

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** rdubowsky@albany.edu · **Edited by:** —

Logged 2026-09-30, found live while building phase 2 of [`qa-pattern-type.md`](./qa-pattern-type.md). The `qa`
pattern works around both defects in its own code; nothing here is fixed in the library.

## Objective

A signed-in user who hard-loads a page they're allowed to see should see it, however fast the page renders.

## The two defects

**1. `defaultCheckAuth` judges the placeholder user.**
- On a refresh, the auth provider seeds the user from the stored token as `{groups: ['public'], id: null, authed:
  true, isAuthenticating: true}` (`patterns/auth/providers.jsx:21-28`, `patterns/auth/context.js:3-12`) and loads the
  real groups afterwards.
- `DmsManager` runs the route check on mount and on every `[path, user]` change (`dms-manager/index.jsx`).
  `defaultCheckAuth` (`dms-manager/_auth.js:18-66`) has no `isAuthenticating` guard, so for a pattern whose access
  comes through a group (not a user-id grant), the first check computes `sendToHome` and navigates to `/`. The later
  check with the real groups passes, but the page has already left.
- Measured 2026-09-30 on `qa_test` with a temporary log in `defaultCheckAuth`: `/phase2` (groups-only permissions)
  logged `authing: true, groups: ["public"] → sendToHome: true`; BetaPage's checks all ran after sign-in finished.
- Why page patterns rarely show it: their loader fetches page and section rows, so the route usually renders after
  sign-in resolves. A route that renders quickly loses the race every time.
- `editSite.jsx:66-71` already guards the same state ("don't judge access on that stale state").

**2. Route components keep the placeholder user after sign-in finishes.**
- `EditWrapper` caches each route's render on `[data, item]` (`dms-manager/wrapper.jsx:157-179`). A route rendered
  during sign-in keeps the placeholder `user` it was given until its rows change.
- The page pattern's shell puts that `user` into `CMSContext`, and `PageView` returns `null` for a gated page while
  that user is authenticating (`patterns/page/pages/view.jsx`, `isViewDenied` branch). If the rows don't change after
  sign-in, the page stays blank.

## How the `qa` pattern works around them (2026-09-30)

- `patterns/qa/siteConfig.jsx` supplies its own `checkAuth` (the config hook `DmsManager` already reads): it returns
  without redirecting while `user.isAuthenticating`, and calls `defaultCheckAuth` otherwise.
- `patterns/qa/pages/shell.jsx` renders the borrowed page shell with the live user from `AuthContext`, so it re-renders
  when sign-in finishes.

## Proposed fix (when scheduled)

- `defaultCheckAuth`: return early while `user?.isAuthenticating` (the check re-runs when the user changes).
- `EditWrapper`: include `user` in the cached render's dependencies, or read it from `AuthContext` below the cache.
- Both change timing for every pattern, TransportNY's included (a wrongful redirect on refresh stops happening).
  Owner call before scheduling. Then the `qa` workarounds can go.

## Testing checklist

- [ ] A groups-only pattern at a non-root URL, hard-loaded while signed in, renders instead of redirecting to `/`.
- [ ] Signed out, the same URL still goes to login; a signed-in user without access still goes home.
- [ ] BetaPage-style user-id grants and public patterns behave as before.
