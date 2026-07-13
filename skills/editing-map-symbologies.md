# Editing & updating map symbologies (headless)

**Outcome:** read, restyle, extend, and verify DaMa **symbologies** — the JSON objects that drive
every DMS map (mapeditor, the `Map` section incl. Layer Library mode, legacy `Map: Dama Map`) —
without the editor UI. Covers the data model, the MapLibre style-spec surface that IS most of a
symbology, the Freight Atlas style system, and safe write paths.

Architecture background: `src/dms/planning/research/map-stack-architecture.md`. Worked consumer:
the Freight Atlas map (`planning/transportny/tasks/current/freight-atlas-symbology-restyle.md` in
the workspace hub).

## 1. Where symbologies live (TWO homes — know which you're editing)

1. **The catalog** — mapeditor pattern items: DMS `data_items` rows, type
   `"<patternInstance>|symbology"` (e.g. `map_editor_test|symbology`), `data.symbology` holds the
   JSON. Edit via CLI `dms raw update <id> --data '{"symbology": …}'` (or falcor
   `["dms","data","edit"]` — what the editor's Save does). This is the source of truth authors see
   in the mapeditor.
2. **Embedded copies** — every `Map` / `Map: Dama Map` **section** embeds full copies under
   `element['element-data'].symbologies[id]`. Rendering reads ONLY the copy. Edit via CLI
   read-modify-write on the section (component) row: parse `element-data`, mutate, re-stringify,
   `dms raw update <sectionId> --data <file>`.

**Drift is by design** — copies don't auto-update. The Map settings "Refresh" action re-fetches a
catalog symbology and **merges** it over the copy preserving author config (visibility, filter
selections, searchParam keys — `map/settings/symbologySelector.jsx:mergeSymbologyPreservingUserConfig`).
So: restyle the CATALOG item when the style should flow everywhere (sections pick it up on
Refresh/re-add); restyle the EMBEDDED copy when the change is page-specific or must ship now.
For the Freight Atlas both were updated together.

## 2. Anatomy — what you may touch

```
symbologies[id] = { name, isVisible, description, categories, id,
                    symbology: { activeLayer, layers: { [layerId]: LAYER } } }
```
Per LAYER (authoritative reader: `mapeditor/MapEditor/stateUtils.jsx:extractState`):

| Field | Role | Edit? |
|---|---|---|
| `layers[]` | **the real MapLibre style layers** (see §3) | ✅ the main thing you restyle |
| `sources[]` | vector-tile sources (`…/dama-admin/{pgEnv}/tiles/{view_id}/…`); ids are `{tileSourceId}_{layerId}` | ⚠ never rewrite URLs by hand; only swap wholesale when repointing to a new view (update `view_id`+`source_id` too) |
| `type` | geometry family `fill \| line \| circle \| heatmap` | only with matching `layers[]` rebuild |
| `legend-data[]` | `{color,label}` rows the legend renders | ✅ MUST stay in sync with paint |
| `color-range`, `num-bins`, `bin-method`, `choroplethdata{breaks,max}` | choropleth config mirrors | ✅ keep consistent with the step expression |
| `categories{paint,legend}`, `color-set`, `num-categories`, `category-show-other` | categorical mirrors | ✅ keep consistent with the match expression |
| `interactive-filters[]` + `selectedInteractiveFilterIndex` | **full LAYER snapshots** — selecting one is flattened over the layer at runtime | ✅ restyle EVERY snapshot too, or the style reverts on switch |
| `order` | z-sort (desc) + panel order | ✅ |
| `isVisible` + every `layers[i].layout.visibility` | visibility pair — keep in sync | ✅ as a pair |
| `hover`, `hover-columns` | popup enable + fields | ✅ |
| `filter`, `filterMode`, `dynamic-filters`, `filter-group*`, `view-group*`, `join` | filter machinery (see the research doc §2) | edit knowingly |

**Canonical sub-layer structure** (`mapeditor/.../LayerManager/utils.jsx:getLayer`):
- `fill` / `line` → `layers = [ {id:"<lid>_case", type:"line", …casing}, {id:"<lid>", type:fill|line, …main} ]`
  → main paint at **`layers[1]`**, casing/stroke at **`layers[0]`**.
- `circle` / `heatmap` → single entry, paint at **`layers[0]`**.
Each sub-layer: `{id, type, source:"<tileSourceId>_<lid>", "source-layer", paint, layout}`.

## 3. MapLibre style spec — the part that matters here

Read it thoroughly: **https://maplibre.org/maplibre-style-spec/** (Layers + Expressions pages).
A symbology's `layers[]` entries ARE spec layer objects; anything the spec allows works.

Most-used paint per type (all data-driven-capable unless noted):
- **line**: `line-color`, `line-width`, `line-opacity`, `line-dasharray` (not data-driven),
  `line-gap-width`, `line-blur`; layout `line-cap`/`line-join` (`round` for smooth networks).
- **fill**: `fill-color`, `fill-opacity`, `fill-outline-color` (1px max — use the `_case` line
  sub-layer for real outlines).
- **circle**: `circle-radius`, `circle-color`, `circle-opacity`, `circle-stroke-color`,
  `circle-stroke-width`, `circle-stroke-opacity`.
- **heatmap**: `heatmap-radius`, `heatmap-weight`, `heatmap-intensity`,
  `heatmap-color` (NOT data-driven; input is `["heatmap-density"]`), `heatmap-opacity`.

Expressions (JSON arrays, operator first):
- `["step", input, out0, stop1, out1, …]` — choropleth bins. The editor emits
  `["case",["==",["get",col],null],"<no-data>",["step",["to-number",["get",col]],c0,b1,c1,…]]` —
  **keep the `to-number` + null-guard**: tile properties often arrive as strings.
- `["match", input, v1, out1, …, fallback]` — categorical paint (editor: `categoryPaint()`).
- `["interpolate", ["linear"]|["exponential",b], ["zoom"], z1, v1, z2, v2, …]` — zoom-scaled
  widths/radii. ⚠ In paint/layout, `["zoom"]` is only legal as the input of a **top-level**
  `interpolate`/`step` — you can nest a data expression in its outputs, not the reverse.
- `["get", prop]`, `["case", cond, out, …, fallback]`, `["coalesce", …]`, `["literal", […]]`.

## 4. The Freight Atlas style system (designed 2026-07; use for all atlas layers)

Derived from the 2024 plan cartography × the transportNY design system × mapeditor layer types.
Implementation: `dms-template/scratchpad/fa-symbology-restyle/fa_styles.mjs` (import it — don't
retype hexes).

**Tokens**
- `SEQ9` sequential (volume/tonnage/value — the plan's signature ramp):
  `#f7e76e #f5d45a #f3c048 #f0ac38 #ec962a #e77e1f #e1631a #d9451b #ce141f` (use first N of 5/7/9;
  no-data `#ccc`).
- `COND3/COND5` condition (good→poor): `#518646 #f8dea0 #d74528` / `#518646 #a6b26e #f8dea0 #e8995b #d74528`.
- `DIVERGE` change ±: increase `#2E8B57`, decrease `#D6453B` (plan Figs 66-69).
- `CAT8` categorical: `#1F3F8F #E5A646 #37576B #6bb8c7 #ac72a5 #D6453B #10B981 #CA8A04`.
- Network inks: primary `#1F3F8F` (casing `#0F2D4D`), secondary `#37576B`, muted `#94a3b8`,
  highlight `#CA8A04`/`#FACC15`; boundaries `#64748b` dashed `[2,2]`.
- Heat gradient (density): `rgba(59,130,246,0)` → `#93c5fd` → `#fde047` → `#f97316` → `#dc2626`.

**Recipes** (exact paint in `fa_styles.mjs`)
- `boundary_fill` — near-transparent fill (`fill-opacity` .04-.08) + dashed `_case` line; hue per
  geography (counties slate, REDC gold, MPOs plum, tracts light).
- `network_line_primary/secondary/muted` — solid line + darker casing (`_case` width = main+1.5),
  `line-cap/join: round`, width `interpolate zoom [5,1.2] [10,2.5] [14,5]` (secondary ~70%).
- `class_line` / `class_circle` — `match` on the class column over `CAT8`; legend-data mirrors the
  match pairs 1:1.
- `ramp_line` / `ramp_fill` — `step` over `SEQ9[:bins]` w/ null-guard; width for ramp lines can
  also step with the same breaks (thicker = more).
- `facility_circle` — radius `interpolate zoom [5,2.5] [9,5] [13,9]`, white stroke 1.25, color per
  category or single ink.
- `density_heat` — heatmap w/ radius `interpolate zoom [5,8] [10,20] [14,40]`, the heat gradient,
  fade `heatmap-opacity` at high zoom (pair with a circle layer if features must be clickable).
- `change_line` — color `case` on sign of the change column (`DIVERGE`), width `step` on `abs`.

## 5. Editing recipes

**Restyle a simple layer** — set paint at the right sub-layer index (§2), update `legend-data`
colors/labels to match, and repeat for every `interactive-filters[i]` snapshot.

**Re-ramp a choropleth** — get breaks server-side (never eyeball):
`GET {API}/dama-admin/{pgEnv} falcor route ["uda",pgEnv,"viewsById",viewId,"colorDomain",JSON({column,numbins,method,…filters})]`
(ckmeans|quantile|equalInterval|stddev — `dms-server uda.colorDomain.controller.js`); then write
the step expression + `color-range` + `choroplethdata{breaks,max}` + `legend-data` (labels from
consecutive break pairs, formatted) together.

**Repoint a layer to a new view/source** (e.g. deprecated → successor): fetch the new view's
`metadata.tiles` from `data_manager.views`; replace `sources[]` (re-suffix ids `_${layerId}`),
`view_id`, `source_id`, and each sub-layer's `source`/`source-layer`; verify the styled columns
exist in the new tiles (`?cols=` is appended at runtime from `data-column`/filters).

**New symbology from scratch** — follow the editor's canonical create path
(`SourceSelector.addLayer` + `getLayer`): one wrapper + one LAYER, `sources[]` from the view's
`metadata.tiles.sources` (suffix `_${layerId}`), sub-layers per §2, `order` unique, everything
hidden until toggled. Then add to the Map section's `symbologies{}` + a `tabs[].rows[]` entry.

## 6. Verify (always, headless)

Playwright against the dev site: load the page, toggle the layer on (Layer Library checkbox),
assert (a) tile requests for the view return 200, (b) no console/maplibre errors ("layer not
found", paint validation warnings), (c) screenshot the render + legend and LOOK at it, (d) switch
each interactive filter and re-check. Paint validation failures are silent-ish — a wrong property
name simply doesn't render; the screenshot is the truth.

## 7. Gotchas

- **legend-data is dumb** — nothing recomputes it from paint; every paint change needs a matching
  legend edit (LegendPanel renders legend-data, not the expression).
- **interactive-filters snapshots** — each is a FULL layer copy; restyling only the top layer
  reverts styling when the user switches filters. Loop the snapshots.
- **visibility is a pair** — `isVisible` (wrapper) AND `layers[i].layout.visibility`; the Layer
  Library toggle + flatten effect keep them in sync, but hand edits must too.
- **`_case` ordering assumption** — editors and legends read fill/line main paint at `layers[1]`;
  don't reorder sub-layers.
- **Strings in tiles** — numeric columns often arrive as strings; keep `["to-number",["get",col]]`
  in step/interpolate inputs (the editor's emitted paint already does).
- **`line-dasharray` is not data-driven** — per-class dashes need separate sub-layers or filters.
- **Don't hand-edit `?cols=`/`join=`** on tile URLs — appended at runtime from layer config.
- **Embedded vs catalog** (§1) — know which you changed; sections show catalog changes only after
  Refresh/re-add. Keep both in sync for shared layers.
- **jsonb writes** — when scripting SQL against `data_manager`, only `UPDATE data_manager.sources/views
  SET metadata/categories…` mirrors of what UDA routes do; NEVER hand-write rows/tables
  (orphan hazard — see `uploading-gis-and-tabular-datasets.md`).

## Source of truth (code)
- Model + editor writers: `patterns/mapeditor/MapEditor/{index.jsx,stateUtils.jsx,components/LayerManager/utils.jsx,components/LayerEditor/{typeConfigs,Controls,datamaps}}`.
- Renderers: `SymbologyViewLayer.jsx` (mapeditor / map / map_dama copies) — imperative
  add/setPaint/setLayout/setFilter from these fields.
- Breaks: `dms-server/src/routes/uda/uda.colorDomain.controller.js`.
- Style spec: https://maplibre.org/maplibre-style-spec/ (layers, expressions).

## Gotcha: static layer filters

`layer.filter` is NOT `{column: [values]}` — each entry is `{ column: { operator: "==",
value: [...] } }` (operators: `==`, `!=`, `between`, `>`,`>=`,`<`,`<=`). The runtime compiles
`==` to a maplibre `["in", ["get", col], ["literal", values]]` **without type coercion**, so
values must match the tile property's type — for numeric columns include both forms
(`value: [31, "31"]`) to be safe. The tile request auto-appends filter columns to `?cols=`.
Tiles carry NO attributes unless requested via `?cols=` (bake the data column into the saved
source URL like the mapeditor does: `.../t.pbf?cols=<data-column>`).

Worked example (NYS Thruway = HPMS toll-authority segments):
`filter: { ownership: { operator: "==", value: [31, "31"] } }` over view 2130.
