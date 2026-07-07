# DataWrapper: discard stale out-of-order fetch responses

## Status: DONE (2026-07-01)

## Objective

Fix a data-correctness bug: a dataWrapper component (Graph, Spreadsheet, Card, anything
built on `useDataLoader`) could briefly fetch unfiltered/unscoped data on mount, then a
second, correctly-scoped fetch — and if the *first* (unfiltered) request's network
response arrived *after* the second one's, it silently overwrote the correct data.

## Reported symptom (user)

On a report page, a Graph rendered the wrong data. The user's report's underlying
unfiltered source table has 10B+ rows, so its (unwanted) unfiltered query took much
longer than the correctly-scoped follow-up query — long enough to resolve after it and
clobber the display. Other users don't hit this because their unfiltered tables are
small enough that the first request usually loses the race harmlessly. User also
reported the same class of bug on `Spreadsheet`, which pointed at shared dataWrapper
plumbing rather than anything Graph- or report-specific.

## Root cause

`useDataLoader.js`'s main load effect (and `onPageChange`) `await getData(...)` and then
unconditionally `setState({ draft.data = data, ... })` — there was no check that the
response still corresponds to the most recently issued request. Two fetches can
legitimately be in flight at once:

- `state.filters` (plain page filters) and `state.comparisonSeries.config` (Graph's
  dynamic route binding, see `reportroutelist-page-templates.md`) both start at an
  "unresolved" value on mount and get corrected shortly after by a separate
  `useEffect` in `usePageFilterSync.js` (lines 26-66 for filters, 82-113 for comparison
  series) — which runs *after* first render.
- The 300ms debounce in `useDataLoader`'s load effect normally absorbs this: if the
  correction lands before the timer fires, `clearTimeout` cancels the stale fetch
  before it ever starts. But once `load()` has actually begun (timer already fired,
  network call in flight), a later `fetchKey` change re-running the effect only cancels
  the *next* scheduled timer — it does nothing to the in-flight request. Two requests
  end up racing, and whichever happens to resolve last wins, regardless of which was
  issued first.
- For Graph specifically: before `comparisonSeries.config` resolves, `buildUdaConfig.js`
  (`activeComparisonSeries`, ~line 1084) treats comparison series as inactive, so the
  first request has no route scoping at all — a full unfiltered table scan. This is
  the same class of "unresolved page-filter fires an unfiltered scan" trap that
  `hasUnresolvedRequiredLeaf`/`requireResolved` (`buildUdaConfig.js:411-429`) already
  guards for filter leaves, but comparison series isn't wired into that guard.

## Fix (shipped)

Scope: **only** the general race-condition fix in `useDataLoader.js` (a preventive fix
extending the `requireResolved`-style guard to comparison series was proposed but
explicitly deferred/declined by the user — not implemented).

Added a shared request-generation counter (`requestIdRef`, a `useRef(0)`) in
`packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataLoader.js`:

- Both the main load effect's `load()` and `onPageChange` capture `const requestId =
  ++requestIdRef.current` before calling `getData`.
- After `await getData(...)` resolves, both check `if (requestId !== requestIdRef.current)
  return;` before touching `lastFetchKeyRef`/`setState` — a response is only applied if
  no newer request has been issued since.
- The `finally` block's `setLoading(false)` is similarly guarded so a stale response
  finishing doesn't flip the loading indicator off while a newer request is still
  pending.
- One counter is shared across both call sites (main effect + pagination) since both
  write into `draft.data`/`draft.display.totalLength` and can race each other too.

This does not cancel the underlying network request (see below) — it only ensures a
slow, superseded response can never be applied once a newer one has already landed (or
is in flight).

## Files changed

| File | Change |
|---|---|
| `packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataLoader.js` | Added `requestIdRef` generation counter; guarded the main load effect's `load()` and `onPageChange`'s post-`getData` `setState`/`lastFetchKeyRef`/`setLoading(false)` on `requestId === requestIdRef.current` |

## Testing

- [x] `npx vitest run packages/dms/tests/buildUdaConfig.test.js` — 128/128 pass (unaffected;
      this suite doesn't cover `useDataLoader.js`, which has no existing automated tests
      per `documentation/datawrapper.md`'s "Not covered by automated tests" list).
- [ ] Not live-verified in a browser this session (no repro available locally — the bug
      requires a genuinely huge unfiltered source table to reproduce the timing).

## Explicitly deferred / out of scope

- **Preventive fix for Graph**: extend `hasUnresolvedRequiredLeaf`-style gating so an
  *enabled* comparison-series subscriber that hasn't resolved `config` yet also skips
  the fetch (mirroring `requireResolved`), instead of firing an unscoped query. Would
  eliminate the wasted unfiltered scan entirely, not just the race. User asked to scope
  down to "just fix 1" (the general race fix) — this was not implemented.
- **True request cancellation** (investigated, not implemented): the `busy.loading`
  "Loading... N" indicator (`dms-manager/wrapper.jsx:114-133`, rendered by
  `patterns/page/pages/edit/editPane/index.jsx:101-109`) stays lit for the full duration
  of a discarded/stale request, since it counts real in-flight `apiLoad` calls and has
  no way to know a response will be discarded. Traced the full chain
  (`apiLoad` → `dmsDataLoader` (`api/index.js`) → `falcor.get()` →
  `@availabs/avl-falcor`'s `XMLHttpSource`/`request.js`): the lowest layer's Observable
  has a dispose function that calls `xhr.abort()`, but no layer above it
  (`falcor.get()`'s promise form, `dmsDataLoader`, `apiLoad`) threads through an
  `AbortController`/signal. `@availabs/avl-falcor` is an external npm package
  (`node_modules`, not part of the `src/dms` submodule), so wiring real cancellation
  through would require changing that package, not just this codebase — a materially
  bigger, cross-package task. Not pursued since it's cosmetic/efficiency-only now that
  the data-correctness bug is fixed.
