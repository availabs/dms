# Map section: printing clips the map and leaves a blank page before it

**Initiatives:** [tny_bug_fixes](../../../../../planning/initiatives/tny_bug_fixes.md) (primary), [dms_map_stack](../../../../../planning/initiatives/dms_map_stack.md) · **Status:** built · **Release:** deploy — owner-validated locally 2026-10-13, not deployed · **Created by:** rdubowsky@albany.edu · **Edited by:** rdubowsky@albany.edu

**Topic:** patterns/page (`ComponentRegistry/map`) · **Created:** 2026-10-13
**Files:** dms-template `src/patterns/mapeditor/section/index.jsx` (the Map section moved out of the library on
2026-10-13, `pluggable-patterns-mapeditor-extraction.md`; the fix was first made at the old path
`packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/index.jsx` in commit `fc0332f3`
and re-applied at the new path when that move was merged). Re-linked from `tny_npmrds_reports_1_0` (closed
2026-10-13) to `tny_bug_fixes`.
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
- [x] Owner check, 2026-10-13: Ctrl+P on the client's report (page 2226274) "looks much better"; on
      MitigateNY `assess_risk/natural_hazards` the map "does look BETTER". The owner saw an extra early
      blank page there locally, but an A/B on the same local code (print classes stripped vs kept, 3
      viewports) gives identical text on pages 1–7 and never adds a page (17 vs 18 at 1912×948 and
      1440×900, 18 vs 18 at 1280×720). The difference is other deployed-only rendering bugs (e.g.
      overlapping collapsible text on devmny), not this change.
- [x] Re-applied at the new path after the mapeditor-extraction merge (2026-10-13): the MNY page's Map
      container renders all four print classes, Tailwind generates the `[&_.maplibregl-canvas]` rules
      from `src/patterns/`, and the owner confirmed the printed PDF map "looks better" on the merged code.
- Known gap: headless `printToPDF` prints the WebGL canvas blank (before and after), so the clipping fix
  is shown by geometry, not by a PDF raster. Real Chrome/Edge print preview does show the map.

## Follow-up (not built): hold Print until the page's data has loaded

Asked 2026-10-13 alongside this ticket (a print fired before the graphs load prints blank sections).
Not a quick theme-only change: there is no page-level "all data loaded" signal. Loading is local
state inside each section (`dataWrapper/index.jsx` `setLoading`), maps track their own tiles, and
`@availabs/avl-falcor` keeps no in-flight request count (only a cache-change listener). Doing it
properly needs a core change: sections report their loading state into page state, and the report
header's Print waits on it. Network-quiet or spinner heuristics in the theme were rejected as
unreliable.

## Related (same ticket, not this library)

`src/themes/transportny/components/ReportPageHeader/ReportPageHeader.jsx`: the report header's Print button
now renders in view mode only (edit-mode printouts carried every edit-only control). Verified on scratch
report 2224562 (`claude_save_as_frozen_static_copy`): edit = Share / Save as / Done; view = Share / Print /
Make a copy / Edit.
