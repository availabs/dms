# map_dama: shareable-link READ (`?layers=` / `f_<id>=`) — opt-in

**Status: BUILT (2026-07-13) — verification via throwaway publish in the freightatlas2 QA run**
**Origin:** control-room ticket #106 — the Freight Atlas gallery's new design (2026-07-13)
deep-links every map-figure tile to `/freight_atlas?layers=<symbology_ids>` (dataset
`freightatlas_maps` 2189815 pre-computes the URLs), but the freight_atlas map section is
**map_dama**, and the `?layers=`/`f_` read shipped only in the **Map** component
(map/index.jsx, merged 2026-07-10). Without this port the deep-links open the map in its
default state — #106's complaint ("tiles link without layer presets") would survive its own fix.

## What was added

`MapDamaView` (map_dama/index.jsx) — a read-once effect, straight port of the Map component's
read side:

- Opt-in: element-data key `shareableState: true` (map_dama keeps config as top-level keys —
  no `display` object — so the flag sits beside `hideControls`/`zoomPan`).
- `?layers=<symbologyId>,…` sets each symbology's `isVisible` (+ every maplibre sub-layer's
  `layout.visibility`); unknown ids ignored; bare `?layers=` = default state.
- `f_<symbologyId>=<idx>` sets that symbology's `selectedInteractiveFilterIndex` when in range.
- **View only, deliberately** — the edit component must not absorb URL state an author could
  then save into the section config (the Map component's `!isEdit` gate, same reasoning).
- **No URL write-back** — the share-state serializer (and the mockup's SHARE THIS MAP bar)
  stays with the unified map/map_dama component work the 07-10 design anticipates.

BC: opt-in key; nothing reads it today except the new effect. Joins the transportNY core-sync
batch.

## Consumers

- freight_atlas page 1411761: `shareableState: true` on its map_dama section (owning build
  `qa_skills/tools/builds/build_freightatlas2_freight_atlas.mjs`).
- maps_gallery tiles (rebuilt in the same QA run) link via
  `location:"/freight_atlas?layers=" + searchParamsCol:"layers_on"`.

## Implementation note (2026-07-13)

v1 (an effect flipping draft state after mount) updated the PANEL but not the MAP — layer
instances snapshot visibility at construction, so the effect raced layer building. Final shape:
`applyShareParamsToConfig` transforms `cachedData` BEFORE `useImmer` initialization (mount-time
`useMemo`), so the map builds from URL-adjusted state from the first render. Hiding also reaches
interactive-filter variant layers (the addSymbologyToLibrary hide semantics).

## Testing (2026-07-13)

- [x] Throwaway published page with a copy of the freight_atlas map section +
      `shareableState:true`: `?layers=2100239,9001049` → ONLY REDC Regions renders (checkbox,
      legend block, polygons); unknown id 9001049 ignored; FCHN (default-visible) correctly off
- [x] No params → section-default visibility (FCHN + its legend)
- [x] Encoded commas (`%2C` from the gallery's searchParamsCol links) decode fine via
      URLSearchParams
- [x] Edit mode ignores the params (view-component-only by construction)
- [ ] Real page: verify after human publish of freight_atlas
- [x] Consumer live: all 22 gallery tiles link `/freight_atlas?layers=<ids>`; 9 figures
      reference symbologies not loaded in the section — ticket #112 (section data, not this fix)
