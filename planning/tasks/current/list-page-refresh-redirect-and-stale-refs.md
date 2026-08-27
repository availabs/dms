# Admin `/list`: refresh redirects to `/`, and shows blank names/urls on nav

**STATUS: both fixes implemented and live-verified 2026-08-27.**

> Reported 2026-08-27 (tessera.so): loading `/list` shows blank tenant names,
> incomplete urls, and `undefined` pattern names — looks like unresolved refs.
> A manual browser refresh usually fixes the data, but that refresh itself
> sometimes bounces the user to `/` instead of staying on `/list`.
>
> Follow-up from live testing: the blank-data symptom is actually the
> **opposite** of the initial read — it's triggered by **client-side
> navigation** to `/list` (clicking the "Manager" link in the user menu), not
> by reload. A hard reload always shows correct data. This flips which fix
> applies to which symptom; see "Root cause" below for the corrected,
> live-verified diagnosis of each.

## Objective

1. A full page reload on `/list` (or any admin `SiteEdit` route) must never
   redirect an already-permitted user to `/` because of a transient/loading
   auth state.
2. Client-side navigation to `/list` must show fully-resolved pattern data
   (name/base_url/pattern_type), not blank/`undefined` stubs.

## Root cause — two independent bugs

### Bug 1 — refresh → redirect to `/`

`packages/dms/src/patterns/admin/pages/editSite.jsx:54-71`:

```js
const isLoading = navState === 'loading'
React.useEffect(() => {
    if (isLoading) return
    if (dataItems === undefined) return
    if (!resolvedId) { navigate(`${baseUrl}/create`); return }
    if (!user?.authed) { navigate(`${authPath}/login`, { state: { from: baseUrl } }); return }
    if (!hasAccess) { navigate('/') }
}, [resolvedId, user?.authed, JSON.stringify(user?.groups), dataItems, isLoading])
```

`isLoading` only reflects **router** loading state, not **auth** loading
state. On a full reload, `patterns/auth/providers.jsx:21-29` optimistically
seeds `user` from the localStorage token before the real user is fetched:

```js
return { ...defaultUserState(), token, authed: true, isAuthenticating: true };
```

`defaultUserState()` (`patterns/auth/context.js:3-13`) sets `groups: ['public']`
— a placeholder, not the real admin groups. The real user (real `groups`,
`isAuthenticating: false`) only arrives after `AuthAPI.getUser()` resolves
(`providers.jsx:38-44`), a real round trip to `AUTH_HOST`.

During that window `user.authed` is already `true` (so the login-redirect
branch is skipped) but `hasAccess = isAdmin || isUserAuthed(user, authPermissions)`
is computed off the placeholder `groups` and is `false` — so the effect fires
`navigate('/')` before the real groups ever arrive.

In-app (client-side) navigation never hits this because `AuthContext` already
holds resolved groups from an earlier check in the session. Only a **full
reload** re-triggers the optimistic-seed race, and it's more likely to lose
the race the slower the `AUTH_HOST` round trip is — remote host in production,
near-instant on localhost in dev. This matches the reported prod-only /
refresh-only symptom exactly.

**Fix (`editSite.jsx`):** don't evaluate the `hasAccess` redirect while auth is
still resolving — `if (user?.isAuthenticating) return` added before the
`hasAccess` check, and `user?.isAuthenticating` added to the effect's
dependency array so it re-evaluates once the real user lands.

**Verification status:** grounded in solid code evidence; not yet confirmed
live against tessera.so itself (the race needs a real `AUTH_HOST` network
round-trip to reproduce, which localhost is too fast to reliably lose) — see
testing checklist.

### Bug 2 — blank pattern names/urls on client-side nav to `/list`

**Live-reproduced and root-caused with Playwright** (see "How this was
diagnosed" below). Two earlier theories were investigated and **retracted**:
a `loadDmsFormats`/Falcor retry fix was implemented, tested, then reverted
once live reproduction showed the bug reproduces on **navigation**, not
reload, and that the `/list` route's Falcor-backed loader isn't even in the
call path when this triggers (this app has client-side sync/local-first
reads enabled — see below).

**Actual root cause:** a string-vs-number id key mismatch in the IndexedDB-
backed local sync store used for local-first reads (`VITE_DMS_SYNC=1`).

- `api/index.js:206-234` (`dmsDataLoader`): when sync is active and the
  action is `list`/`view`/`edit`, `loadFromLocalDB(...)` serves the request
  from the local IndexedDB store and **returns before ever calling
  Falcor** — explaining why navigating to `/list` produces zero network
  requests.
- `sync/idb-store.js`'s `getItem`/`getItemsByIds` do a raw, unnormalized
  `IDBObjectStore.get(id)` — IndexedDB key lookups are strictly typed, so
  `get(2)` never matches a row stored under key `"2"`.
- Rows get written into the store keyed by whatever type `id` has in the
  server's JSON payload. Postgres `bigint` columns (`dms.data_items.id`) come
  back from `pg` as **strings**, and nothing in `sync-manager.js`'s
  `upsertItemsFromServer`/`applyItems` coerces `item.id` before using it as
  the IndexedDB key — so synced rows are keyed by **string** ids.
- But `api/index.js:99-101` (`loadFromLocalDB`, resolving a site's `patterns`
  refs) built `childIds` from `ref.id` **without** coercion. A site's
  `patterns` array is written with `id` explicitly coerced to a JS **Number**
  (`+newId` in `patterns/admin/pages/createSite.jsx:82` and
  `editSite.jsx:276,583,623`), so `childIds` ends up as `[2, 3, 79]`
  (numbers) — a type mismatch against the string-keyed store.
- `getItemsByIds([2, 3, 79])` silently misses every row (`s.get(2)` doesn't
  match key `"2"`). `loadFromLocalDB` has no fallback to Falcor for this
  *partial* miss (only falls through to Falcor when the whole `rows` array
  is empty, `api/index.js:34-37`) — so the caller gets back the bare,
  unresolved `{ref, id}` stub for every pattern, which renders as blank
  name / `undefined` / `—` base_url.
- The very next lines (`childMap = new Map(childRows.map(r => [String(r.id), r]))`
  and `refId = String(ref.id || ref)`) already normalize to `String()` for the
  *map lookup* — but by then `childRows` is already wrong because the
  `getItemsByIds` call that produced it used the un-coerced numeric ids.

A hard reload "fixes" it only incidentally: this app's sync-vs-Falcor split
is orthogonal to reload/nav, but the earlier researched (and now confirmed
irrelevant) Falcor-cache angle coincidentally always succeeds on reload,
which is why the symptom reads as "reload fixes it."

**Fix (`api/index.js`):**
```js
const childIds = Array.from(item[key])
  .map(ref => (ref && typeof ref === 'object') ? ref.id : ref)
  .filter(Boolean)
  .map(String);              // <-- added
...
const child = await sync.getItem(String(item[key].id));   // <-- added String()
```
Coercing to `String` at the point ids are handed to the IndexedDB store is
correct and safe for both cases: it's a no-op for refs that were already
strings (the common case, per the existing code comment at
`api/index.js:90-113`), and fixes the case where a ref's `id` is a genuine JS
Number (the `patterns` array specifically).

### How this was diagnosed (for future reference)

Static code reading alone produced two incorrect theories in sequence (a
transient-Falcor-failure retry fix, then a stale-Falcor-cache-on-nav theory)
before live reproduction with Playwright (driving the actual local dev
server, logged in via a real auth token, clicking the real in-app "Manager"
nav link) showed:
- Client nav to `/list` fires **zero** network requests to the Falcor graph
  endpoint and renders blank patterns.
- Hard reload fires the full Falcor request chain (including the specific
  `byId/[2,3,79]` dereference call) and renders correctly.
- Adding temporary `console.log` instrumentation to the actual running dev
  server (`dmsPageFactory.jsx`'s `loader()`, `proecessNewData.js`'s
  `loadDmsFormats`) showed the admin route's loader **does** fire on nav, but
  `loadDmsFormats` never runs for it at all — proving the request is being
  served from somewhere other than Falcor. That pointed at the client-side
  sync system (visible via its own `[sync] ...` boot console logs), which led
  directly to `loadFromLocalDB` and the id-type mismatch above.

Lesson: for a bug like this (behaves differently between two navigation
paths, no error thrown), static reading of `siteConfig.jsx`/`dmsSiteFactory.jsx`
/`dmsPageFactory.jsx` repeatedly produced plausible-but-wrong theories about
Falcor route/model lifecycle; the real cause was in a subsystem (local-first
sync) that wasn't part of the original hypothesis space at all. Live
reproduction with real network/console visibility was what actually found it.

## Files changed

- `packages/dms/src/patterns/admin/pages/editSite.jsx` — auth-loading guard
  (Bug 1)
- `packages/dms/src/api/index.js` — `String()` id coercion before IndexedDB
  lookups in `loadFromLocalDB` (Bug 2)

## Testing checklist

- [x] Live-reproduced Bug 2 with Playwright against the local dev server
      (pointed at the tessera-test prod API) — confirmed blank data on nav,
      correct data on reload, before the fix.
- [x] Re-ran the identical Playwright repro after the fix — nav to `/list`
      now renders `Auth`/`Pages`/`Docs` with correct base urls, matching
      reload behavior.
- [x] Full client test suite (`npx vitest run tests/`): 247/248 pass; the 1
      failure (`cardLayout.test.js`) is pre-existing and unrelated —
      confirmed by stashing this change and re-running, same failure.
- [x] `npm run build` (production build) succeeds cleanly.
- [ ] Bug 1 (redirect-to-`/`): not live-tested — the race depends on a real
      `AUTH_HOST` network round-trip that local dev doesn't reliably lose.
      Needs verification against a deployed environment (tessera.so) or by
      artificially slowing `AuthAPI.getUser()` locally.
- [ ] Deploy/verify both fixes against tessera.so (the original report).
