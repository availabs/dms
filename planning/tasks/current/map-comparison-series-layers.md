# Map section: comparison-series-driven symbology layers (old-reports Route Map M0a)

## Status: BUILT & LIVE-VERIFIED 2026-07-14 (first consumer: converted report 641, page 2190998)

Parent effort: `old-reports-conversion.md` Route Map work plan v2.1/v2.2 (scope detail in
`dms-template/scratchpad/npmrds-sub/old-reports/route_map_scope.md`). This task is the
**platform (library) half** — ship isolated from converter work per standing directive.

## Objective

Give the Map section the same live route/date binding graphs have: a `comparison_series`
componentFunctions subscriber that materializes one symbology layer per published variant
(route comp) from an author-designated template layer. The ReportRouteList then discovers,
assigns routes to, and publishes to Map sections with ZERO RRL changes
(`findSelfBoundGraphs` is element-type-agnostic).

## Design (decided; user-endorsed)

- Subscriber entry mirrors the graph's: `{functionId:'comparison_series', enabled,
  paramKey:'$self', args:{labelKey:'label', valueKey:'filters'}}`. Same `$self`/trackingId
  resolution + `resolveComparisonVariants` as `usePageFilterSync` — REUSED, not re-implemented.
- Template layer = a layer flagged `'series-template': true` (author/converter sets it; the
  template itself stays hidden — its `layout.visibility:'none'` is the emitter's job, runtime
  does not mutate the template).
- Per variant i → materialized layer id `${tplId}__series_${i}` (deterministic, idempotent),
  marked `__seriesGenerated: true`:
  - geometry-side static `filter[featureCol] = {operator:'==', value:<leaf values>}` where
    `featureCol = tpl['series-feature-column'] || tpl.join?.featureKeyColumn` and the leaf is
    the variant filter-tree node with `col === featureCol`;
  - if `tpl.join?.enabled`: the WHOLE variant filter tree becomes the join subquery's
    filterGroups (`join.query.filters = {filterGroups: variant.filters}`, filterRows cleared)
    — arm-equivalent pre-aggregation scoping;
  - `name` = variant label; line color = `getColorRange(n,'div7')[i % n]` (series palette by
    index — per user 2026-07-14, NO color customization now) applied to the main sub-layer,
    ONLY when the template has no `data-column` (choropleth templates keep their paint);
  - `legend-data: [{color, label}]` per generated layer (skipped for choropleth templates —
    the existing runtime legend refresh owns those);
  - sub-layer ids re-suffixed (`l.id.replace(tplId, newId)`); `sources` SHARED with the
    template (maplibre layers can share a source — no source duplication).
- Loop guard: `symbology.__seriesKey` fingerprint (JSON of variants+template ids); effect
  no-ops when unchanged (same isEqual-guard pattern as usePageFilterSync).
- Fit bounds: on variant change (and `tpl['series-fit-bounds'] !== false`), union the
  featureCol values across variants → `fetchBoundsForFilter` on a synthetic layer state →
  write `symbology.zoomToFilterBounds` (mirrors the dynamic-filter zoom effect parse).
- Persistence: extend `stripRuntimeLegendState` to drop `__seriesGenerated` layers and
  `__seriesKey` — generated layers are runtime-only, template + subscriber are the saved
  config (same runtime-vs-persist pattern as the runtime legend).
- `dataPageFilters` action-filter exclusion UNTOUCHED — the subscriber reads only its own
  named param.

## Files requiring changes — CODE DONE 2026-07-14 (esbuild-parse clean), live verify pending

- [x] `map/config.jsx` — `comparison_series` added to `componentFunctions.subscribers`
      (args labelKey/valueKey, mirrors graph_new's declaration)
- [x] `map/useComparisonSeriesLayers.js` — NEW hook; exports `materializeSeriesLayer`
      (pure), `isSeriesGeneratedLayer`, `SERIES_FINGERPRINT_KEY`, `seriesLayerId`
- [x] `map/index.jsx` — props destructured, hook called after state init,
      `stripRuntimeLegendState` drops `__seriesGenerated` layers + `__seriesKey`
      (both the hasRuntimeState detection and the clean pass)

## Testing checklist

- [x] Live page (converted report 641 → page 2190998, `route_map_none_2019` template over
      geometry view 1027): 13 layers materialized 1-per-assigned-comp, palette colors +
      route-name labels in legend, template row suppressed (`legend-orientation:"none"` on
      the template, cleared on clones); screenshot verified
- [x] Fit-bounds: map auto-fits the Buffalo route union (was default-NY before publish)
- [x] Edit-mode persistence: authenticated /edit load with layers materialized → both Map
      section rows' element-data md5 + updated_at UNCHANGED (strip works, no spurious save)
- [x] report_probe: 0 console errors / 0 page errors / 0 failed requests, view + edit modes
- [ ] Route add/remove/date edit through the RRL UI → layers rebuild live (mechanism verified
      by publish-race observation: variants resolve on every publish change; interactive
      UI-driven edit still worth a manual pass)
- [x] Publish-arrival race handled: RRL publishes empty lists first, then real routes —
      hook tears down/rebuilds idempotently (deterministic `__series_` ids + fingerprint)

**Bug found & fixed during verification**: the Map renders through the NON-data wrapper
(`components/index.jsx`), which passes `sectionId`/`trackingId` via ComponentContext, NOT
props (dataWrapper passes props). The hook initially read props only → `selfParamKey(undefined)`
→ silent no-op. MapSection now reads identity from ComponentContext with prop fallback.

Future skill candidate (after M2 completes the family): "map templates for converted/authored
report maps" covering series-template layers + the comparison_series subscriber.
