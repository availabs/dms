# Research: the DMS `map` component — filter system, page-state integration, and the single→multi-symbology gap

**Created:** 2026-07-14 · **Why:** before migrating the map's `?layers=` share-state onto DMS page
variables (task `planning/tasks/current/map-share-state-via-page-variables.md`), understand exactly how
the map already connects to page state, so we don't diverge from the established filter system or
break the single-symbology use it was built for.

Grounded in **code** (`.../ComponentRegistry/map/index.jsx` = `MapSection`, `.../map/SymbologyViewLayer.jsx`
= `ViewLayerRender`, `.../mapeditor/MapEditor/stateUtils.jsx`, `pages/view.jsx` + `pages/edit/index.jsx`
`PageContext`) and **real usage** (`mitigat-ny-prod` county_template pattern **1300890** + its maps).
Element-type is **`"Map"`** (capital).

---

## 1. State model

`MapSection` keeps everything in one `use-immer` store seeded from `cachedData` (the persisted `value`)
— `index.jsx:335-355`. The load-bearing field is **`state.symbologies`**, a three-level shape:

```
state.symbologies[symId]                 // keyed by symbology row id (String)
  .isVisible                             // per-symbology on/off  (index.jsx:474,507,538)
  .symbology.activeLayer                 // which layer the settings UI edits
  .symbology.layers[lKey]                // a renderable geometry+style unit
      .type ("fill"|"line"|"circle"), .layer-type ("interactive"|"choropleth"|…)
      .layers[]  (the actual maplibre sub-layers: paint/layout)
      .filter, .filter-group, .filterGroupEnabled, .dynamic-filters,
      .interactive-filters, .selectedInteractiveFilterIndex, .click-filter
      .view_id, .source_id, .data-column, .order, .searchParamKey
```

- A **symbology** = the author-selected dataset/style bundle that can be toggled visible.
- A **layer** = one renderable unit inside `symbology.layers`; `symbology.activeLayer` names the
  "current" one for the settings UI.
- `state.display` holds `shareableState` (share opt-in, `index.jsx:455`), `_functions`
  (hover/click providers+subscribers), `layerPanel`.

---

## 2. The five filter types a layer can have (each stored per-layer)

| Type | Stored | Applied to | Reads/writes page state? |
|---|---|---|---|
| **static `filter`** | `layer.filter` `{col:{operator,value}}` | map paint (`setFilter`), tile `?cols=`, legend UDA (`SymbologyViewLayer.jsx:463-574,1573`) | **neither** |
| **`filter-group`/`filterGroupEnabled`** | `layer["filter-group"]` + bool | classify/legend-by-group; adds cols to tile `?cols=` (`SVL:312-314,1575-1579`) | **neither** |
| **`dynamic-filters`** | `layer["dynamic-filters"]` `[{column_name,values,defaultValue,searchParamKey,…}]` | map paint (ANDed `["in",…]`, static wins), tile, legend (`SVL:539-572`; `index.jsx:647-657`) | **READS** (see §3) |
| **`interactive-filters` + `selectedInteractiveFilterIndex`** | `layer["interactive-filters"][]` variant patches | the `interactiveFilterIndicies` effect **merges the selected variant into the layer** (`index.jsx:1096-1147`) → new paint/type/data-column | **READS** (see §3) |
| **click-filters** | `layer["click-filter"]` `{enabled,mappings:[{variable,field,useSearchParams,redirectOnClick}]}` | NOT the map's own render — pushes to page state on click (`SVL:1020-1071,1106-1131`) | **WRITES** (see §3) |

`layerProps` (`index.jsx:1074-1085`) is a **flat map keyed by layerId across ALL symbologies**, carrying
every per-layer filter field into `ViewLayerRender`.

---

## 3. How the map connects to DMS page state — TWO buses

`PageContext` (`view.jsx:95-150`; `edit/index.jsx:145-241`) exposes `pageState`, `setPageState`,
`updatePageStateFilters` (URL-synced page filters), `setActionParam`/`clearActionParam` (transient
`type:'action'`, never URL). MapSection separates them: `dataPageFilters = pageFilters.filter(f =>
f.type !== 'action')` so hover/click action churn doesn't retrigger symbology filter-sync
(`index.jsx:570-572,591-596`).

**Consumers (map READS page vars):**
- **`dynamic-filters`** — the `dataPageFilters` effect (`index.jsx:592-661`) recomputes each dynamic
  filter's `values` from the matching page filter (`searchParamKey || column_name` vs `pageFilter.searchKey`),
  else `defaultValue`, else `[]`. One-way (page → map), for **every** symbology. **This is the county
  scoping** — e.g. the `geoid` dynamic-filter with `usePageFilters:true, searchParamKey:'geoid'`.
- **`interactive-filters`** — same effect (`index.jsx:606-631`): reads `searchParamKey` off the
  **active layer**, finds the variant whose `searchParamValue`/`label` matches the page value, and sets
  `selectedInteractiveFilterIndex` **only on `activeSym`/`activeLayer`** (single-symbology; see §5).
- **highlight subscribers** — read a `type:'action'` filter by `paramKey` and paint a transient overlay
  (`SVL:1195-1343`).

**Producers (map WRITES page state):**
- **click-filters** → `updatePageStateFilters(nextFilters)` (URL-synced when `useSearchParams`)
  (`SVL:1020-1071,1041`). This is the map's established page-owns-URL write path.
- **hover/click publish** → `setActionParam(paramKey, value)` / `clearActionParam` — transient, never URL
  (`SVL:856-920,1134-1160`).

**So the map already participates fully in the page-variable system** — as a consumer via
`searchParamKey`/`usePageFilters` leaves (like Card/Spreadsheet), and as a producer via
`updatePageStateFilters`/`setActionParam`. This is the "filter system" and it must stay as-is.

---

## 4. The share-state (`?layers=` / `f_<symId>`) — the off-road piece

A **separate, map-section-owned URL mechanism** using `useSearchParams()` directly (`index.jsx:454`),
gated by `shareEnabled = !isEdit && Boolean(display.shareableState)` (`:455`). Its own design note
(`:445-453`) says v1 **deliberately bypasses `pageState.filters`** because "page-level filters need page
authoring, while this state is owned by the map section."

- **READ** once (`urlReadDoneRef`, `index.jsx:459-495`): `?layers=` → per-symbology `isVisible` + sub-layer
  `layout.visibility`; each `f_<symId>=idx` → `selectedInteractiveFilterIndex` on that symbology's layers.
- **WRITE** on `state.symbologies` change (`:497-531`): `layers=` = comma-join of visible symbology ids;
  `f_<id>` = the `selectedInteractiveFilterIndex` of the first interactive layer per visible symbology;
  `setSearchParams(..., {replace:true})`.

**Two things it mirrors:**
- `?layers=` mirrors **per-symbology `isVisible`** — a symbology-level concept with **no** existing
  page-filter equivalent (visibility isn't a data filter). → genuinely a NEW page variable.
- `f_<symId>` mirrors **`selectedInteractiveFilterIndex`** — the SAME field the interactive-filter
  page-filter sync already sets from `searchParamKey` (§3). **These are two uncoordinated paths writing
  the same field.** Dynamic-filter values are NOT in the share URL at all.

**This direct `setSearchParams` write is the React-Compiler reload loop** (it fights the page's URL
ownership). It's the ONLY off-road piece.

---

## 5. Single- vs multi-symbology (the real gap)

Rendering/query is **multi-symbology-aware**: `layerProps` flattens all symbologies (`:1074`); the
legend-refresh (`:726`), interactive-flatten (`:1096`), and dynamic-filter **value** sync (`:642-644`,
"every symbology, not just the active one") all iterate every symbology.

But **page-state integration + the settings UI are single-active-symbology-bound** — `activeSym =
Object.keys(state.symbologies).find(isVisible)` (the FIRST visible one, `:537-539`):
- The **interactive-filter ↔ page-filter bridge** reads `searchParamKey` from `activeLayer` and writes
  `selectedInteractiveFilterIndex` only to `activeSym`/`activeLayer` (`:606-631`). Two visible
  symbologies each bound to different page keys → only the first-visible one syncs.
- Filter-bounds zoom uses `Object.keys(state.symbologies)[0]` and writes to `activeSym` (`:671,691`).
- The entire filter-authoring UI (`settings/filters.jsx`, `controls/FilterControls.jsx`,
  `symbologySelector.jsx`) resolves ONE active symbology and mutates only `symbologies[activeSym]…`;
  `onSymbologyChange` even **replaces** the map with a single symbology (`symbologySelector.jsx:198`).

**Net:** the map renders N symbologies fine and propagates dynamic-filter *values* to all, but the
interactive-filter/page-filter bridge, bounds zoom, and authoring UI assume a single active symbology.

---

## 6. Real usage — established vs new

| | County template (1300890) — **established** | Freight atlas — **new** |
|---|---|---|
| symbologies per map | **1** (single) | **many** (multi) |
| `display.shareableState` | **none** | **on** |
| page-state hook | consumes `geoid` via `dynamic-filters` `usePageFilters:true searchParamKey:'geoid'` | share-state `?layers=`/`f_` via `useSearchParams` (off-road) |
| `geoid` registered | pattern filter `1300890.filters:[{searchKey:'geoid',values:['36105']}]` (copies override) + page `.filters:[{searchKey:'geoid'}]` | n/a |
| interactive-filters | present (e.g. 17 Total-EAL variants) but NOT URL-shared | shared via `f_<symId>` |

So the single-symbology, page-var-consuming map (county template) is the mature path; multi-symbology +
share-state is newer and only the freight atlas exercises it.

---

## 7. Implications for the share-state → page-variable migration

1. **`layers` (visibility)** has no existing page-filter analog → make it a **map-owned page variable**
   (registered, read from `pageState.filters`, written via `updatePageStateFilters`). Clean, additive.
2. **`f_<symId>` collides with the interactive-filter `searchParamKey` binding** (§4) — both write
   `selectedInteractiveFilterIndex`. Options:
   - **(a) Unify:** drive the variant purely through the interactive-filter's `searchParamKey` page var
     (the county-template mechanism), and drop the separate `f_` param. Cleanest / single-owner, but
     changes the URL shape and needs each interactive symbology to have a `searchParamKey` — **and the
     bridge is single-`activeSym` today (§5), so this needs the multi-symbology bridge fix first.**
   - **(b) Keep `f_<symId>` as a distinct map-owned page variable** (decision B), route it through
     `updatePageStateFilters` like `layers`, BC URL shape — but the two paths still both write the field,
     so pick ONE writer (the share path) and make the page-filter sync defer, or namespace them.
3. **Multi-symbology page-state is genuinely under-built** (§5). The share-state migration should NOT
   quietly depend on the single-`activeSym` bridge; decide whether to (i) scope the migration to
   visibility (`layers`) + a BC `f_` pass now, and (ii) treat "multi-symbology interactive-filter ↔
   page-variable binding" as its own follow-up.
4. Keep the established consumer/producer paths (§3) **exactly as-is** — the migration only removes the
   `useSearchParams`/`setSearchParams` share effects (§4) and re-expresses them through page variables.

## Open question for the owner (drives the design)
For `f_<symId>` (interactive-filter variant): do we (a) **unify** it with the existing interactive-filter
`searchParamKey` page-variable binding (single owner, but needs the multi-symbology bridge fixed), or
(b) keep it a **separate map-owned page variable** with a BC `f_` URL shape and make the two writers
non-conflicting? And is fixing the single-`activeSym` interactive-filter bridge in scope now, or a
follow-up?
