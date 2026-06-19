# Empty `filter`/`exclude` leaf → no-op (don't emit `IN ()`)

## Objective

A dataWrapper filter leaf with op `filter` (or `exclude`) and an **empty value**
(`[]`, `[""]`, `[null]`) must compile to **no constraint**, not to a broken /
row-zeroing predicate. This is the canonical state of an unset `usePageFilters`
page-control leaf (e.g. a region selector with nothing chosen), so it has to
mean "don't filter", exactly as it already does for `like`.

## Root cause

In `buildUdaConfig.js` `mapFilterGroupCols`, only the `like` op guards against
empty values (returns `null` so the parent group's `.filter(Boolean)` drops the
leaf). `filter`/`exclude` leaves fall straight through to the server, which emits:

- `value: []`  → `col IN ()`  → **Postgres syntax error** → the whole card query
  fails.
- `value: [""]` → `col IN ('')` → matches nothing → **null/blank aggregates**.

### How it surfaced (tsmo congestion page `congestion_v2`, 2175676)

Every data card carries a `region_name` filter leaf wired to the `region`
page-filter with an empty saved value (`[]` for KPIs/corridor/composition,
`[""]` for seasonality). On first paint the cards render from their **seed**
(smart fetchMode), so the bug is latent. The moment any refetch fires — e.g. the
user sets the `year` control — the card re-queries with `{year:[…],
region_name:[]}` and the empty region leaf detonates (`IN ()` error / `IN ('')`
zero rows). The one card **without** a region leaf ("Delay by NYSDOT region")
was the only survivor — the tell that isolated the cause.

Verified at the SQL level against `excessive_delay.s2039_v3488_…_v2_series`:
`year IN ('2024')` → 277.1M; `… AND region_name IN ('')` → null;
`… AND region_name IN ()` → *syntax error*.

## Fix (IMPLEMENTED)

`mapFilterGroupCols` (`buildUdaConfig.js`), immediately after the existing `like`
guard — prune `filter`/`exclude` leaves once empty/blank/null values are removed:

```js
if (node.op === "filter" || node.op === "exclude") {
  const vals = (Array.isArray(node.value) ? node.value : (node.value != null ? [node.value] : []))
    .filter((v) => v != null && String(v).length);
  if (!vals.length) return null;
}
```

- Mirrors the `like` guard above and the multiselect empty-strip below it.
- Null sentinels (`'null'`/`'not null'`, `String` length > 0) **survive** → IS
  NULL / IS NOT NULL handling untouched.
- `is_null`/`is_not_null` ops are still their own ops at this point (mapped to
  sentinels later), so the guard never sees them.

### Backward compatibility

BC in practice: an empty `IN ()` is a SQL *error* today and `IN ('')` is a
never-intended "show nothing" — no card can legitimately depend on either. This
finishes a guard the `like` op already has and aligns with the multiselect
empty-strip. Global change (every site uses `buildUdaConfig`), so it gets this
task + sign-off (done: Alex, 2026-06-17).

## Files

- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`
  — `mapFilterGroupCols`, new empty-value guard for `filter`/`exclude`.

## Testing

- [x] Logic unit-check (isolated replica of the group recursion + guard):
      `year + region[]` → keeps `year` only; `region[""]` → keeps `year` only;
      `region[selected]` → keeps both; `["null"]` sentinel → survives;
      `exclude[]` → pruned. (`scratchpad/npmrdsv5-dev2/test_guard.mjs`.)
- [ ] Live verification on `congestion_v2` (2175676): set `year` to 2024/2026 →
      all cards (KPIs, seasonality, corridor table, composition) load instead of
      breaking; select a region → cards filter; clear region (× pill, see the
      page-side change below) → cards return to statewide. *(Blocked on a fresh
      tsmo2 dev auth for the Playwright loop; Alex can eyeball in the editor.)*
- [ ] Existing UDA test suite still green.

## Related page-side change (not part of this primitive task)

`congestion_v2` region filter (section 2175680) given `isMulti:true` on its
`region_name` leaf so it renders as a clearable multi-select (× pills → back to
statewide). Tracked in `planning/transportny/tasks/current/tsmo-congestion-page-build.md`.
Without *this* prune fix, clearing the region would just re-break the cards — the
two changes are paired.
