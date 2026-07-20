# Map legend + hover design pass (map component ⊕ mapeditor)

**Status: in progress 2026-07-13** · Owner ask: legends should match the DS design
(`freight-atlas-map.html` legend card), the legend's info icon (→ source page) needs a design
update + more prominence, and the hover component must be themed/designed to fit the DS.

## Design source

`src/themes/transportny/TransportNY Design System/dms_design_system_v2/pages/freight-atlas-map.html`
legend card (~line 289): white card `rounded-[8px] border zinc-950/10 shadow-lg`, header row
(`Legend` + `N layers` mono meta, `bg-slate-50/80` underline), one block per visible layer:
title row (12px semibold name · mono 9px uppercase column tag · controls), **horizontal ramp bar**
(`flex h-2 rounded overflow-hidden`) with mono min/mid/max ticks below for numeric choropleths,
compact "No data" chip row.

## Plan

1. **Theme keys** (`ui/components/map/map.theme.js`): new legend keys `header`, `headerTitle`,
   `headerMeta`, `columnTag`, `infoButton`, `rampTrack`, `rampTicks`, `noDataRow`; tightened
   row/swatch/label keys in `default_2`; hover keys tightened in `default_2`. Style 0 (`default`)
   keeps its current look (BC) — new structural bits render only when their key is present
   (header) or use neutral values.
2. **LegendPanel (map component)** structural: panel header w/ visible-layer count; title row =
   name + column tag + **info button** (inline SVG info-circle icon, themed `infoButton`, more
   prominent, `title="View data source"`); StepLegend gains a **ramp variant** (gated on
   `legendTheme.rampTrack` + all-numeric range labels) rendering the mockup ramp + 3 ticks
   (fnum-formatted); non-numeric authored labels (e.g. DAC percentiles) keep swatch rows.
   Info link base: `state.display?.dataSourcesBaseUrl` overrides the CMSContext value
   (default `/cenrep` — currently broken on FA; FA sets `/freight_data`).
3. **Mapeditor** `MapViewerLegend.jsx`: consumes the same legend theme keys — align its
   row/title/swatch classes to the new keys where it diverges; keep editor-only controls.
4. **Hover**: content renderer is already fully themed (`mapTheme.hover.*` in
   `SymbologyViewLayer.jsx` HoverComp) — design lands via theme values (default_2 + transportny).
5. **transportny themev2**: add a `map` component theme (styles[] shape) with DS-token legend /
   hover / popup values so the FA site (and all transportnyv2 sites) get the design.

## Progress log
- 2026-07-13 — task opened; design + code recon complete. Found en route: the runtime legend
  refresh (map/index.jsx `refreshLegendData`) recomputes choropleth legends via `colorDomain`
  for any non-`custom` bin-method — authored legend labels (DAC percentile bands) are clobbered
  at runtime. Fix on the data side: author-fixed-break layers should use `bin-method:"custom"`
  (respected by the refresh; breaks are already baked into paint).
- 2026-07-13 — **BUILT & LIVE-VERIFIED** (uncommitted, on freightatlas2.localhost):
  - `map.theme.js`: new legend keys (`header/headerTitle/headerMeta`, `columnTag`, `listRow`,
    `rampTrack/rampTicks`, `infoButton`, `infoButtonFill`) present in both styles; `default_2`
    legend+hover fully redesigned to the DS card look; style 0 values preserved (BC — header and
    ramp render only when their key is non-empty).
  - `LegendPanel.jsx` (map): panel header ("Legend · N layers"), title row = name + mono column
    tag + **always-visible brand info button** (inline SVG glyph replaces the `fa fa-info` span;
    `title="About this data"`); StepLegend ramp variant (numeric-range labels only —
    `parseRangeLabel` heuristic; prose labels like DAC percentile bands keep swatch rows; "No
    data" chip preserved under the ramp); inner list rows moved to `listRow` (BC fallback to the
    old row+rowHover combo); info link base = `state.display?.dataSourcesBaseUrl` override.
  - `MapViewerLegend.jsx` (mapeditor): title uses `legendTheme.title`; info control always
    visible + brand-filled when the theme sets `infoButtonFill`, else legacy reveal-on-hover.
  - Hover: no markup change needed (already themed) — redesigned via `default_2` + transportny
    theme values (semibold title, mono uppercase labels, tabular values, hairline rows).
  - `themev2.js`: replaced the dead flat `map` entry (its string `legend` key would corrupt the
    merged legend theme via string-spread) with a full ui-map-shaped `transportny` style (legend /
    popup / hover in DS tokens).
  - Verified: FA atlas legend card w/ header + AADT/DAC ramps + ticks + blue info buttons; DAC
    authored percentile rows survive (bin-method custom); hover panel DS-styled (screenshots in
    `dms-template/scratchpad/fa-symbology-restyle/`). Zero console errors.
  - **Flag for owner**: legend info icon on freightatlas2 goes to `/freight_data/source/<id>`,
    which is auth-gated (`view-sources`) — public users hit the login wall. Making FA sources
    publicly viewable is a permissions decision (datasets permissions model), not made here.
- 2026-07-13 (pass 2) — **Categorical "No data" legend bugfix** (owner report: Air Cargo, NFHN):
  the categories runtime refresh read the falcor range result (an OBJECT keyed "0","1",…) and
  checked `.length` → always undefined → every populated categorical legend collapsed to
  "No data". Fixed in `refreshLegendData`: normalize the range to ordered rows (unboxing
  `{value}` atoms), add the missing error guard (parity with choropleth), and **skip the rewrite
  when the layer has no saved `category-data`** (section-embedded symbologies have no value→row
  mapping; narrowing would have replaced authored labels/colors with raw values on a fallback
  palette). Verified live: Air Cargo airport list, NFHN 4 classes, rail Class I–III all render —
  and the rail-class layers' map paint now renders class colors too (the "olive fallback"
  leftover was this same corruption).
- 2026-07-13 (pass 2) — **Hover v2** (DS patterns pass): transportny hover panel now carries the
  `.tny-card`+`.tny-active-bar` vocabulary — amber 3px left rail, tint→white gradient wash
  (`bg-[linear-gradient(180deg,#F7F8FA,#ffffff)]` — NOTE `bg-gradient-to-b`/`bg-linear-to-b`
  did not generate in this Tailwind v4 setup; the arbitrary-value form is the reliable one),
  Oswald-caps title. Verified computed styles + zoomed screenshot.
