# BarGraph Scale Filter: log-spaced stops, value labels, design pass

**Initiatives:** [mny_county_sites](../../../../../planning/initiatives/mny_county_sites.md) (primary), [dms_author_primitives](../../../../../planning/initiatives/dms_author_primitives.md) · **Status:** done · **Created by:** amuro@albany.edu · **Edited by:** —

**Project:** MitigateNY (library change) · **Topic:** ui/graph · **Started:** 2026-10-06

**Related:**
- [`migrate-legacy-graph-to-graph-new.md`](./migrate-legacy-graph-to-graph-new.md): the port that
  carried the Scale Filter onto `graph_new` as Max / 75% / 50% / 5% and mapped the old
  `display.upperLimit` to `yAxis.domainMax`.
- [`mny-county-template-natural-hazards-redesign.md`](../../../../../planning/mitigateny/tasks/current/mny-county-template-natural-hazards-redesign.md):
  the page this serves. Its library-gap item **L3** proposes a different viewer control, a "To scale |
  ×10 steps" switch that changes the axis type. This task keeps the crop-style filter the client
  already uses. If L3 ships later, the two should share one control slot, not stack.
- [`avlgraph-legend-and-padding-theming.md`](./avlgraph-legend-and-padding-theming.md): the graph
  theming conventions this task's token work follows.

## Outcome (2026-10-06): DONE. Built, verified live in dev, and accepted by the owner. Commit, deploy and the TransportNY sync are the owner's.

- **Stops:** Max plus three log-spaced stops between the tallest and the smallest positive bar,
  snapped to 1/2/5 × 10ⁿ (`getScaleFilterStops`, `graph_new/components/utils.js`). On the live
  county template: loss by year **Max $332M · $20M · $2M · $100K**, loss by month **Max $332M ·
  $50M · $10M · $1M**, last-5-years damage **Max $3.81M · $1M · $500K · $100K**; last-5-years
  events (2.6× spread) gets **no control**, as designed (D4).
- **Labels:** each button names the value it crops to, in the compact form of the axis format
  (`getCompactFormatFunc`, `graph_new/utils.js`, passed down from `GraphComponent` as
  `scaleFilterFormat`).
- **Design:** mockup `src/themes/mny/design/pages/lhmp/scale-filter.html` (01 today, 02 three
  control directions, 03 three cut-bar treatments, 04 all four graphs). **Direction A** (the LHMP
  redesign's pill-track switch, top-right, "Scale" lead-in) and the **torn-edge** cut marker were
  ported. B and C stay in the mockup for the owner to compare. Swapping direction is a theme-only
  change.
- **Cut bars (D3, in):** bars over a Domain Max are clipped to the plot and get a torn edge in the
  chart's background colour; the tooltip keeps the true value. Applies to any BarGraph with a
  Domain Max under its tallest bar (author-set or Scale Filter), and changes nothing otherwise.
- **Live check** (spare-port dev server against prod, logged out, view mode): 3 controls with the
  labels above, MNY tokens applied (the code theme reaches the page), clicking $2M crops the axis
  and marks all 8 bars over $2M. Production build passes.
- **Tests:** `tests/barGraphScaleFilter.test.js` (27) and `tests/barGraphCutBars.test.js` (8),
  green. Full library suite: 805 pass, 3 fail. All 3 failures are already on the tree:
  `avlGraphThemeDefaults` (the golden predates the tessera palette now in the core Light Mode
  style) and two in `syncDeltaConvergence`. Neither file is touched by this task.

### Deviations from the plan

1. **New token names, not the legacy ones.** The plan said to wire `scaleWrapper` / `scaleItem` /
   `scaleItemActive` / `scaleItemInActive`. But `getComponentTheme` doesn't merge per key, and stale
   copies of those keys sit in about a dozen themes (`avail`, `avail_site` v1–v9, `fusion`, and
   possibly DB-stored themes too). Reading them would have restyled every one of those sites. The
   control reads **`scaleFilterWrapper` / `scaleFilterLabel` / `scaleFilterTrack` /
   `scaleFilterItem` / `scaleFilterItemActive` / `scaleFilterItemInactive` / `scaleFilterValue`**
   instead. Each one falls back to the old literal when unset, so untokened sites are unchanged.
   The `mny` theme's legacy keys (default and dark styles) were replaced with the new ones.
   `fusion`'s designed `scaleWrapper`/`scaleItem` strings stay inert, as they were before. Rename
   them if fusion wants its look.
2. **Core `graph_new/theme.js` is unchanged.** The plan said to add defaults there.
   `tests/avlGraphThemeDefaults.test.js` pins the convention that core tokens stay **unset**, with the
   component holding the historical literal (the same as the legend and tooltip tokens), so the
   fallbacks live in `components/BarGraph.jsx`.
3. **D5: show a "custom" item instead of snapping to the nearest stop.** A saved `domainMax` that
   isn't a current stop shows as an extra, active button with its own value (title "Current axis
   maximum"), in sorted position. Snapping would misstate the crop. An author's own Domain Max of
   $50M is not "$20M". The extra item also keeps the control visible on flat data, so a chart saved
   cropped can always be reset to Max.
4. **Buttons are `<button type="button" aria-pressed>`** inside a `role="group"`, not clickable
   `<div>`s.

## Objective

The county template's natural hazards page
(`https://county_template.devmny.org/the_risk/natural_hazards`) has several bar graphs near the
bottom with the **Scale Filter** turned on. The filter lets a reader crop the value axis, so that
skewed, roughly log-distributed data can be read at several magnitudes. Without it, one outlier bar
(one bad year or one dominant hazard) flattens all the others. The client relies on this control.

The filter has three problems:

1. **The stops are linear.** Max / 75% / 50% / 5% of the peak bar. When the data spans 3 or more
   orders of magnitude, 75% and 50% look almost the same as Max, and even 5% is still far above
   most bars. Only one of the three stops is useful.
2. **The labels are percentages.** "50%" tells the reader nothing about what they're looking at.
   The button should name the value the axis is cropped to (for example "$5M").
3. **It looks unfinished.** It's a grey text strip with hardcoded classes above the chart. The
   theme already defines tokens for it, but nothing reads them (see Current State).

**Goal:** three **log-spaced** stops below Max, each **labelled with the value it crops to**, and a
designed control styled through the theme.

## Scope

**In:**
- The stop computation in `graph_new/components/BarGraph.jsx`, extracted into a tested pure function.
- Value labels formatted with the chart's own value-axis format.
- Wiring the control to the graph theme tokens (`scaleWrapper` / `scaleItem` / `scaleItemActive` /
  `scaleItemInActive`). Defaults must reproduce today's literal classes exactly, for BC.
- A design pass: an HTML mockup first, then port it to the `mny` theme tokens.
- How bars that exceed the crop are drawn (see decision D3).

**Out:**
- Any change to LineGraph or other chart types. The filter is BarGraph-only, and stays that way.
- The L3 viewer "To scale / ×10" axis switch from the natural-hazards redesign.
- Changing which sections have the filter turned on. That is content, and is the redesign task's
  call.

## Current State (2026-10-06)

- **Toggle:** `ComponentRegistry/graph_new/config.jsx:385`, `showScaleFilter`. Only shown for
  `graphType === 'BarGraph'`.
- **Stops:** `graph_new/components/BarGraph.jsx:130-149`. `peak` is the tallest bar: the stacked sum
  for `stacked`, or the tallest single series for `grouped`. The stops are
  `[Max → undefined, 75% → peak·0.75, 50% → peak·0.5, 5% → peak·0.05]`.
- **Render:** `BarGraph.jsx:450-464`. Hardcoded classes
  (`w-fit flex rounded-md p-1 divide-x border mb-2`, active `text-blue-600`). The control sits in its
  own row above the chart and legend, and is `print:hidden`. The active stop is found by strict
  equality, `activeDomainMax === value`.
- **Apply:** `graph_new/index.jsx:134-146`, `setYAxisDomainMax`, writes `display.yAxis.domainMax`
  through `setState`. `avl-graph/BarGraph.jsx:305-319` clamps the value-axis domain to it.
- **Theme tokens exist but nothing reads them.** `graph_new/theme.js:6-7` defines `scaleWrapper` and
  `scaleItem`. `src/themes/mny/theme.js:163-167` defines `scaleWrapper`, `scaleItem`,
  `scaleItemActive` and `scaleItemInActive` in Oswald, uppercase, using the MNY palette. `avail` and
  `fusion` also define them. These look like leftovers from the legacy Graph. The `graph_new` port
  hardcoded the classes, so the MNY styling stopped applying.
- **Overflow:** `avl-graph/BarGraph.jsx` has no `clipPath`. Bars taller than `domainMax` probably
  draw past the plot top into the margin. **Verify in phase 1.**
- **Migration:** `Graph.migrate.js:89-97` copies a legacy `display.upperLimit` into
  `yAxis.domainMax`, so some sections may be saved with a 75/50/5% value already applied.

**Example of the problem** (illustrative magnitudes: peak bar $1.2B, smallest non-zero bar $40K):

| Stop | Today | Crops to | Proposed (log-spaced, nice-rounded) |
|---|---|---|---|
| 1 | Max | $1.2B | Max · $1.2B |
| 2 | 75% | $900M | $100M |
| 3 | 50% | $600M | $5M |
| 4 | 5% | $60M | $500K |

## Proposed Changes (the original plan; see Outcome for what changed)

### 1. Log-spaced stops

Pull the stop computation out into a pure `scaleFilterStops({ data, keys, groupMode })` in
`graph_new/components/utils.js`, or in a small `scaleFilter.js` beside it.

- `peak` = the tallest bar, using the same stacked/grouped rule as today.
- `floor` = the smallest **positive** bar, using the same rule (decision D1).
- The three stops are evenly spaced in log space between them, excluding the endpoints:
  `stop_k = peak · (floor / peak)^(k/4)`, for k = 1, 2, 3.
- **Nice-round** each stop to the nearest 1 / 2 / 5 × 10ⁿ in log distance, so the labels read
  "$5M", not "$6.93M" (decision D2). Drop any stop that rounds to a duplicate or reaches `peak`.
- **Degenerate cases:**
  - `peak ≤ 0`, or no positive bars: hide the control, as today.
  - `peak / floor < 10`: the data isn't skewed, so log stops buy nothing. Fall back to fewer stops
    or hide the control (decision D4).
  - Negative values: compute only from the positive side. Negative domains keep the natural minimum.

### 2. Value labels

- Each stop button shows the value it crops to, using the value-axis formatter (`yAxis.format`, the
  same function as the tick labels), forced to the **compact** form (`$1.2B`, `$500K`, `12K`).
- Max shows the actual peak ("Max · $1.2B"), so the reader knows the full range.
- Optionally, a quiet lead-in label on the control, such as "Show up to". It's a design decision,
  so copy it verbatim from the chosen mockup.

### 3. Active state and BC for saved values

- Today's strict equality (`activeDomainMax === value`) will not match a `domainMax` that was saved
  under the old 75/50/5% stops. That section would load cropped, with no button lit. Treat a stored
  value that doesn't match a stop as **the nearest stop in log space** for highlighting, or show
  a "Custom" state (decision D5). Never silently rewrite the stored value.

### 4. Design pass (mockup first)

- Build an HTML mockup in the MNY design system (`src/themes/mny/design/`) with 2–3 directions, on
  the real natural-hazards data shapes. Candidates:
  - a segmented pill control with value labels;
  - a "staircase" glyph per stop showing the relative crop;
  - the control placed in the graph header row (title left, control right) instead of in its own row.
- The owner picks a direction. Then port it to the **theme**, never to `className` passthroughs:
  - wire `scaleWrapper` / `scaleItem` / `scaleItemActive` / `scaleItemInActive`, plus any new
    tokens such as `scaleLabel`, through the graph theme;
  - `graph_new/theme.js` defaults must equal today's literal classes;
  - restyle in `src/themes/mny/theme.js`.

### 5. Overflow bars (decision D3)

When the crop is below the peak, clip bars at the plot top and mark the overflow: a break glyph at
the cut, with the bar's true value as a label or in the hover. The reader can then tell that a bar
was cropped, not that it simply reaches the top. Requires a `clipPath` and a marker in
`avl-graph/BarGraph.jsx`. Ship it with this task, or split it out if it grows.

## Decisions (resolved 2026-10-06)

| # | Decision | Taken |
|---|---|---|
| D1 | Floor for the log spacing | **Smallest positive bar.** Its lowest stop is useful on all four live charts ($100K shows 7 of 29 years whole). |
| D2 | Nice-round to 1/2/5 × 10ⁿ | **Yes.** A snap never reaches the previous stop or the peak, and never goes below the floor. |
| D3 | Overflow-bar treatment | **In this task**: clip to the plot plus a torn-edge mark. Phase 1 confirmed the bars ran past the plot top into the margin. |
| D4 | `peak/floor < 10` | **Hide the control**, unless the section is saved cropped. Constant: `SCALE_FILTER_MIN_SPREAD`. |
| D5 | A stored `domainMax` that isn't a stop | **Shown as its own active item** (deviation 3 above). |
| D6 | Max + 3 stops | **Yes.** |

## Files Changed

| File | Change |
|---|---|
| `packages/dms/src/ui/components/graph_new/components/utils.js` | `getScaleFilterStops()` plus `SCALE_FILTER_MIN_SPREAD` |
| `packages/dms/src/ui/components/graph_new/utils.js` | `getCompactFormatFunc()`: compact K/M/B labels that follow the axis format's `$` and k/m/b casing; time/duration formats pass through |
| `packages/dms/src/ui/components/graph_new/GraphComponent.jsx` | Builds `scaleFilterFormat` from `yAxis.format` + `isDollars` and passes it to the chart |
| `packages/dms/src/ui/components/graph_new/components/BarGraph.jsx` | New stops, value labels, the custom item, `scaleFilter*` tokens with literal fallbacks, `<button>`s |
| `packages/dms/src/ui/components/graph_new/components/avl-graph/BarGraph.jsx` | `cropTop` → `cutMarks` (stacked: per bar by positive sum; grouped: per series), a plot `clipPath` only when something is cut, the `CutMark` torn edge, and the `bgColor` prop |
| `packages/dms/src/ui/components/graph_new/index.jsx` | Comment only |
| `packages/dms/tests/barGraphScaleFilter.test.js`, `barGraphCutBars.test.js` | New |
| `skills/authoring-graphs.md` | `domainMax` on BarGraph (cut bars) plus a `showScaleFilter` entry with the tokens |
| `dms-template/src/themes/mny/theme.js` | `avlGraph` default and dark styles: legacy `scale*` keys → direction-A `scaleFilter*` tokens |
| `dms-template/src/themes/mny/design/pages/lhmp/scale-filter.html` | The mockup (new) |

`Graph.docs.js` has no Scale Filter entry, so it's untouched. The editor toggle
(`ComponentRegistry/graph_new/config.jsx`, "Scale Filter") is unchanged.

## Phases

- [x] **1. Audit** (2026-10-06).
  - Live page 1300806 (published 2026-10-02, sections 2736898–2736930). Scale Filter is on for
    **4** stacked vertical bar graphs: 2736924 (loss by year, $, spread 36,856×), 2736926 (loss by
    month, $, 1,580×), 2736927 (last 5 years events, count, 2.6×) and 2736928 (last 5 years damage,
    $, 101×). 2736909 (EAL by hazard, horizontal) has it off.
  - **None has a saved `yAxis.domainMax`**, so there was no saved-crop BC exposure on the template.
  - Overflow confirmed in a live screenshot: at 5%, bars ran ~10px past the plot top into the margin.
  - Not done: a census of `showScaleFilter` on the 49 county sites and on other apps. The county
    sites are copies of the template, and the new-token naming makes untokened sites safe
    regardless.
- [x] **2. Mockup.** `design/pages/lhmp/scale-filter.html`. Recommended direction A was ported
  without a separate review stop, at the owner's request to implement the task. B and C are kept
  for comparison.
- [x] **3. Stop math + labels**, with tests.
- [x] **4. Theme port** (new `scaleFilter*` tokens; see deviations 1–2).
- [x] **5. Overflow treatment** (clip plus torn edge).
- [x] **6. Verified live** on a spare-port dev server against prod (view mode, logged out).
  **Remaining for the owner:** commit (library submodule + dms-template), deploy, the TransportNY
  vendored-copy sync, and reviewing direction A against B/C in the mockup.

## Testing Checklist

- [x] Unit tests for `getScaleFilterStops`: the four live charts; stacked vs grouped; negatives,
  zeros and non-numbers; empty, all-zero and single-bar data; the 10× threshold; `count`; a
  300-run property check (1/2/5 mantissa, strictly decreasing, below the peak, not below the floor).
- [x] BC: an untokened theme (and the core default theme) renders the pre-token literals, and the
  legacy `scaleWrapper`/`scaleItem*` keys are not read.
- [x] Labels use `yAxis.format` + `isDollars` (`$20M`; plain `46` for counts; `$20m` for `fnum`).
- [x] A saved `domainMax` that isn't a stop: the chart stays cropped, the control shows the value
  as an active custom item, and the stored value is untouched (unit test). No live section has one.
- [x] Clicking a stop crops the axis (live: $2M → 8 cut bars). Max restores the full range.
- [x] Horizontal orientation: the cut mark sits at the plot's right edge (renderer test). No live
  horizontal chart has the filter on.
- [x] Still `print:hidden` (wrapper class, pinned in a unit test).
- [x] The MNY theme renders direction A on the natural-hazards page (live screenshot). A default-theme
  site renders the old classes (unit test).
- [x] Cut bars are clipped at the plot top with the torn edge, and hover shows the true value
  (renderer test + live).
