# Derived page variable — one control drives a value another binding needs

> **Status:** ✅ IMPLEMENTED + VERIFIED 2026-07-29. `applyDerivedPageVariables` in
> `patterns/page/pages/_utils/index.js`, applied in `getPageVariableRegistry` (initial) and in
> `updatePageStateFiltersOnSearchParamChange` (after the URL→state mapping, so it re-derives on every
> navigation). Author-editable: `Derived From` + `Derive` on each row of the Settings → Filters
> editor. BC — rows without `derivedFrom` are untouched, and the helper returns its input array
> unchanged when nothing resolves (no render churn). Core rides the owner git sync.
> **Origin:** TransportNY QA ticket 2196296 (`tsmo2:corridor_view`). Owner decision: the corridor's
> network vintage should follow the existing Month control rather than be a second thing a user sets.

## Problem

A page often has one user-facing control whose value another binding needs in a *different shape*.
The worked case: `corridor_view` has a **Month** variable (`202606`) and needs a **network vintage**
(`2026`) — the same fact, sliced. Today the only options are:

- a second control the user must keep consistent with the first (what shipped: a hidden `year`
  variable with a static default), or
- hardcoded pins in every section (what was there before: ten leaves pinned to `2024`, disagreeing
  with the map's `2026`).

## Why this belongs at the page-variable layer, not on the filter leaf

A leaf-level transform (`deriveValue: "yyyy"` on a filter leaf) was considered and rejected: section
filters and map layers resolve page variables through **two different code paths**, so it would have
to be implemented twice and kept in step.

| consumer | resolution path |
|---|---|
| section filter leaves | `applyPageFilters` in `dataWrapper/buildUdaConfig.js:401` |
| map symbology layers | the layer's `dynamic-filters`, resolved in the map component and emitted onto the tile URL as `&filter=<sql>` |

Deriving at the **variable** layer means both consumers keep doing exactly what they already do —
bind to a `searchParamKey` — and neither needs to know the value was computed. The corridor page is
the proof: its map's `year` dynamic-filter was *already* correct and needed no change at all.

## Shape

A page-filter row gains two optional fields:

```js
{ id: "tsmo-cv-year", searchKey: "year", useSearchParams: false,
  values: "2026",            // fallback, used only when the source is unset
  derivedFrom: "month",      // another row's searchKey
  derive: "yyyy" }           // named derivation
```

Resolution rules:

- Compute after the source variable resolves; a derived row's own `values` becomes its fallback when
  the source is unset (mirrors `applyPageFilters`, which preserves a leaf's saved value rather than
  widening — see `buildUdaConfig.js:447-458`).
- **A derived variable is NOT url-bound** (`useSearchParams: false`), which corrects this task's
  first draft (it proposed "an explicit URL param wins"). That cannot work: `updatePageStateFilters`
  (`view.jsx:148-155`) rebuilds the query string from EVERY `useSearchParams` row, so a derived row
  in the URL is re-emitted with its stale value whenever any other control changes — and on the next
  URL→state pass that stale value is indistinguishable from a deliberate override, so the derivation
  would never re-fire. Keeping it out of the URL removes the ambiguity: the source is in the URL and
  the derived value follows it. Nothing is lost — the derived value is reproducible from the source,
  so a shared link still restores it.
- Derivations are a small named registry, not expressions: `yyyy` (first 4 chars — `202606` →
  `2026`), and whatever the next consumer actually needs. Named keeps it inspectable in the editor
  and avoids inventing a formula language.
- Reject/ignore a cycle (`a` derived from `b` derived from `a`) — single-hop only until there's a
  reason for more.

BC: rows without `derivedFrom` behave exactly as now.

## Files changed

- `patterns/page/pages/_utils/index.js` — `PAGE_VARIABLE_DERIVATIONS` (closed registry) +
  `applyDerivedPageVariables`; called from `getPageVariableRegistry` (seeds the initial pageState, and
  therefore what `initNavigateUsingSearchParams` writes) and from
  `updatePageStateFiltersOnSearchParamChange` **after** the URL→state mapping, so the derived value
  follows its source on every navigation rather than only on first mount.
- `patterns/page/pages/edit/editPane/settingsPane.jsx` — `Derived From` (a select of the page's other
  non-derived variables) and `Derive` (shown only once a source is picked) on each Filters row. The
  existing read-only `Active Value` column already displays the resolved value, so an author can see
  the derivation take effect without leaving the pane.
- No format/schema change was needed: page-filter rows are free-form objects, and the editor's
  `updateFilters` spreads the row, so the new keys round-trip.

## Testing checklist

- [x] `month=202606` → `year` resolves `2026`; `?month=202501` moves it to `2025`; `?month=202001`
      to `2020`. Verified live on corridor_view: SEGMENTS 53 → 53 → **51** and AADT 125k → 125k →
      **141k**, matching the vintage table for this corridor.
- [x] source unset → derived row falls back to its own `values`, does not widen to all vintages.
- [x] a section leaf bound via `usePageFilters`/`searchParamKey` sees the derived value.
- [x] a **map** `dynamic-filter` with the same `searchParamKey` sees it too — the emitted tile
      `&filter=` moved to `year = '2020'` on `?month=202001`. This is the half a leaf-level
      transform would have missed.
- [x] the page editor preserves the fields: `updateFilters` spreads the existing row
      (`settingsPane.jsx:24-25`), so unknown keys survive an edit of any other field — and the
      fields are now first-class in that editor rather than only writable by a build script.
- [x] 11 unit cases over the real source of `applyDerivedPageVariables` (derivation, fallbacks,
      array-vs-string value shape, unknown derivation name, single-hop, array identity stability).

## First consumer — done

`corridor_view`'s `tsmo-cv-year` is now `derivedFrom: "month", derive: "yyyy"`, `useSearchParams:
false`, `values: "2026"` kept as the unset-source fallback. **No section or map changes were needed**
— the ten data leaves and the map's year dynamic-filter were already bound to `year` from step 1.
Written through the build script (`build_tsmo2_corridor_view.mjs`, fidelity 26/26 before and after),
so a regeneration keeps it. That page is the standing regression test: SEGMENTS/AADT/grid/map must
all move together when Month changes.

## Remaining

- Only one derivation (`yyyy`) exists. Add others when a consumer needs one — the registry is a
  closed map on purpose.
- `?year=` no longer overrides on corridor_view (it is not url-bound). Pick a month to move the
  vintage; that is the intended single control.
