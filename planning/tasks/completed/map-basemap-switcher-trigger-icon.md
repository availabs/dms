# Map basemap switcher: the trigger is a blank gray square, and nothing marks the active basemap

> **Status:** DONE 2026-07-29 — implemented, live-verified, and **resolved on owner review** the same
> day · all three changes BC · driven by TransportNY ticket **#179** (row 2195603, reliability_v2,
> client `jasondeshaies@smtcmpo.org`, filed 2026-07-21).
>
> **Not live for clients until the transportNY vendored-dms sync + deploy** — core code only, and the
> owner runs both. The ticket is Resolved on the strength of the dev-server verification below.

## Objective

Give the basemap switcher a real icon — it has always rendered a hardcoded placeholder swatch — and
show which basemap is currently selected.

**Scope grew by one defect during implementation.** Adding the active-basemap marker immediately
exposed defect 3 below: the style list was being reordered underneath `styleIndex`, so the new marker
pointed at the wrong row. A marker that lies is worse than no marker, so the reorder had to go.

## Client report

> "The icon for switching to different base map layers is just a blank square"

Severity Polish / priority Later, but it is on every map in every DMS app, and the fix is three lines.

## The two defects (one 5-line block)

`src/dms/packages/dms/src/ui/components/map/avl-map.jsx`, inside `Navigationcontrols`.

### 1. The trigger was never given an icon (the reported bug)

Lines 163-167 render a literal gray box as the control:

```jsx
<div className='border border-slate-400 rounded shadow' onClick={() => showStyleSelect(!styleSelect)}>
  <div className='w-8 h-8 rounded border bg-slate-400' />   {/* ← the "blank square" */}
</div>
```

Confirmed live on `tsmo2.localhost:5173/reliability_v2` @1500×1050: exactly one
`div.w-8.h-8.bg-slate-400`, 32×32, computed background `oklch(0.704 0.04 256.788)` (= slate-400),
**zero children, no text**. Its three siblings in the same control row each render exactly one svg
(`Minus`, `Plus`, `NavigationArrow`). So the client is looking at a gray square sitting next to three
line-art icons — it reads as a failed image, not a button.

**This is not a missing icon, a bad token, or an asset problem.** Everything needed already exists:

| piece | where | state |
|---|---|---|
| token | `map.theme.js` `mapStyleIcon: "MapLayers"` — both `default` and `default_2` | present |
| token override | `src/themes/transportny/themev2.js:1641`, same value | present |
| registration | `ui/icons/index.jsx:122` `{ icon: "MapLayers" }` | present |
| definition | `ui/icons/icon_defs.jsx:678`, a stroked stacked-layers svg | present |
| precedent | the menu rows below the trigger already render it | works |

**Fix:** drop the swatch and its bordered wrapper; render `mapIcons.mapStyleIcon` the way the zoom and
compass siblings render theirs (`size-5` icon, `text-slate-600 hover:text-blue-500` on the wrapper),
and add a `title` so the control explains itself on hover.

### 2. Nothing marks the active basemap

`styleIndex` is passed into `Navigationcontrols` (`avl-map.jsx:975`) and destructured in the signature
(`:125`) — and then **never read anywhere in the component body**. Measured: all six menu rows come
back with an identical `className` (`flex items-center p-1 hover:bg-blue-100`), so opening the menu
tells you nothing about where you already are.

**Fix:** tint the active row with the palette the block already uses (`bg-blue-100`, the same color as
its hover) and set the active label `font-medium`.

### 3. The style list was reordered underneath `styleIndex` (found by fixing 2)

`ComponentRegistry/map/index.jsx:1295` ran, **in the render body**, an in-place sort of the array it
had *imported* from `./styles.js`:

```jsx
defaultStyles.sort((a,b) => {          // ← mutates the module singleton, every render
    if (a.name === state.basemapStyle) return -1;
    else if (b.name === state.basemapStyle) return 1;
    else return 0;
})
```

The purpose was legitimate: **`AvlMap` mounted `styles[0].style` unconditionally** (`avl-map.jsx:618`),
ignoring the `styleIndex` prop it has always declared (`:580`) and recorded into state — so hoisting the
saved basemap to position 0 was the only way to make it load. The costs:

- It mutates a **module-level array shared by every map on the page** and every map mounted afterwards.
- After any live selection it reorders the *displayed* list while `AvlMap`'s internal `styleIndex` keeps
  the index the user clicked — so the two disagree. Caught by the new marker: clicking **Streets**
  (index 2) reordered the list to `Streets, Default, Satellite, …` and the marker landed on
  **Satellite**, the new occupant of index 2.

**Fix, in two parts:** make `AvlMap` mount `(styles[styleIndex] || styles[0]).style` — honouring the
prop it already accepts — then delete the sort and pass the index instead:

```jsx
const activeStyles = state.blankBaseMap ? blankStyles : defaultStyles;
const activeStyleIndex = Math.max(0, activeStyles.findIndex(s => s.name === state.basemapStyle));
```

Note `activeStyles` — the index must be computed against the array actually handed to the map, or blank
mode (a length-1 array) would index out of range.

## Not defects (verified, recorded so nobody re-checks)

- **Menu overflow.** The menu opens upward (`bottom-10`) and measures **240px** for six styles. On the
  shortest map on the site — incident_view's `1/3`-height map, canvas 300px — the menu top lands at
  346 against a map top of 334: **fits, with 12px to spare.** A *seventh* style would clip.
- **`mapStyles.length <= 1`.** The whole control is gated on `> 1`, so `blankStyles` pages never render
  it and are untouched by this task.

## Deliberately out of scope

- **The per-row icon carries no information.** All six rows (Default / Satellite / Streets / Light /
  Dark / Blank, from `ComponentRegistry/map/styles.js`) paint the *same* `MapLayers` glyph. Either give
  each style its own glyph or drop the per-row icon in favour of a check on the active row. Raised on
  the ticket; the owner scoped this task to defects 1+2 only.
- **Theming the nav-control row.** Per `packages/dms/CLAUDE.md` new markup should be styled through the
  theme, and this block is entirely hardcoded Tailwind. Doing it right means a new `controls` group in
  `map.theme.js` **and** extending `useMapTheme`'s merge list — it explicitly spreads only `legend`,
  `popup` and `hover`, so a partial `controls` override from a downstream theme would silently drop the
  defaults. Too much for a Polish ticket, and it would leave the zoom/compass siblings inconsistent.
  The icon itself already comes from the theme, which is the part that matters here. Deviation is
  deliberate: **the new classes match the three sibling controls verbatim.**
- **Click-outside close.** The menu closes only on trigger re-click or a selection. Pre-existing.

## Files requiring changes

| File | Change |
|---|---|
| `…/ui/components/map/avl-map.jsx` | replace the placeholder swatch with `<Icon icon={mapIcons.mapStyleIcon}/>` + sibling wrapper classes + `title`; read the already-passed `styleIndex` to tint the active menu row; mount `(styles[styleIndex] \|\| styles[0]).style` instead of always `styles[0]` |
| `…/ComponentRegistry/map/index.jsx` | delete the in-place `defaultStyles.sort()`; compute `activeStyles`/`activeStyleIndex` and pass `styleIndex` to `AvlMap` |

Two files. No new theme keys, no new tokens, no config or schema keys, nothing to migrate.

## Blast radius

Core `@availabs/dms` UI with no API change, but visible on **every DMS map in every app** — four call
sites, all passing `showLayerSelect={true}`:

- `patterns/page/…/ComponentRegistry/map/index.jsx:1327`
- `patterns/page/…/ComponentRegistry/map_dama/index.jsx:267` and `:504`
- `patterns/mapeditor/MapEditor/index.jsx:1202`
- `patterns/mapeditor/MapEditor/MapViewer.jsx:150`

## BC check

- [x] The control's outer box stays `h-10 w-10` in the same slot — control row measured **identical**
      before and after: `x:899 y:504.640625 w:160 h:40` @1500×1050. Zoom/compass do not move.
- [x] The click target stays the full 40×40 (the inner clickable div fills the wrapper), matching the
      siblings — verified by opening the menu from a click at the wrapper's top-left corner, not the
      icon centre. **Note** the handler cannot move to the outer div the way `zoomIn`/`zoomOut` do,
      because the outer div also contains the menu and a row click would bubble back and re-toggle it.
- [x] The menu keeps its markup, position (`absolute bottom-10 right-0`) and dimensions
      (`w-36`, 144×240), so the overflow measurement above still holds.
- [x] `styleIndex` already arrived at `Navigationcontrols` — reading it adds no prop and no plumbing.
- [x] `styles[styleIndex] || styles[0]` is byte-identical for every caller that passes no `styleIndex`
      (default 0). Audited: **only** `ComponentRegistry/map` passes one. `map_dama` (×2), `MapEditor`
      and `MapViewer` pass none → unchanged. `map_dama` also declares its **own local** `defaultStyles`
      (`map_dama/index.jsx:30`) and never had the sort, so it was never affected.
- [x] `activeStyleIndex` arithmetic unit-checked against the real `styles.js` for all six names plus a
      bogus name and `undefined` (both → 0 → Default, matching the old behaviour), and for blank mode
      (length-1 array → always 0 → Blank).
- [x] Every authored map on the whole TransportNY site saves `basemapStyle: "Default"` → `findIndex`
      0 → the exact style the old sort produced. The change is provably a no-op for existing maps.
- [x] A saved **non-Default** basemap still loads at mount — the one thing the deleted sort existed
      for. Exercised end-to-end (below).
- [x] No behavior change when `mapStyles.length <= 1` (control not rendered at all).
- [x] No theme keys added, so no downstream theme needs to change and `themev2.js` needs no edit.

## Testing checklist

All measured @1500×1050 against the dev server, `tsmo2.localhost` / `freightatlas2.localhost`.

- [x] `/reliability_v2`: **zero** `div.w-8.h-8.bg-slate-400` on the page (was 1); all four controls in
      the row now paint **exactly one own svg each** (counting only svgs outside the hidden menu).
- [x] Control row bounding box unchanged — see BC check.
- [x] Open the menu: **exactly one** row carries the active tint, and it is `Default`, the current
      basemap. Pick `Streets` → active follows to `Streets`, and the list order is preserved
      (`Default, Satellite, Streets, Light, Dark, Blank`). Before the defect-3 fix this same assertion
      returned `Satellite` with the list reordered to `Streets, Default, Satellite, …`.
- [x] The menu still fits inside a `1/3`-height map — incident_view, canvas 362×300 at y 333.5, menu
      144×240 at y 345.5: **fits**, 12px clear.
- [x] Non-zero `styleIndex` mounts correctly: set incident_view's draft map section (2197399) to
      `basemapStyle: "Satellite"`, loaded `/edit/incident_view` (edit reads `draft_sections`; view
      reads published `sections`, which is why the first attempt appeared to fail) → the map requested
      **`maptiler.com/maps/hybrid/style.json`** = Satellite, with the list in natural order and the
      marker on Satellite. Reverted to `"Default"` afterwards; re-read to confirm.
- [x] Second app / different map shape: `freightatlas2/freight_atlas`, a full-bleed 1436×1050 map —
      mounts Default, natural order, marker correct, menu fits.
- [x] No console errors and no pageerrors on any of the above.

## Sync

Rides the transportNY vendored-dms core sync, which already owes six other BC changes from this QA round
(`disableCellSelection`, `disableSort` + empty-header-menu guard, filter `allowClear`, and the three
map filter-bounds fixes — see [`map-filter-bounds-point-layers.md`](./map-filter-bounds-point-layers.md)).
No theme-folder sync needed for this one.
