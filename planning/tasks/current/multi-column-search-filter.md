# First-class multi-column search filter

## Objective

Make "a single search box that matches across several columns" a **first-class, declarative**
filter — instead of today's hand-authored, per-section, per-column boilerplate. Reduce authoring
to naming the searchable columns once, standardize case-insensitive matching, and give large
tables a scalable path.

## Current state (the pattern this replaces)

A keyword search over N columns is wired entirely by configuration today (documented in the new
skill [`skills/full-text-search-filter.md`](../../../skills/full-text-search-filter.md), reverse-
engineered from the live MNY `actions_index` page — control `2239701`, consumers `2239704`/`2239700`):

1. A `Filter` control with `operation: "like"` + `searchParamKey: "search"` (renders a text box).
2. On **every** responding data section, an **`OR` group with one `like` leaf per column**, all
   sharing `searchParamKey: "search"`:
   ```jsonc
   { "op": "OR", "groups": [
     { "col": "action_name",  "op": "like", "value": "", "usePageFilters": true, "searchParamKey": "search" },
     { "col": "description",  "op": "like", "value": "", "usePageFilters": true, "searchParamKey": "search" },
     /* …16 leaves on the MNY page… */
   ]}
   ```

Mechanism (verified): `buildUdaConfig.js:209` wraps the value as `%v%`; `:181-184` drops an empty
`like` leaf so an empty box = no constraint; `applyPageFilters` fans the live value into every leaf.

### Why this is worth improving

- **Authoring cost N×M.** N searchable columns × M responding sections = N×M leaves to author and
  keep in sync. Adding/removing a searchable column means editing every section's OR group by hand.
- **Drift / silence.** A section missing the OR group simply doesn't react — easy to miss; no error.
- **Case-sensitivity.** Postgres `LIKE` is case-sensitive; search feels broken on capitalization
  unless the server maps to `ILIKE` (today's behavior unconfirmed/inconsistent — part of this task).
- **Doesn't scale.** `… LIKE '%term%'` OR'd over many text columns is a sequential scan. Fine at
  ~17.8k rows (MNY); the first TransportNY consumer (TSMO Incident Search over transcom 956/1947) is
  **millions of rows**, where this both bloats authoring and risks unusable latency.

## Proposed changes

**A — Query-builder sugar (core, BC).** Support a single search leaf that carries the column list,
e.g. `{ "op": "search", "searchColumns": ["action_name","description",…], "value": "",
"usePageFilters": true, "searchParamKey": "search" }` (or a `searchColumns` field on a `like`
leaf). `buildUdaConfig` expands it into the existing OR-of-`like` at compile time. Authors write
**one** leaf per section instead of N; the existing OR-of-likes remains the wire format (fully BC —
old configs keep working). Reuses the empty-value drop-out and `%v%` wrapping already in place.

**B — Control declares the columns (follow-on).** Let the Search control (or the page-filter
registry entry for `search`) carry `searchColumns`, so responding sections only need the bare
`searchParamKey:'search'` reference and the builder supplies the columns. Removes per-section column
lists entirely. (Needs the builder to read the column list from the page-filter definition.)

**C — Case-insensitivity + scale.** Standardize `like`/`search` → **`ILIKE`** server-side (or
`lower(col) LIKE lower(%v%)`). For large sources, document and support a `pg_trgm` GIN index recipe
(and consider a `tsvector`/`websearch_to_tsquery` op for very large corpora). Pairs with the existing
dms-server **"Composite / covering filter indexes (`setIndexColumn`)"** todo item.

**Recommendation:** ship **A** + **C (ILIKE)** first (the BC authoring win + correct matching),
document the `pg_trgm` recipe; **B** as a clean follow-on; `tsvector` only if a consumer needs it.

## Files requiring changes (verify during implementation)

- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`
  — the filter-node compile (`like` handling ~175-211; the group walk that emits OR groups). Add the
  `op:'search'`/`searchColumns` expansion here.
- `.../dataWrapper/components/filters/Components/RenderFilterValueSelector.jsx` — the `like`/'text'
  control (line ~151, ~278-284); optionally expose a "search columns" authoring affordance for A/B.
- `.../dataWrapper/components/filters/RenderFilters.jsx` — filter reactivity / option-load skips for
  scalar ops (lines ~112, ~166) — make sure the new op is treated like `like` (no distinct-value load).
- **dms-server** filter→SQL translation — confirm/standardize `like`→`ILIKE`; add `search`/tsvector
  emitter if pursued. (Same layer as `time-filter.js`.)
- `migrateToV2.js` / `convertOldState.js` — include the new op in the scalar-op lists if needed.
- Update the skill [`skills/full-text-search-filter.md`](../../../skills/full-text-search-filter.md)
  once shipped (replace the N-leaf recipe with the one-leaf form; keep the manual form as the BC note).

## Testing checklist

- [ ] A single `search` leaf with `searchColumns` compiles to the same SQL as the manual OR-of-likes.
- [ ] Empty value → leaf drops out (no constraint), matching current behavior.
- [ ] Matching is case-insensitive end-to-end (control → URL → SQL → results).
- [ ] Old hand-authored OR-of-likes configs still work unchanged (BC).
- [ ] UDA test suite green; add cases for the new op (compile shape + empty drop-out + ILIKE).
- [ ] Large-table path: `EXPLAIN` shows index use with the documented `pg_trgm` recipe.

## First consumer / validation

[TSMO Incident Search](../../../../../../planning/transportny/tasks/current/tsmo-incident-search-page-build.md)
(transcom 956/1947, millions of rows) — exercises both the authoring win (many columns × table +
count sections) and the perf path. Build it on the manual pattern first if this lands later; migrate
to the one-leaf form when shipped.

## Progress log
- **2026-06-22** — Created from the TSMO Incident Search planning work, after Alex pointed to the MNY
  `actions_index` page as the working multi-column search. Pattern documented as a skill; this task is
  the enrichment to make it declarative + scalable. Not started.
