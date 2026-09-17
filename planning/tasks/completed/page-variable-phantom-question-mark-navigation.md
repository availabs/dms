# Page-variable URL sync navigated a page to its own URL on mount (phantom `?`)

**Status: DONE, live-verified (2026-09-16).**
Topic: `patterns/page`

## Objective

Stop a page whose URL-bound page variables are all empty from navigating to its own URL on
mount — a no-op navigation that re-ran every route loader, re-fetched every section, and
pushed a duplicate history entry. Reported as "the Actions Dashboard reloads several times
before finally settling."

## Symptom as reported

MitigateNY county Actions pattern, landing page (`http://cayuga.localhost:5173/actions`,
which renders the pattern's index page `dashboard`; `/actions/dashboard` is the same page
reached directly). The page visibly reloads/flashes several times on a cold load before
settling.

## Root cause

`convertToUrlParams()` (`patterns/page/pages/_utils/index.js:8`) returns a **bare** query
string and **skips every variable whose value is empty** (`if(!values || !Array.isArray(values)
|| !values?.length) return;`). So a registry whose variables are all empty yields `''`.

All three page-variable → URL navigate call sites then prefixed `?` unconditionally:

```js
const url = `?${convertToUrlParams(filtersObject)}`;   // → "?" when everything is empty
if (url !== search) navigate(`${baseUrl}/${item.url_slug}${url}`)
```

`useLocation().search` is `''` when the URL carries no query — never `'?'`. So the guard
compared `'?'` against `''`, found them different, and navigated. React Router then
normalized the trailing `?` away, landing on the URL the page was already on.

The Actions Dashboard is the page that makes this visible because it registers **12**
URL-bound page variables, all empty on a cold load. Instrumented live:

```
[DBG initNavigate] n=12 keys=[{"k":"search","v":[]},{"k":"jurisdiction","v":[]},
  {"k":"hazard","v":[]},{"k":"implementation_status","v":[]},{"k":"action_type","v":[]},
  {"k":"maturity","v":[]},{"k":"readiness","v":[]},{"k":"critical_facility","v":[]},
  {"k":"buyout","v":[]},{"k":"culvert","v":[]},{"k":"generator","v":[]},{"k":"rl_srl","v":[]}]
  url="?" search="" willNavigate=true
```

Any page with zero URL-bound variables is unaffected — `initNavigateUsingSearchParams` is
gated on `searchParamFilters?.length`. But `view.jsx`/`edit/index.jsx`'s
`updatePageStateFilters` is gated on `if (searchParamFilters?.length || true)`, i.e. not
gated at all, so its copy of the bug could fire on **any** page the moment something called
it — including the "user just cleared the last filter" case, where `search` returns to `''`
and `url` is `'?'` again.

## Evidence (before the fix)

Playwright against `cayuga.localhost:5173`, instrumenting `history.pushState`, the route
loader, and `PageView`'s mount:

```
[loader] 3 mitigateny_actions|page /dashboard  t=4263      ← cold load
[loader] 4 mitigateny_actions|page /dashboard  t=4268      ← StrictMode double-invoke (dev only)
[loader] 5 mitigateny_actions|page /dashboard  t=4628      ← sync bootstrapSkeleton invalidate → revalidate
[PageView MOUNT] dashboard                     t=5224
[initNavigate] url="?" search="" willNavigate=true
history: push "/actions/dashboard"             t=5635      ← THE BUG: navigate to the current URL
[loader] 6 mitigateny_actions|page /dashboard  t=6524      ← whole loader tree re-runs
[loader] 7 mitigateny_actions|page /dashboard  t=6529
```

Content timeline (`document.body.innerText.length`): blank → 1018 @4.5s → 3503 @7.0s.

## Fix

`patterns/page/pages/_utils/index.js` — new exported helper that shapes the query string the
way `useLocation().search` does (`''` or `'?a=b'`), so the comparison is apples-to-apples:

```js
export const buildSearchString = (filtersObject) => {
    const params = convertToUrlParams(filtersObject);
    return params ? `?${params}` : '';
};
```

Used at all three call sites, replacing the raw `?`-prefix:

- `_utils/index.js` — `initNavigateUsingSearchParams` (mount-time URL seeding, view + edit)
- `patterns/page/pages/view.jsx:167` — `updatePageStateFilters`
- `patterns/page/pages/edit/index.jsx:218` — `updatePageStateFilters` (edit mode)

Deliberately a shared helper rather than three inline ternaries: the same mistake was made
independently at all three sites, so the invariant now has one home.

## Testing checklist

- [x] **Cold load of `/actions` — zero self-navigations.** History ops are now just React
      Router's own `createBrowserHistory` init `replaceState`; the phantom
      `push "/actions/dashboard"` is gone, and loaders 6/7 with it. Content timeline is
      monotonic (1018 → 1191 → 1437 → 3503) with no blank-out.
- [x] **Cold load of `/actions/dashboard`** — same result.
- [x] **Existing URL params survive a cold load.** `/actions/dashboard?jurisdiction=Auburn%20(City)`
      loads filtered (2977 chars vs 3503 unfiltered) and the URL is untouched, with zero
      history ops beyond router init.
- [x] **A control still writes its variable to the URL.** Typing in the search box →
      `?search=bridge&jurisdiction=Auburn+%28City%29`.
- [x] **Clearing one of several filters** → `?jurisdiction=Auburn+%28City%29`.
- [x] **Clearing the LAST filter** → `/actions/dashboard` with no trailing `?`, content
      returns to 3503, and it settles (no follow-up navigation).
- [x] **No regression to the Bug 19 fix** (`concurrent-page-editing-data-loss.md`): SPA
      click into `/actions/view?id=1103568` still renders (1951 chars), Back returns to the
      landing page, no page errors.

## Out of scope / observed but not changed

Two further route-loader re-runs remain on a cold load, both from the sync layer's
`onInvalidate` → debounced `router.revalidate()` wiring (`dmsSiteFactory.jsx:234`), traced to
their emitters:

- `bootstrapSkeleton()` invalidates (twice, ~500ms apart; the 150ms debounce collapses them
  into one revalidate) shortly after mount.
- `_bootstrapPatternImpl()` invalidates when the 755-item pattern bootstrap finishes, ~7-10s
  in, causing one more full revalidation.

Neither changed rendered content in the runs measured, and both are the documented design of
the local-first sync layer ("revalidate routes when sync receives remote changes") rather
than a defect. Worth revisiting if cold-load churn is still a complaint — a scope-aware
invalidate (only revalidate when the *active* route's `(app, type)` actually changed) would
remove them — but that is a sync-layer design change, not part of this fix.

The dev-only `PageView` mount → unmount → mount pair in the traces above is React
`StrictMode` (`src/main.jsx`), not a production behavior.

## Files changed

- `packages/dms/src/patterns/page/pages/_utils/index.js` (+`buildSearchString`, 1 call site)
- `packages/dms/src/patterns/page/pages/view.jsx` (import + 1 call site)
- `packages/dms/src/patterns/page/pages/edit/index.jsx` (import + 1 call site)
