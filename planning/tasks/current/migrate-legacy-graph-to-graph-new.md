# Migrate legacy `Graph` sections onto the new `graph_new` (AVL Graph) component

**STATUS: IMPLEMENTED, with three post-ship fixes.** All files changed as planned, `npm run build` passes. One design deviation from the original plan (see below). Live-render verification (the Testing Checklist) still pending, except the QuickControls/Measure-menu item below, now confirmed via fix #3.

**Post-ship bug + fix #1:** after shipping, the user manually changed `graph_new/config.jsx`'s `.name` back to `'Graph'` (to control the section-menu label) — which broke `migrateToV2.js`'s `compName === 'AVL Graph'` gate, silently disabling `migrateGraphState` entirely (confirmed live: a real section's columns kept their `xAxis`/`yAxis` booleans with no `target` ever set). Root cause: gating the migration on `.name` was wrong from the start, since `.name` is explicitly the user-editable display label (this incident is proof it gets renamed), not a stable identity. **Fixed** by threading `component?.type` (`'avlGraph'`, the actual stable internal id) through `migrateToV2`'s new 4th parameter `compType`, from all 3 call sites in `dataWrapper/index.jsx` plus `api/preloadSectionData.js`'s SSR/loader-phase preload path (mapped from the raw `elementType` string there, since it doesn't have a resolved `component` object). Verified against the user's actual reported section (ran `migrateGraphState` directly on its columns/display) — `target`/`group`/`margin`/`yAxis.format`/`title.justify` all now come out correct.

**Post-ship bug + fix #2:** with `.name` now `'Graph'`, `src/themes/transportny/theme.js`/`themev2.js`'s `sectionMenuExtensions`/`sectionHeaderExtensions` (also keyed on `.name`) stopped matching — they registered `npmrdsMeasureMenu`/`npmrdsQuickControls` under the literal key `"AVL Graph"`. Since the whole point of this task is that `graph_new` **is** "the Graph" going forward, the correct fix (confirmed with the user) is to rename these two theme-side registrations from `"AVL Graph"` to `"Graph"` to match, rather than reverting `.name`. Done in both `theme.js` and `themev2.js` (`sectionMenuExtensions`/`sectionHeaderExtensions` blocks). Grepped the rest of `src/themes/transportny` for other `'AVL Graph'` references — the remaining ones are either comments or `useAddGraphSection.js`'s `AVL_GRAPH_ELEMENT_TYPE` constant, which checks the registry *element-type* key (still `"AVL Graph"`, unchanged and still valid) rather than `.name` — not affected, left as-is.

**Post-ship bug + fix #3, found 2026-08-05 (Ryan reported the QuickControls header pills missing on a real report; root-caused and fixed same session):** fix #2's rename to `"Graph"` was itself incomplete — it didn't account for `ComponentRegistry/index.jsx`'s **`"AVL Graph"` registry entry** (`Graph: GraphNew` plus a *second* entry, `"AVL Graph": { ...GraphNew, name: 'AVL Graph', hideInSelector: true }`, kept so already-persisted `element-type: "AVL Graph"` sections still resolve). That second entry explicitly force-overrides `.name` back to the literal string `'AVL Graph'` for every section whose `element-type` is `"AVL Graph"` — which is virtually every real report graph in the system: the Report Page template's own starter graph, every section RRL's "+ Add Graph" modal creates (`useAddGraphSection.js`'s `AVL_GRAPH_ELEMENT_TYPE` constant), and every already-converted report from the old-reports pipeline. Only sections still persisted under the bare legacy `element-type: "Graph"` (rare/none in practice) actually resolve `.name === 'Graph'` and matched fix #2's registration. Net effect: `getSectionMenuExtensions('AVL Graph')`/`getSectionHeaderExtensions('AVL Graph')` (`sectionMenu.jsx`/`section.jsx`) returned nothing for nearly all real graphs — **both** the Settings-drawer "Measure" item-group (`npmrdsMeasureMenu`) **and** the header QuickControls pills (`npmrdsQuickControls`) silently stopped rendering, exactly the regression this task's own Testing Checklist had flagged as an unconfirmed risk and never spot-checked. **Fixed** by registering both keys — `"Graph"` and `"AVL Graph"` — in `sectionMenuExtensions` and `sectionHeaderExtensions` in both `theme.js` and `themev2.js`, so either resolved `.name` matches. **Live-verified** via Chrome automation against `converted_reports/claude_scratch_tag_browser`: opened an AVL Graph section's edit mode, confirmed the "Travel Time (min)" / "Plain" pills now render in the card header, and confirmed the Measure pill's dropdown lists the full vocabulary (Speed, Truck Speed, Travel Time, Hours of Delay, CO2 Emissions ×2 variants).

## Design deviation: `graph_new/config.jsx`'s `.name` field was NOT renamed

The original plan called for renaming `graph_new/config.jsx`'s `"name"` from `'AVL Graph'` to `'Graph'`, so `sectionMenu.jsx`'s three `currentComponent?.name === 'Graph'`-style checks would apply automatically. **This was reverted after discovering a real conflict:** `getSectionMenuExtensions(currentComponent?.name)` (`sectionMenu.jsx:650`) and `getSectionHeaderExtensions(component?.name)` (`section.jsx:248,475`) are *also* keyed off this exact same `.name` field, and `src/themes/transportny/theme.js`/`themev2.js` already register live, shipped features under the literal key `"AVL Graph"` (`npmrdsMeasureMenu`, `npmrdsQuickControls` — used by `ReportRouteList`/`MeasurePicker`/`QuickControls`). Renaming `.name` would have silently broken those two features for every AVL Graph section in that theme.

**Actual fix:** left `graph_new/config.jsx`'s `"name": 'AVL Graph'` unchanged, and instead directly added `'AVL Graph'` to the three `sectionMenu.jsx` array-literal checks (lines ~680, ~988) that previously only listed `'Graph'`. Same functional outcome (Pivot menu + view-mode type-switch now apply to graph_new sections), zero risk to the theme-side extension registries, and no theme files touched at all — stays entirely within `src/dms`. `migrateToV2.js`'s hook is gated on `compName === 'AVL Graph'` (not `'Graph'`) to match.

## Objective

Make every section currently persisted with `element-type: "Graph"` (the legacy graph implementation) render through the current `graph_new` implementation automatically, going forward — with no bulk data migration. Old sections should render correctly (and pick up the new component's features and its recent double-aggregation fix) the moment this ships; the small `element-data` reshape they need happens lazily at render time, the same way `Card`'s legacy layout data is already lazily upgraded today.

## Scope

**In scope:**
- Repointing `ComponentRegistry` so the `"Graph"` element-type resolves to `graph_new` instead of the legacy implementation.
- Keeping the legacy implementation available under a new registry key (not deleted — no live element-type references it, but nothing forces its removal either).
- Keeping the existing `"AVL Graph"` element-type working unchanged for sections already saved under it.
- A lazy, idempotent `element-data` reshape (old column/display shape → new) invoked from `migrateToV2.js`, the established hook point for this class of problem.
- Menu-level side effects this causes in `sectionMenu.jsx` (see below) — need to be resolved, not just noted.

**Out of scope:**
- Any changes to `section.jsx` — verified it only does a string-keyed `RegisteredComponents[element-type]` lookup and never special-cases "Graph" by name; no changes needed there.
- Bulk-rewriting any persisted `element-data` in the database. This is a render-time shim only.
- `graphType: 'ScatterPlot'` support — old Graph's ScatterPlot has no equivalent in `graph_new` (its type list is Bar/Line/Pie/Grid/Sunburst/Treemap only). **Decision (asked directly): leave `graphType: 'ScatterPlot'` untouched** — such a section renders the new component's "AvlGraph Error: Unknown Graph Type: ScatterPlot" state until an author manually picks a real chart type, rather than silently substituting a different chart. No special-casing needed in the migration function beyond simply not touching `graphType`.

## Current State

Two graph implementations exist side by side in `ComponentRegistry` (`patterns/page/components/sections/components/ComponentRegistry/index.jsx`):

```js
import Graph from "./graph/config"
import GraphNew from "./graph_new/config"

const ComponentRegistry = {
    ..., Graph, ...,
    "AVL Graph": GraphNew,
}
```

- **`Graph`** (`ComponentRegistry/graph/config.jsx`, `name: 'Graph'`, `type: 'Graph'`) — legacy. Column roles are three independent booleans (`xAxis`/`yAxis`/`categorize`) toggled via dedicated `onChange` handlers in the config itself (lines 83-104) that already keep `column.group`/`column.show`/`fn` defaults in sync — this logic doesn't need to be reverse-engineered, just read off directly when writing the column converter. Its own `display` shape uses `margins.{marginTop,marginRight,marginBottom,marginLeft}`, `yAxis.tickFormat` (values like `''|'Integer'|'abbreviate'|'comma'`, matched against `dataWrapper/utils/utils.jsx`'s `formatFunctions` — note `'Integer'` never actually matched any key there, so it silently rendered unformatted; this was already a no-op bug in the old system), `title.{title,position,fontSize,fontWeight}` (flat), and no `margin`/`format`/`target`/`group`(exposed)/`interpolation`/etc. Its own rendering (`ui/components/graph/`) does the reshape/aggregation centrally in `ui/components/graph/GraphComponent.jsx`'s `groupedData` memo, with `count: d3sum` (sums raw values — only correct if the data is already server-aggregated, which the old pipeline didn't guarantee either).
- **`GraphNew`** (`ComponentRegistry/graph_new/config.jsx`, `name: 'AVL Graph'`, `type: 'avlGraph'`) — current. Column roles are a single `target` field (`xAxis`/`yAxis`/`categorize`/`index`/`slice`/`rectangle`/`color`, vocabulary varies by chart type). `display.margin.{top,right,bottom,left}`, `display.yAxis.format` (lowercase `ValueFormats` values: `identity`/`integer`/`float1`/`float2`/`millions`/`millions2`/`billions`/`billions2`/`fnum`/`fnum2`/`epoch_time` — see `ui/components/graph_new/utils.js:390-424`). `GraphTitle` reads `title.justify` (a full Tailwind class like `'justify-start'`), not `title.position`. Its rendering does the reshape per chart type (`ui/components/graph_new/components/{Bar,Line,Grid,Pie}Graph.jsx`), and — as of this session's earlier fix — grouping/aggregation is now server-side only (`controls_utils.js`'s `applyColumnUpdate` sets `group` in sync with dimension-role `target` values; `getAggFunc` in `graph_new/components/utils.js` always returns `first`, i.e. reads the precomputed value rather than re-aggregating).

Both are plain `useDataSource: true, useDataWrapper: true` components sharing the exact same `buildUdaConfig`/`getData` pipeline — `externalSource`, `filters`, `join`, `data`, `dataSourceId` are identical shapes on both sides, no conversion needed there.

`sectionMenu.jsx` has three checks keyed on the **resolved component's `.name` field** (not the registry key):
- Line ~680: `cdn: () => isEdit && ['Spreadsheet', 'Graph'].includes(currentComponent?.name) && ...` — gates whether the Pivot menu appears.
- Line ~988: `(isEdit || (['Spreadsheet', 'Card', 'Graph'].includes(currentComponent?.name) && ['Spreadsheet', 'Card', 'Graph'].includes(k)))` — restricts which component types a section can be converted between while in View mode.
- Line ~1003: `` `${currentComponent?.name} Settings` `` — the Settings drawer's section header label.

The "Type" (convert section to a different component) picker (`sectionMenu.jsx:985-997`) enumerates `Object.keys(RegisteredComponents)` directly, filtered by `!RegisteredComponents[k].hideInSelector` (line 986) — an existing flag, currently unused by any registry entry.

## Proposed Changes

### 1. `ComponentRegistry/index.jsx` — repoint the registry keys

```js
import LegacyGraph from "./graph/config"   // renamed import (file itself untouched)
...
const ComponentRegistry = {
    lexical, Card, Spreadsheet,
    legacy_graph: LegacyGraph,   // kept, unreferenced by any live element-type
    Filter: FilterComponent,
    ...
    Map,
    "Map: Dama Map": MapDama,
    Graph: GraphNew,             // "Graph" now resolves to the new implementation
    "AVL Graph": { ...GraphNew, hideInSelector: true },  // kept for sections already saved under it; hidden from the "Type" picker so it doesn't show as a duplicate "Graph" entry alongside the Graph key
}
```

### 2. `ComponentRegistry/graph_new/config.jsx` — `.name` left as `'AVL Graph'`

~~Rename `.name` to `'Graph'`~~ — **reverted, see Design Deviation above.** `.name` stays `'AVL Graph'` so the theme-side `sectionMenuExtensions`/`sectionHeaderExtensions` registrations (keyed on this exact field) keep resolving. `sectionMenu.jsx`'s two array-literal checks got `'AVL Graph'` added directly instead (see #4 below). Accepted side effect either way: Pivot mode (already a generic dataWrapper feature under the hood, not truly Graph-specific) becomes available on the new Graph, same as it already is on the old one.

### 3. New file: `ui/components/graph_new/Graph.migrate.js`

Mirrors `ui/components/Card.migrate.js` exactly: idempotent (guarded on new-shape keys already present → no-op), pure function, no React. Two entry points, `migrateGraphColumns` and `migrateGraphDisplay`, combined in `migrateGraphState`.

```js
const SORT_MAP = { 'asc nulls last': 'asc', 'desc nulls last': 'desc' };

// old formatFn / yAxis.tickFormat value -> new ValueFormats value (best-effort;
// 'Integer' never matched anything in the old formatFunctions map either, so
// mapping it to 'integer' is a strict improvement, not a behavior regression)
const FORMAT_MAP = {
    '': undefined, ' ': undefined,
    'Integer': 'integer',
    'comma': 'fnum',
    'abbreviate': 'fnum',
};

export function migrateGraphColumns(columns) {
    const hasNew = (columns || []).some(c => c.target !== undefined);
    if (hasNew) return columns;
    const hasLegacy = (columns || []).some(c => c.xAxis || c.yAxis || c.categorize);
    if (!hasLegacy) return columns;

    return (columns || []).map(c => ({
        ...c,
        target: c.xAxis ? 'xAxis' : c.yAxis ? 'yAxis' : c.categorize ? 'categorize' : undefined,
        group: !!(c.xAxis || c.categorize),
        sort: SORT_MAP[c.sort],
        formatFn: undefined, // consolidated into display.{x,y}Axis.format below
    }));
}

export function migrateGraphDisplay(display, columns) {
    if (!display) return display;
    const hasNew = display.margin !== undefined;
    if (hasNew) return display;
    const hasLegacy = display.margins !== undefined || display.yAxis?.tickFormat !== undefined;
    if (!hasLegacy) return display;

    const out = { ...display };

    if (display.margins) {
        out.margin = {
            top: display.margins.marginTop, right: display.margins.marginRight,
            bottom: display.margins.marginBottom, left: display.margins.marginLeft,
        };
        delete out.margins;
    }

    if (display.yAxis?.tickFormat !== undefined) {
        out.yAxis = { ...display.yAxis, format: FORMAT_MAP[display.yAxis.tickFormat], tickFormat: undefined };
    }

    if (display.title?.position) {
        out.title = { ...display.title, justify: `justify-${display.title.position}`, position: undefined };
    }

    // Collapse per-column formatFn (old) onto the single yAxis.format (new) when
    // the axis format wasn't already set above and at least one yAxis column
    // carried a formatFn — first non-empty value wins; differing values across
    // multiple yAxis columns are lossy by design (new has one format per axis).
    const yAxisFormatFn = (columns || []).find(c => c.yAxis && c.formatFn)?.formatFn;
    if (yAxisFormatFn !== undefined && out.yAxis?.format === undefined) {
        out.yAxis = { ...(out.yAxis || {}), format: FORMAT_MAP[yAxisFormatFn] };
    }

    // graphType, colors, height/width, legend.{show,label}, tooltip.show,
    // hideIfNull, useCustomXDomain/xDomain, fetchMode, pageSize: identical
    // shape both sides — no transform, passed through by the initial `{...display}` spread.
    // padding, darkMode, showScaleFilter, isLog, tooltip.fontSize: dropped, no
    // equivalent in the new renderer.
    // graphType is passed through UNCHANGED even for values with no new
    // equivalent (e.g. legacy 'ScatterPlot') — see Scope decision above.

    return out;
}

export function migrateGraphState(state) {
    if (!state) return state;
    return {
        ...state,
        columns: migrateGraphColumns(state.columns),
        display: migrateGraphDisplay(state.display, state.columns),
    };
}
```

### 4. `sectionMenu.jsx` — add `'AVL Graph'` to the two name checks (replaces original #2/#4 plan)

Line ~680 (Pivot menu gate) and line ~988 (view-mode type-switch restriction, the `currentComponent?.name` side only — the `k` side stays `['Spreadsheet','Card','Graph']` since `"AVL Graph"` is hidden from the picker anyway): `['Spreadsheet', 'Graph']` → `['Spreadsheet', 'Graph', 'AVL Graph']`. Line ~1003 (`${currentComponent?.name} Settings`) needs no change — it already renders whatever `.name` is.

### 5. `dataWrapper/migrateToV2.js` — wire the reshape in

Same pattern as the existing `Card` hook:

```js
import { migrateGraphState } from '../../../../../../ui/components/graph_new/Graph.migrate';
...
if (compName === 'Card') {
    migrated = migrateCardState(migrated);
}
if (compName === 'AVL Graph') {
    migrated = migrateGraphState(migrated);
}
```

`compName` reads `'AVL Graph'` for every section resolved through `GraphNew` (both registry keys share the same `.name`) — the idempotency guards inside `migrateGraphColumns`/`migrateGraphDisplay` make it a no-op for genuinely-new sections.

## Files Requiring Changes

- [x] `patterns/page/components/sections/components/ComponentRegistry/index.jsx` — registry key rename (`Graph`→`legacy_graph` import) + `Graph`/`"AVL Graph"` both pointing at `GraphNew` + `hideInSelector` on the `"AVL Graph"` entry.
- [x] `patterns/page/components/sections/components/ComponentRegistry/graph_new/config.jsx` — comment added explaining why `.name` stays `'AVL Graph'` (see Design Deviation); no functional change.
- [x] `ui/components/graph_new/Graph.migrate.js` — **new file**, created.
- [x] `patterns/page/components/sections/components/dataWrapper/migrateToV2.js` — import + `if (compName === 'AVL Graph')` block added.
- [x] `patterns/page/components/sections/sectionMenu.jsx` — `'AVL Graph'` added to the two `currentComponent?.name` checks (lines ~680, ~988).
- `ComponentRegistry/graph/config.jsx` (legacy) — untouched, just re-imported under a new name.

## Testing Checklist

- [x] `npm run build` — passes, no new errors (same pre-existing CSS/chunk-size warnings as before this change).
- [ ] Load an existing section persisted with `element-type: "Graph"` in the page editor (edit mode):
  - [ ] Columns menu shows the new Target/Fn/Group controls (`ColumnManager.jsx`), not the old X/Y/Categorize toggles.
  - [ ] Chart actually renders data — this is the regression to watch closely, since a bad `target`/`group` derivation silently empties `dataFromProps` in `BarGraph.jsx`/etc. rather than throwing.
  - [ ] Axis labels/margins/title render sensibly (not the raw untranslated old `margins`/`tickFormat` values sitting unused).
- [ ] Same section in view mode — renders correctly for a non-editing viewer too.
- [ ] Edit and save that section once, then reload the page and confirm it **still** renders correctly on the second load — this verifies `element-type` persisted as `"Graph"` (`GraphNew`'s config) through the normal `onChange` plumbing, rather than silently reverting to a mismatched old-type/new-shape combination.
- [ ] Load a section already saved under `element-type: "AVL Graph"` (if one exists on a test site) and confirm it's unaffected — exercises `migrateGraphDisplay`'s idempotency guard (`display.margin !== undefined` early return).
- [ ] Open the section's "Type" (convert component) menu and confirm only one "Graph" entry appears, not two.
- [ ] A section with `graphType: 'ScatterPlot'` (if one exists) shows the "Unknown Graph Type" state rather than crashing or silently becoming a bar chart.
- [ ] Pivot menu now appears for Graph-typed sections (accepted side effect of the `sectionMenu.jsx` check update) — confirm it doesn't break anything for a plain (non-pivot) Graph section that never touches it.
- [x] On the transportny theme specifically: confirm `npmrdsMeasureMenu`/`npmrdsQuickControls` still appear on AVL Graph sections — **this WAS broken, found and fixed 2026-08-05, see "Post-ship bug + fix #3" above.** Live-verified after the fix.
