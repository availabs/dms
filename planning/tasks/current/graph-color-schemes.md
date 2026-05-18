# Task: Graph color-scheme selector — Plot/d3 color sets in `graph_new` context menu

## Objective

Bring Observable Plot's full default color-scheme catalog into the new
custom-graph component (`graph_new`), and expose scheme selection from the
section's context menu. Authors should be able to pick a scheme (and reverse
it) from the same toolbar that holds Graph / X Axis / Y Axis / Legend / etc.,
instead of editing a static color array.

The new graph already replaced Plot, but we want its **default color sets**
to match what Plot shipped so existing visual conventions and any
Plot-influenced design decisions carry over.

## Scope

In:
- Extend `graph_new`'s color palette source to include every Plot-shipped
  scheme (categorical / diverging / sequential single-hue / sequential
  multi-hue / cyclical).
- Persist the active scheme as a name (+ reverse flag) so re-render picks the
  right size at draw time.
- Add a `Colors` control group to `graph_new/config.jsx` with a scheme picker
  and a reverse toggle.
- Backward compat: existing sections that stored a literal palette array
  (`{type: 'palette', value: [...]}`) keep rendering unchanged.

Out:
- `graph_new`'s sibling `graph/` (old/legacy) component. If they share
  helpers via `colorRange.js`/`utils.js`, the change is additive and won't
  break it, but no new UX is added there.
- Map / map_dama color domains (they already have their own scheme picker
  in `ui/components/graph_new/colorRange.js` and the symbology layer).
- Per-series color overrides (already handled by spectral/series UI
  elsewhere and out of scope here).

## Current State

### Where colors live

| File | Role |
|---|---|
| `packages/dms/src/ui/components/graph_new/utils.js` | Exports `mapColors` — a hand-curated map of `{paletteName: {size: [hexes]}}`. Contains `seq1..seq12`, `div1..div7`, and a `schemeGroups` index (`sequential`, `singlehue`, `diverging`). No Plot/d3 schemes. |
| `packages/dms/src/ui/components/graph_new/colorRange.js` | `getColorRange(size, name, reverse=false)` — `get(mapColors, [name, size], []).slice()`, optional reverse. |
| `packages/dms/src/ui/components/graph_new/GraphComponent.jsx:53-57` | Reads `graphFormat.colors?.value` when `graphFormat.colors?.type === "palette"`. Hardcoded shape. |
| `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/graph_new/config.jsx:6` | `const DefaultPalette = getColorRange(20, "div7");` — bakes a 20-color array into `defaultState.display.colors.value` at module load. |

### What's exposed in the context menu today

`controls` in `graph_new/config.jsx` has groups: `graph`, `xAxis`, `yAxis`,
`margin`, `legend`, `legendForGridGraph`, `tooltip`, `tooltipForLineGraph`,
`layout`, `data`. **There is no `colors` group.** The color palette is
frozen by the `DefaultPalette` baked in at module load.

### What Plot ships

Source: `node_modules/@observablehq/plot/src/scales/schemes.js`. Plot defers
to `d3`'s scheme exports; the categorization Plot itself uses is:

- **Categorical** (11): `accent`, `category10`, `dark2`, `observable10`,
  `paired`, `pastel1`, `pastel2`, `set1`, `set2`, `set3`, `tableau10`.
  Plot's default for the `color` channel in categorical contexts is
  `observable10`.
- **Diverging** (9 + 2 reversed): `brbg`, `prgn`, `piyg`, `puor`, `rdbu`,
  `rdgy`, `rdylbu`, `rdylgn`, `spectral`; reversed variants `burd`,
  `buylrd`. Plot's diverging default is `rdbu`.
- **Sequential single-hue** (6): `blues`, `greens`, `greys`, `oranges`,
  `purples`, `reds`.
- **Sequential multi-hue** (21): `turbo`, `viridis`, `magma`, `inferno`,
  `plasma`, `cividis`, `cubehelix`, `warm`, `cool`, `bugn`, `bupu`, `gnbu`,
  `orrd`, `pubu`, `pubugn`, `purd`, `rdpu`, `ylgn`, `ylgnbu`, `ylorbr`,
  `ylorrd`. Plot's sequential default is `turbo`.
- **Cyclical** (2): `rainbow`, `sinebow`.

Plot ships size-3..11 swatches for categorical/diverging and falls back to
`d3.quantize(interpolateFoo, n)` for larger sizes. Helpers `scheme9` /
`scheme11` / `scheme11r` / `schemei` / `schemeicyclical` in
`schemes.js:153-184` implement the fallback.

`d3-scale-chromatic` (which Plot depends on; `d3-array`'s `quantize` is in
`d3-array`) already ships transitively via `d3` in
`packages/dms/node_modules`. Verify before relying on it.

## Proposed Changes

### 1. New module: `plotSchemes.js`

Add `packages/dms/src/ui/components/graph_new/plotSchemes.js` — a pure data
module that mirrors `schemes.js` from Plot but using only the d3 exports
the project already pulls in (don't depend on `@observablehq/plot`; the
whole point is to drop it).

Exports:

```js
// One Map keyed by lowercased scheme name → resolver function
//   resolver({ length: n }) → string[]   (length === n)
// Plus the categorization the UI uses for the picker.

export const PLOT_SCHEME_CATEGORIES = [
  { id: 'categorical',  label: 'Categorical',           schemes: [...] },
  { id: 'sequential',   label: 'Sequential (multi-hue)', schemes: [...] },
  { id: 'singleHue',    label: 'Sequential (single-hue)', schemes: [...] },
  { id: 'diverging',    label: 'Diverging',             schemes: [...] },
  { id: 'cyclical',     label: 'Cyclical',              schemes: [...] },
];

export const PLOT_SCHEMES = new Map([
  // categorical
  ['accent',        scheme(schemeAccent)],
  ['observable10',  scheme(schemeObservable10)],
  // ...
  // diverging (use scheme11 with reverse-aware twin keys)
  ['brbg',          scheme11(schemeBrBG, interpolateBrBG)],
  ['burd',          scheme11r(schemeRdBu, interpolateRdBu)],
  // ...
  // sequential multi-hue (interpolator only)
  ['turbo',         schemei(interpolateTurbo)],
  // ...
]);

export function getPlotScheme(name, length) {
  const key = String(name).toLowerCase();
  const fn = PLOT_SCHEMES.get(key);
  if (!fn) return null;
  return fn({ length }).slice(0, length);
}
```

Copy the helpers from `schemes.js:153-184` verbatim. They're a tiny amount
of code, all using d3 primitives we already have.

### 2. Extend `colorRange.js`

Make `getColorRange` fall through to the Plot scheme catalog when the name
isn't in the local `mapColors`:

```js
import { get } from 'lodash-es';
import { mapColors } from './utils';
import { getPlotScheme } from './plotSchemes';

export const getColorRange = (size, name, reverse = false) => {
  // Local custom palettes (seq1..seq12, div1..div7) take precedence so
  // existing sites keep their identical colors.
  let range = get(mapColors, [name, size], null);
  if (!range) {
    range = getPlotScheme(name, size) || [];
  } else {
    range = range.slice();
  }
  if (reverse) range.reverse();
  return range;
};
```

### 3. Update `graph_new/config.jsx`

Default state — switch from a baked array to a named scheme. Keep the
shape backward-compatible.

```js
// Was:
// const DefaultPalette = getColorRange(20, "div7");
// colors: { type: "palette", value: [...DefaultPalette] }

// Now:
const DEFAULT_SCHEME = 'observable10';        // Plot's categorical default

// in graphOptions.colors:
colors: {
  type: 'scheme',
  name: DEFAULT_SCHEME,
  reverse: false,
}
```

Add a new `colors` block to `controls`, placed after `layout` and before
`data`:

```js
colors: {
    name: 'Colors',
    items: [
        { type: 'select',
          label: 'Color Set',
          key: 'colors.name',
          onClickGoBack: true,
          showValue: true,
          options: buildSchemeOptions(),
        },
        { type: 'toggle',
          label: 'Reverse',
          key: 'colors.reverse',
        },
    ],
},
```

Where `buildSchemeOptions()` flattens `PLOT_SCHEME_CATEGORIES` into
`{ label, value, group }`-shaped entries. **Check whether the existing
`select` control type supports option groups** (look at how `tickFormat`
uses `ValueFormats` for the existing pattern). If it doesn't,
either:
  - (a) render a labeled-with-prefix flat list (`"Categorical · observable10"`),
        or
  - (b) extend the `select` control to honor a `group` field on options.

Either is fine for v1 — pick (a) if (b) is more than a few lines.

The custom palettes from `mapColors` (`seq1..seq12`, `div1..div7`)
**should also appear in the picker** — they're the existing AVAIL palettes
and removing them would visually regress every published graph. Add a
`"Custom"` (or `"AVAIL"`) category at the top.

### 4. Resolve scheme at draw time in `GraphComponent.jsx:53-57`

```js
const colors = React.useMemo(() => {
    const c = graphFormat.colors;
    if (!c) return [];
    if (c.type === 'scheme') {
        const n = Math.max(2, /* the count we need */);
        return getColorRange(n, c.name, c.reverse);
    }
    if (c.type === 'palette') {
        return c.value || [];
    }
    return [];
}, [graphFormat.colors, /* whatever determines the count */]);
```

The count question is the **one design decision worth thinking through**:

- For categorical/diverging graphs, the natural N is the number of series
  or distinct categorize-column values. `viewData` and the rendered graph
  type already determine this; `GraphComponent.jsx` has the data — pick a
  sensible derivation per `graphType` (BarGraph/LineGraph/PieGraph: number
  of distinct categorize values OR `yAxisColumns.length`; GridGraph: 9 is
  a fine default since it bins).
- For schemes that ship discrete swatches up to 11 (categorical /
  diverging), capping at 11 (or doing Plot's `quantize` fallback for > 11)
  is the right behavior. `getPlotScheme` already does the right thing via
  the `schemei` / `scheme11` helpers — just feed it the correct N.

If deriving N from the data turns out to be invasive, fall back to a fixed
N (e.g. `20`, matching the current `DefaultPalette` size) for v1 and file
the dynamic-N improvement as a follow-up.

### 5. Backward compatibility

- Existing sections with `colors: { type: 'palette', value: [...] }` — keep
  rendering as-is (`GraphComponent.jsx`'s `if (c.type === 'palette')`
  branch above).
- Existing sections with no `colors` at all — fall through to `DEFAULT_SCHEME`.
- The custom `mapColors` names (`seq1..seq12`, `div1..div7`) remain in the
  picker under a "Custom / AVAIL" category so author intent is preserved.
- The legacy `graph/` component is not touched.

## Files Requiring Changes

- [ ] `packages/dms/src/ui/components/graph_new/plotSchemes.js` — **new**.
      Mirror of Plot's `schemes.js` scheme catalog + categorization, depending
      only on `d3` (not `@observablehq/plot`). ~120 lines including helpers.
- [ ] `packages/dms/src/ui/components/graph_new/colorRange.js` — fall through
      to `getPlotScheme` when a name isn't in `mapColors`. ~5 lines diff.
- [ ] `packages/dms/src/ui/components/graph_new/GraphComponent.jsx:53-57` —
      handle `colors.type === 'scheme'` (resolve via `getColorRange`) in
      addition to the existing `'palette'` branch.
- [ ] `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/graph_new/config.jsx`
      — change `defaultState.display.colors` to `{type:'scheme', name:'observable10', reverse:false}`;
      add new `colors` control group; remove the module-load
      `DefaultPalette = getColorRange(20, 'div7')`.
- [ ] (Maybe) `packages/dms/src/ui/components/graph_new/colorRange.js` or
      a sibling exports a `buildSchemeOptions()` helper for the picker so
      it isn't duplicated inline in `config.jsx`.
- [ ] (Conditional) `sectionMenu.jsx` / the `select` control implementation
      — only if option-grouping (b) is taken instead of label-prefix (a).
      Check `patterns/page/components/sections/sectionMenu.jsx` first.

## Open Questions

- **Plot dependency.** Is `@observablehq/plot` already on its way out of
  `package.json`? If yes, this task is on the deprecation critical path
  (the new graph still imports a `DefaultPalette` derived from
  `getColorRange`, which is local — so Plot itself isn't imported here,
  but verify before grepping). If no, the new `plotSchemes.js` can be a
  stepping stone that lets Plot be removed in a follow-up.
- **Where to default.** Plot's categorical default is `observable10`;
  AVAIL's existing default is `div7`. Switching the default changes the
  out-of-the-box look of every newly created graph (existing graphs are
  unaffected — they persist their own `colors`). Confirm with the user
  whether to ship `observable10` as the new default or keep `div7`.
- **Scheme picker UX.** Flat select with category-prefixed labels vs.
  hierarchical menu (category → scheme). The existing `select` control
  in `sectionMenu` is flat; check whether anything in `controls_utils.js`
  already supports grouping before extending.

## Testing Checklist

- [ ] Create a new BarGraph section: default colors render as Plot
      `observable10`.
- [ ] Open Colors menu, pick `viridis`: bars re-render in the viridis
      palette without reload.
- [ ] Toggle Reverse: palette inverts on the next render.
- [ ] Pick a categorical scheme with >11 series (force a many-series
      grouping): rendering doesn't crash, colors are interpolated/quantized.
- [ ] Pick a `seq1..seq12` / `div1..div7` from the Custom group: matches
      the existing AVAIL palette exactly (no off-by-one from the new
      resolver).
- [ ] Existing graph section with `colors: {type:'palette', value:[...]}` :
      renders byte-identical to before the change.
- [ ] Existing graph section with `colors: {type:'scheme', name:'div7'}` (if
      any made it to the DB during testing): resolves through the new path.
- [ ] PieGraph + GridGraph render correctly under the new resolver (their
      color usage differs — categorize for Pie, value→color for Grid).
- [ ] No console warnings from `d3-scale-chromatic` missing exports.

## Follow-ups (not in this task)

- Dynamic-N sizing for color resolution (instead of a fixed cap) if v1
  uses a fallback fixed N.
- Custom-palette editor (free-form hex list) as a third `colors.type` —
  the schema already accommodates `'palette'`; add the editor when there's
  a concrete request.
- Port the same picker to the legacy `graph/` component if it's still in
  use.
- Apply Plot's diverging-default (`rdbu`) and sequential-default (`turbo`)
  when a future "graph type → default color category" mapping ships.
