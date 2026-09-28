# MapEditor: page freezes on opening the "Add Layer" modal (SourceSelector)

## Objective

User report: on a MapEditor edit page (`mapeditortest/edit/2142057`), clicking the "+" button to
open the "Add Layer" modal made the whole page unresponsive — before any filter typing, before
selecting a source. Separate from (and worse than) the already-known per-keystroke filter lag in
`FilterControls`/`SimpleControl`.

## Root cause

`packages/dms/src/patterns/mapeditor/MapEditor/components/LayerManager/SourceSelector/SourceList.jsx`.

`Modal`'s `open={source.add}` prop means `SourcesList` (and every child) only mounts on that exact
click — so everything below happened synchronously the instant the modal opened, not later:

1. **`SourcesList`** fetched every source in the pgEnv unbounded (no pagination) via
   `falcor.get(["uda", pgEnv, "sources", "byIndex", {from:0, to: length-1}, ...SourceAttributes])`
   and rendered **all** of them as `<SourceThumb>`, unfiltered, before any user input.
2. **Every mounted `SourceThumb`** independently fired its own unbounded fetch of that source's
   full view list (`sources.byId[source_id].views.byIndex`), regardless of whether that source was
   selected/expanded — so N sources on screen meant N parallel falcor requests plus N rich
   subtrees (each rendering a Lexical description) built synchronously on the same click.
3. **The actual freeze mechanism (not just a slow load):** `SourceThumb`'s fetch effect depended on
   `[falcor, falcorCache, source, pgEnv]`. Both `falcorCache` (from `avl-falcor`'s `useFalcor`,
   which produces a new cache reference on every write, debounced only 250ms) and `source` (a
   fresh object literal from `SourcesList`'s `sources` useMemo, itself keyed on `falcorCache`) get
   a new reference on essentially every render. That created a feedback loop: fetch resolves →
   cache updates (new `falcorCache` ref) → `SourcesList` re-renders → new `source` objects handed
   to every `SourceThumb` → every thumb's effect deps see new refs → effect re-fires → more
   fetches → more cache writes → repeat, multiplied across every rendered source. This starts the
   instant the modal mounts and scales with the total source/view count in the project — hence a
   full freeze rather than mere lag.

`SourceSelector/index.jsx` additionally duplicated the same unbounded all-sources fetch
unconditionally on every `SourceSelector` mount (i.e. on every MapEditor page load, independent of
whether the modal was ever opened) — redundant with `SourcesList`'s own fetch into the same falcor
cache path.

## Fix

All in the same directory, no data-fetching architecture changes (this pattern already calls
`falcor.get` directly throughout, consistent with existing mapeditor convention):

1. **`SourceThumb`** (`SourceList.jsx`): gated the per-source views fetch on `isActiveSource`
   (only fetch a source's views once the user actually selects/expands it) and fixed the effect's
   dependency array to stable primitives — `[falcor, pgEnv, source.source_id, isActiveSource]`
   instead of `[falcor, falcorCache, source, pgEnv]`. This alone kills the feedback loop: at most
   one source's views are ever fetched at a time, and that fetch no longer refires on unrelated
   falcor cache writes elsewhere in the app.
2. **`SourcesList`**: extracted the existing filter/sort chain into a memoized `filteredSources`,
   and render only a windowed slice (`SOURCES_PAGE_SIZE = 30`) with a "Load more (N remaining)"
   button, instead of mounting every matching `SourceThumb` (with its Lexical description render)
   at once. `visibleCount` resets to the page size whenever search/category/sort changes. This
   bounds worst-case simultaneous mounts regardless of how many sources exist in the project.
3. **`SourceSelector/index.jsx`**: removed the duplicate unconditional all-sources fetch effect —
   `SourcesList` already populates the same `["uda", pgEnv, "sources", "byIndex"]` cache path by
   the time `addLayer()` can run (the user must have navigated `SourcesList`'s UI to pick a
   source/view first), so the `sources` useMemo here just reads that cache. Dropped the now-unused
   `SourceAttributes` import.

Not changed: server-side pagination. Confirmed via `dms-server`'s `uda.controller.js` that
`sources.byIndex`/`views.byIndex` only do real SQL `LIMIT`/`OFFSET` for DAMA-hosted envs; for
DMS-hosted sources they still pull the whole set into memory server-side before slicing in JS.
Client-side windowing still fixes the freeze (bounds render + fetch count), but the server-side
inefficiency for DMS-hosted envs is a separate, undone follow-up — there's no search/filter route
for `sources` at all, so a real fix would need one (out of scope here).

Verified via `npx eslint` on both touched files — diff introduces no new errors/warnings; all
existing findings (`react/prop-types`, unused `baseUrl`/`setCat2`/`layers`, unescaped entities,
`themeOptions` unknown prop) were already present before this change.

## Known related, not investigated

The per-keystroke filter-input lag (numeric/`between`/`>=`/`<=` value input in
`LayerEditor/Controls.jsx`'s `SimpleControl` writing straight to state with no debounce, unlike the
already-debounced equality search box in `FilterControls.jsx`) is a separate, still-open issue —
tracked only in conversation, not yet fixed or written up as its own task.

## Testing checklist

- [ ] Live: open a MapEditor edit page with a project that has a realistic (100+) source count,
      click "+" to open Add Layer — modal should open and stay responsive immediately, sources
      list should show only the first page with a "Load more" control.
- [ ] Click into a source to expand it — its views should load (only that source's fetch fires).
- [ ] Search/category/sort — `visibleCount` should reset to the first page each time.
- [ ] Confirm adding a layer still works end-to-end (source → view → layer type → Add layer).
