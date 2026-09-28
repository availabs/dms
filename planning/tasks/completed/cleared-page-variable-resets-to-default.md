# Clearing a URL-bound page variable resets it to its registered default

> **Status:** DONE 2026-09-24 · BC (see check below) · driven by TransportNY ticket **#2214477**
> (`tsmo2:home`, "Rapid year switching makes the page unresponsive"). Uncommitted in the submodule at
> time of writing; reaches deployed sites with the next submodule bump.

## Objective

A clear (the × on a filter control, a Clear-all, a cleared time token) on a **URL-bound** page
variable that has a **registered default** must always land on that default — not only when the
clear happens to change the URL.

## Symptom (owner repro, live-verified)

TSMO home registers `year` (`{id:"tsmo-year", values:"2025", searchKey:"year", useSearchParams:true}`).

| Step | URL | Select | ED / cost cards | Map-21 PM3 cards |
|---|---|---|---|---|
| clean load | `?year=2025` | 2025 | 2025 | 2025 |
| first × | bare | 2025 | 2025 | 2025 |
| **second ×** | bare | **empty** | **2026** (26 widened queries) | **2025** |

The second state mixes years with no indication, and no URL can reproduce it (a reload of the bare
URL navigates to `?year=2025`).

## Root cause

`updatePageStateFilters` (`pages/view.jsx`, duplicated in `pages/edit/index.jsx`) handles a clear by
setting the variable's pageState `values = []` and navigating to a URL without the key.

- **First ×** — URL `?year=2025` → bare. The searchParams effect runs
  `updatePageStateFiltersOnSearchParamChange`, which rebuilds pageState from the registry; the key is
  absent from the URL, so the registry default `"2025"` comes back. The clear is silently undone.
- **Second ×** — the URL is already bare: `url === search`, no navigation, no rebuild. The `[]`
  sticks, `usePageFilterSync` writes `[]` into every reacting leaf, and `applyPageFilters` treats a
  true `[]` as "deliberately cleared" → the empty-IN guard drops the constraint → each section
  widens. The TSMO cards group by year, sort desc, pageSize 1, so each shows the newest year its
  source has: 2026 for excessive-delay/TRANSCOM, 2025 for Map-21 (full-year metrics, no 2026 rows —
  correct, per owner).

So the same action produced two states depending on history.

## Prior decision this implements

`filter-bar-single-select-clearable.md` (2026-07-27): clearing the congestion Year control "falls back
to the page-settings default — **owner confirmed that is the intended meaning of 'cleared'**, not
'all values'." This change makes that hold on every clear, not just one that changes the URL.

## Change

- `_utils/index.js` — new `resolveClearedPageVariables(removeFilter, pageFilters, registry)` →
  `{searchKey: defaultValues[]}` for each key being cleared that is URL-bound AND has a non-empty
  registry `values` (string → one-element array, the same normalization
  `initNavigateUsingSearchParams` applies for the URL).
- `view.jsx` / `edit/index.jsx` `updatePageStateFilters` — those keys are rewritten from "remove" to
  "set to default": the default stays in the query string (`?year=2025`, what a fresh load shows) and
  is written into pageState as a fresh array. The write is unconditional because the clearing control
  has already emptied its own leaf (`ConditionValueInput` → `updateNodeAtPath`) and only re-syncs from
  a `pageState.filters` identity change (`usePageFilterSync`); when the URL already carries the default
  there is no navigation to trigger one.
- Everything else is unchanged: non-URL variables and URL variables without a default still clear to
  `[]`; `removeFilter` entries that are `false` (a control SETTING a value) are ignored.

## BC check

- Callers passing a `removeFilter` map (grep of `updatePageStateFilters(` in `packages/dms/src`):
  `ConditionValueInput` ×2 (value + time), `FilterControlCell`, `RenderFilterValueSelector`,
  `ExternalFilters` ×3 (`toggleUnary`, `clearLeaf`, `clearAllFilters`). Map (`index.jsx`,
  `SymbologyViewLayer.jsx`) and `RenderFilters.jsx` pass none → unaffected.
- **Common path (clear while the URL carries the key)**: resulting state already was the default via
  the rebuild; now also the default. Only the URL text differs (`?key=<default>` vs bare, and bare
  resolves to the default).
- **Changed path (clear while the URL lacks the key)**: previously widened to no constraint (the bug);
  now the default.
- **Unary toggles** (`toggleUnary`, `{[key]: !turningOn}`) are the one caller where "off" is a value,
  not a clear — a URL-bound unary toggle with a non-empty default could no longer be turned off. It
  already couldn't on the common path (the rebuild restored the default), so nothing that works today
  breaks. Census 2026-09-24 over every `dms_*` schema on the prod content DB: 22 unary
  `usePageFilters` leaves exist, all MitigateNY `needs_priority`, which has **no** registered default
  → zero overlap.
- Blast radius: 538 URL-bound page-variable rows with a non-empty default, 28 distinct
  (schema, key) pairs — npmrdsv5 14, mitigat_ny_prod 7, dms_site 5, wcdb 1, landbank 1. Census saved
  to `scratchpad/npmrdsv5-dev2/census_url_page_var_defaults_2026-09-24.txt` (dms-template root).

## Files changed

| File | Change |
|---|---|
| `packages/dms/src/patterns/page/pages/_utils/index.js` | `resolveClearedPageVariables` |
| `packages/dms/src/patterns/page/pages/view.jsx` | `updatePageStateFilters` rewrites clears of defaulted URL variables |
| `packages/dms/src/patterns/page/pages/edit/index.jsx` | same, edit mode |
| `packages/dms/tests/pageVariableClearReset.test.js` | 9 unit tests |

## Testing checklist

- [x] `npx vitest run tests/pageVariableClearReset.test.js tests/navLinkPages.test.js` — 23/23.
- [x] Live, `/tsmo/home` (published view): ×, ×, × → every step `?year=2025`, select 2025, all five
      year-bound cards 2025, **0** API requests per clear (was 26 widened queries on the 2nd ×).
- [x] Live, `?year=2026` → × → `?year=2025`, all cards 2025.
- [x] Live, `/tsmo/edit/home` (draft ids): ×, ×, × → same as view.
- Probe: `scratchpad/npmrdsv5-dev2/probe_year_clear_2214477.mjs` (dms-template root).

## Out of scope (noted, not changed)

- `updatePageStateFiltersOnSearchParamChange` rebuilds EVERY variable from the registry on any URL
  change, so a non-URL page variable a control set is reset to its default whenever some URL-bound
  variable changes. Same family, different path; no report against it.
- The page-level "can't be emptied" alternative (drop the × on a required control) already exists for
  the filter BAR (`filter.allowClear`); the `ExternalFilters`/`ConditionValueInput` path stays
  unconditionally clearable. The TSMO owner wants the × kept as an affordance.
