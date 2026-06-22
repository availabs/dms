# Live cross-view joined section (a section whose data is two views joined in-engine)

How to bind a `Card` / `Spreadsheet` / `Graph` section to **two
data views joined together**, live, through the dataWrapper — e.g.
a speed value that needs travel-time from a fact view and segment
length from a metadata view, or any "this view lacks the column I
need to filter/label/order by, but a sibling view has it." The join
runs **in the query engine** (one SQL `FROM a JOIN b`), so the
section stays a normal live `fetchMode:'smart'` binding — no
seeding, refetches on page-variable change.

> **Audience:** an engineer or AI adding a data section whose value
> or filter/sort columns span two views.
>
> **Read first:**
> - [`using-a-datawrapper-card.md`](./using-a-datawrapper-card.md) — the base binding shape (`externalSource` + `columns` + `filters` + `display` + `data` + **`join`**) and the source/version rule. This skill is the `join` half of that shape.
> - [`card-layout.md`](./card-layout.md) / [`authoring-graphs.md`](./authoring-graphs.md) — column/cell knobs for the consuming section.
> - [`creating-interactive-pages.md`](./creating-interactive-pages.md) — page variables, so the joined section reacts to URL params.

---

## **If you take nothing else** — the four load-bearing facts

1. **Both views must live in the same query engine.** The join
   compiles to one `FROM ds JOIN <alias>` against a single backend.
   A ClickHouse↔Postgres join is **impossible** — pick the sibling
   view that lives in the same engine as your base view. (Same pgEnv
   isn't enough; same *engine*. The npmrds family has a CH speed view
   **and** a CH metadata twin precisely so they can be joined.)
2. **Write column names alias-prefixed** (`ds.col`, `meta.col`). For
   DAMA (non-DMS) sources these pass through to SQL verbatim; for DMS
   sources the wrapper rewrites `alias.col` → `alias.data->>'col'`.
3. **`sourceInfo.columns` is REQUIRED on every joined source** or the
   **edit-mode** section menu throws and the whole page shows "Unable
   to complete your request." View mode hides the bug — **always
   smoke-test a joined section in `/edit`.**
4. **A per-year/per-version metadata view fans the join out.** Pin the
   version column (e.g. `meta.year`) in the filter, or every base row
   multiplies by the number of metadata versions.

---

## The `join` object (element-data, top level)

The dataWrapper's `useDataLoader` forwards `state.join` straight into
the UDA options. Author it next to `externalSource`/`columns`/`filters`:

```js
join: {
  operator: '=',
  sources: {
    ds: {},                         // the base table (your externalSource) — alias 'ds', left empty
    meta: {                         // every additional source gets an alias key
      source: 582,                  // source_id of the joined source
      view: 983,                    // view_id of the joined view
      env: 'npmrds2',               // its pgEnv/dmsEnv
      type: 'left',                 // join type (left|inner|…)
      mergeStrategy: 'join',        // 'join' | 'union' | 'except'
      sourceInfo: { isDms: false, env: 'npmrds2',
                    source_id: 582, view_id: 983,
                    columns: META_COLS },   // ⚠ REQUIRED — real schema array; omitting it crashes /edit
      joinColumns: [{ dsColumn: 'tmc', joinSourceColumn: 'tmc' }],  // ds.tmc = meta.tmc (repeat for composite keys)
    },
  },
}
```

`buildJoin` (client:
`patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`;
server: `routes/uda/utils.js#buildJoin` + `query_sets/clickhouse.js`)
turns that into `sources:{ meta:{view_id,env} }` +
`on:[{type,table:'meta',on:'ds.tmc = meta.tmc'}]`. `calculateIsJoinPresent`
flips on as soon as `sources` has a key other than `ds`.

## Columns, filters, ordering — all alias-prefixed

```js
// a calculated value spanning both views (CLICKHOUSE syntax if the base view is CH):
col({ name: 'round(avg(meta.miles/nullif(ds.travel_time_all_vehicles,0)*3600)) as speed',
      target: 'color', key: 'speed' })
// filter on a column that only the metadata view has + pin the version:
filters: { op: 'AND', groups: [
  { col: 'meta.tmclinear', op: 'filter', value: [], usePageFilters: true, searchParamKey: 'tmclinear' },
  { col: 'ds.date',        op: 'filter', value: [], usePageFilters: true, searchParamKey: 'date' },
  { col: 'meta.year',      op: 'filter', value: ['2024'] },   // ← version pin (anti-fan-out)
] }
// order/group by a metadata column the base view doesn't carry:
col({ name: "concat(leftPad(toString(meta.road_order),3,'0'),' · ',ds.tmc) as seg",
      target: 'yAxis', group: true, sort: 'asc' })
```

**Engine-correct SQL.** The expressions compile against the **base
view's engine**. If `ds` is ClickHouse use `intDiv`, `leftPad`,
`toString`, `concat`, `avg`, `nullif` — **not** Postgres
`lpad`/`floor(a/b)`/`::numeric`. If `ds` is Postgres, the usual PG
gotchas apply (`round(double,int)` → cast `::numeric`, etc.).

## Verify

1. Build the section, then **screenshot `/edit`** (not view mode — a
   draft page renders nothing in view mode, and the `sourceInfo.columns`
   crash only fires in edit). Watch the console for **0 errors**.
2. Confirm the joined value/sort/filter is real, then **prove it's
   live**: change the controlling page variable (or hit the page with a
   different `?param=`) and confirm the data refetches — no reseed.

## Worked example

The TSMO **Corridor View** time-space speed grid — a live `GridGraph`
whose base is direct npmrds speeds (CH view 982) joined to the npmrds
meta / shapefile-enhanced twin (CH view 983) on `tmc`: speed =
`meta.miles / ds.travel_time_all_vehicles`, rows ordered by
`meta.road_order`, filtered to one corridor by `meta.tmclinear` +
`direction` + `county`. Builder:
`scratchpad/npmrdsv5-tsmo2/build_tsmo_corridor_view.mjs`
(`GRID_JOIN()` + `speedGridGraph()`); task:
`planning/transportny/tasks/current/tsmo-corridor-view-page-build.md`
(records the `tmclinear`-isn't-unique and year-pin gotchas).

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `/edit` whole page → "Unable to complete your request"; console `Cannot read properties of undefined (reading 'source_id')` at `sectionMenu.jsx` | joined source has no `sourceInfo.columns` | add the real schema array to `sourceInfo.columns` |
| Counts/sums multiplied (≈N× too high) | per-version metadata view fanned the join out | pin the version column (`meta.year`) in `filters` |
| `Unknown expression identifier 'X'` | wrong-engine SQL, or column isn't on the view you think | match the base view's engine dialect; verify the column exists |
| Section renders but blank, `Error getting length` | querying a column that isn't real on the joined result (e.g. a synthetic per-cell field) | for computed/expanded grids without real columns, seed + `fetchMode:'cache'` instead (see incident-view); a *real* join like this should be `smart` |
| One "corridor"/group mixes unrelated rows | the group key isn't actually unique | add the disambiguating columns (e.g. `tmclinear` alone bundles both directions across counties → key on `tmclinear+direction+county`) |
