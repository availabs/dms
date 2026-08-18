# AvlMap: the map-actions column reserves overlay width, so edge-pinned panels stop short

**Topic:** ui (`ui/components/map`) · **Created:** 2026-08-17 · **Status:** IMPLEMENTED, opt-in
**Files:** `packages/dms/src/ui/components/map/avl-map.jsx` ·
`packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/index.jsx` ·
`packages/dms/tests/avlMapFloatActions.test.js`
**Reported from:** transportNY Macro View
([npmrds-macro-view-alignment.md](../../../../../planning/transportny/tasks/current/npmrds-macro-view-alignment.md))
— Alex: *"the right panel sits a few hundred pixels off of the right side of the page and it should
only be 20px or whatever the left side panel is offset from the page."*

## The defect

`avl-map.jsx`'s overlay is

```jsx
<div className="flex absolute inset-0 pointer-events-none p-2">   // the overlay
  <div className="flex-1 relative"> … layer render comps + map-PLUGIN panels … </div>
  { !Actions.length ? null :
    <div className="relative pl-4">                               // the actions column
      <div className="flex flex-col h-full justify-end flex-end"> … </div>
    </div> }
</div>
```

The actions column is a **full-height flex sibling**, so its width comes out of `flex-1` — but it
only ever *draws* in the bottom-right corner (`justify-end`: the navigation controls = basemap
picker + zoom in/out + compass). Measured on npmrds `/macro` at a 1600px viewport
(`scratchpad/npmrdsv5-dev2/macroview_pass2/probe.mjs`):

| box | before |
|---|---|
| overlay (`absolute inset-0 … p-2`) | x 64 → 1600 (content box 72 → 1592) |
| `flex-1 relative` | x 72 → **1416** (w 1344) |
| actions column `relative pl-4` | x 1416 → 1592 — **176px reserved** (`pl-4` 16 + 160 of buttons) |
| the plugin's controls panel (`absolute top-0 left-0 p-4`) | x **88** — 24px inset ✔ |
| the plugin's context panel (`absolute top-0 right-0 p-4`) | right **1400** — **200px short** ✘ |

So any content a layer or plugin pins to `right-0` inside the overlay lands ~200px inside the map,
asymmetric with the same content pinned `left-0`, and the reserved strip is empty except for the
bottom 40px. The Macro View is the first surface with an edge-pinned right panel, which is why this
went unnoticed.

## The fix — `floatMapActions`, opt-in, default off

`avl-map.jsx` is rendered by every map in the platform (Map + Dama Map sections, MapEditor,
MapViewer, the gis_dataset map). Per `feedback_primitive_change_tasks_bc` the change is additive and
**default-off**, and the default render is byte-identical:

```jsx
const AvlMapInner = ({ …, floatMapActions = false, ...props }) => {
  …
  <div className={ floatMapActions ? "relative w-0" : "relative pl-4" }>
    <div className={ floatMapActions
          ? "absolute bottom-0 right-0 flex flex-col justify-end"
          : "flex flex-col h-full justify-end flex-end" }>
```

Why *zero-width + absolute* rather than `absolute bottom-2 right-2` on the column itself: an
absolutely-positioned box resolves its offsets against the **padding box**, so `right-0` would have
ignored the overlay's `p-2` and shifted the controls 8px out of the map. A zero-width flex item sits
exactly at the content box's right edge, so `absolute bottom-0 right-0` inside it reproduces
today's corner **exactly** — measured: the nav controls stayed at x 1432 → 1592, y 952 → 992 at
1280/1600/1920, unmoved. `h-full` is dropped in float mode because a percentage height against an
auto-height parent is `auto` anyway; `justify-end` is kept so a multi-action stack still bottom-aligns.

### How a map turns it on

Not through the section config — the reporting page (2101931) is published, and a layout fix should
not need an author edit. The Map section derives it from the **plugin registry**:

```js
// ComponentRegistry/map/index.jsx
const floatMapActions = useMemo(() => Object.values(state.symbologies || {})
    .some(symb => Object.keys(symb?.symbology?.plugins || {})
        .some(pluginName => Boolean(PluginLibrary[pluginName]?.fullWidthOverlay))
    ), [state.symbologies]);
…
<AvlMap … floatMapActions={ floatMapActions } />
```

A plugin that pins its own panels to the map's edges declares `fullWidthOverlay: true` on its
registration object (theme-side; `transportny/components/macroview/macroview.plugin.jsx` is the
first). No plugin flag ⇒ `false` ⇒ today's layout. This keeps the knob with the code that needs it
instead of adding a per-section setting nobody would find.

## Verification

- `packages/dms/tests/avlMapFloatActions.test.js` — **9 tests**, `npx vitest run tests/…`:
  server-renders the real `AvlMapInner` (no effects ⇒ maplibre is never constructed) and asserts
  the default branch's exact class strings, that `floatMapActions: false` === omitted, that the
  float branch is zero-width + floated, that `flex-1 relative` and the overlay itself are untouched,
  and — the BC proof — that the two renders are **equal after substituting the float classes back**
  (i.e. nothing else in the markup differs). Plus the section-wiring contract and a replay of the
  derivation over representative `symbologies` (no plugins / unregistered plugin / plugin without
  the flag ⇒ false).
  Whole client suite after the change: **10 files, 248 tests, all pass.**
- Live default-off: `http://sandbox.localhost:5281/infogroup/map` (a Map section with no plugins,
  same app) still renders `relative pl-4` at x 1416 → 1592 (w 176, h 934), `flex-1` still stops at
  1416, nav controls still 1432 → 1592.
  (`scratchpad/npmrdsv5-dev2/macroview_pass2/othermap_infogroup.png`)
- Live opt-in: npmrds `/macro` right-panel gap 200 → **24px** at 1280/1600/1920, left inset
  unchanged at 24px, `flex-1` now 72 → 1592, actions column `relative w-0` at 1592.

## Notes / follow-ups

- **`AvlMapInner` is now exported** (additive; both exports are components so the file stays a
  Fast-Refresh boundary). `AvlMap` lazy-imports maplibre-gl in an effect and server-renders a
  spinner, so the overlay markup is unreachable from a test without it. Consumers keep using `AvlMap`.
- **MapEditor / MapViewer / Dama Map are NOT wired.** `patterns/mapeditor/MapEditor/index.jsx` and
  `MapViewer.jsx` render `AvlMap2` without the prop, so a plugin's panels still stop short **in the
  author-side map editor**. Same one-line derivation would fix it; left out to keep this change to
  the one surface that was reported. `map_dama/index.jsx` likewise untouched.
- If a section-level author knob is ever wanted (`state.floatMapActions` in the Map section's
  settings), it composes: `floatMapActions={ state.floatMapActions ?? derivedFromPlugins }`.
- Consequence for plugin authors, now documented in
  [`skills/creating-a-map-section.md`](../../skills/creating-a-map-section.md) § *Map plugins and the
  overlay*: once the overlay is full-width, the bottom-right corner belongs to core's nav controls
  (whose basemap menu opens **upward 240 × 144px**), so a plugin's own bottom-right chrome must move.
  macroview's download pill went to the bottom-LEFT bar next to the freshness strip.

## Checklist

- [x] `floatMapActions` prop, default `false`, on `AvlMapInner`
- [x] Map section derives it from `PluginLibrary[...].fullWidthOverlay`
- [x] macroview declares `fullWidthOverlay: true`
- [x] unit coverage incl. an explicit byte-identical-default assertion
- [x] live default-off pass on an unrelated map
- [x] live opt-in pass at 1280 / 1600 / 1920
- [x] skill note for plugin authors
- [ ] (optional, not done) wire MapEditor / MapViewer / map_dama
