# Map section: printing clips the map and leaves a blank page before it

**Initiatives:** [tny_npmrds_reports_1_0](../../../../../planning/initiatives/tny_npmrds_reports_1_0.md) (primary), [dms_map_stack](../../../../../planning/initiatives/dms_map_stack.md) · **Status:** built · **Release:** deploy — awaiting the owner's cross-site check on a MitigateNY map page · **Created by:** rdubowsky@albany.edu · **Edited by:** —

**Topic:** patterns/page (`ComponentRegistry/map`) · **Created:** 2026-10-13
**Files:** `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/index.jsx`
**Reported from:** TransportNY ticket #2226344 ("print feature doesn't work", Dutchess County, report
`arlington_hs_roundabout_analysis_59`, page 2226274). The ticket's own complaint (missing graphs) did not
reproduce. The two map defects below were found while triaging it.

## The defects (both print-only)

1. **Blank page before the map.** The Map section's default height is `"full"` = `calc(95vh)`
   (`constants.js` `HEIGHT_OPTIONS`). In print, `vh` is the page height, so the map is 95% of a page. A
   canvas is unbreakable, so a map that starts below anything else moves whole to the next page and the
   rest of the current page prints blank.
2. **Route cut off.** maplibre sets the canvas to inline px (`width: 1454px; height: 901px` at a 1912×948
   window). Printing fires no window resize and the canvas stays at its screen size through
   `beforeprint`/`afterprint` (measured). The print container is the page width (~760–800px), and
   `.maplibregl-map`'s ancestor (`overflow-hidden`) clips the canvas, so the right ~45% of the map is
   lost. A route that spans the screen loses its far end.

## The fix

Print-only Tailwind classes on the `#dama_map_edit` container, appended after the theme class (same
precedent as `ExternalFilters.jsx` / `BarGraph.jsx` `print:hidden`):

```
print:h-auto! print:break-inside-avoid print:[&_.maplibregl-canvas]:w-full! print:[&_.maplibregl-canvas]:h-auto!
```

The canvas bitmap scales to the container width at its own aspect ratio (intrinsic size = its width/height
attributes), and the container wraps it. The DOM chain between them (canvas-container, `.maplibregl-map`,
the AvlMap root) is all static/relative with `h-full`, which resolves to auto under an auto-height parent,
so no other element needs a rule. Screen rendering is untouched (every class is `print:`).

**Blast radius:** every DMS site's Map sections, under print media only. A repo-wide grep (2026-10-13)
found no other print machinery: the only `window.print()` in `src/` is the TransportNY report header, and
there is no `beforeprint`/`afterprint`, html2canvas/jsPDF, `@media print`, or `.maplibregl-*` print rule
anywhere. So no existing workaround can collide. Ctrl+P on any other map page gets the same fix.

## Verification

- [x] Before (headless Chromium `page.pdf`, Letter, 1912×948, published page 2226274): 3 pages; page 1 =
      header card only, map moved to page 2.
- [x] After: 2 pages; the map shares page 1 with the header.
- [x] Print-media geometry with the container at 760px: canvas 760×471, 0px clipped,
      `break-inside: avoid`. (Narrowing the container also fires maplibre's ResizeObserver, so this
      checks the end state, not the CSS on its own.)
- [x] On-screen render unchanged (map + route draw normally at 1454×901).
- [ ] Owner check on a MitigateNY page with a map (Ctrl+P preview).
- Known gap: headless `printToPDF` prints the WebGL canvas blank (before and after), so the clipping fix
  is shown by geometry, not by a PDF raster. Real Chrome/Edge print preview does show the map.

## Related (same ticket, not this library)

`src/themes/transportny/components/ReportPageHeader/ReportPageHeader.jsx`: the report header's Print button
now renders in view mode only (edit-mode printouts carried every edit-only control). Verified on scratch
report 2224562 (`claude_save_as_frozen_static_copy`): edit = Share / Save as / Done; view = Share / Print /
Make a copy / Edit.
