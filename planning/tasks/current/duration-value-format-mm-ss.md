# Duration value format (M:SS) for travel-time axes and tooltips

**Status:** NOT STARTED — scoped 2026-07-27, to be done as part of the report-spec work
(`dms-template/planning/transportny/tasks/completed/report-spec-and-build-script.md`), since the vocabulary is
where the per-measure format choice belongs.

**Reusable building block landed 2026-08-17** (found while auditing dms-template's planning docs,
not built for this task): `durationMinutesFormat`/`duration_mmss` (`packages/dms/src/ui/components/graph_new/utils.js`,
commit `b785b82e` "graph tooltip fixes") produces exactly this file's target `M:SS` output
(`0:54`, `-1:12`, confirmed by reading the implementation). It's already a real, registered
`ValueFormat` — not tooltip-specific code, so it's usable anywhere any `formatFn`/ValueFormat is
selectable, including `display.yAxis.format`. **It does not resolve this task** — it's currently
only wired to `composeMeasureConfig.js`'s travelTime tooltip config
(`display.tooltip.valueFormat`/`yFormat`), not `display.yAxis.format` — but whoever picks this up
can reuse `durationMinutesFormat` directly instead of writing a new formatter from scratch.

## Objective

Travel-time values are carried in **minutes**, so short corridors render as unreadable decimals —
`0.9`, `-1.2` — on a bar graph's y-axis. Render durations as `M:SS` (`0:54`, `-1:12`) instead.
User-reported live 2026-07-27 on a Travel Time difference graph.

## Prior art — same complaint, solved too narrowly

`formatMinutesAuto` (`packages/dms/src/ui/components/graph_new/components/utils.js:50`) already
exists for this exact issue; its comment reads *"user-reported: sub-70-second travel-time-in-minutes
values render as unreadable decimals like '0.045'"*. Two limits:

1. **Different output** — it switches whole units based on the graph's domain max
   (`max * 60 < 70` → `"54.0 sec"`, else `"1.25 min"`), rather than `M:SS`.
2. **Wired into one place only** — `GridGraph.jsx:189` reads it via
   `props.hoverComp?.minutesAutoSeconds`, so it applies to **GridGraph's legend** and nothing else.
   A BarGraph/LineGraph y-axis or tick label never reaches it.

Leave `formatMinutesAuto` alone — it's a legend-scoped unit switch with its own domain-max
dependency (which is why it can't live in the flat registry: it needs per-graph data). This task adds
a sibling, not a replacement.

## Approach: one new entry in the `ValueFormats` registry

`ValueFormats` (`graph_new/utils.js`) is a flat `{label, value, func}` list collapsed into
`ValueFormatsFuncMap` and resolved by `getFormatFunc` at **every** format site — y-axis ticks,
x-axis ticks, tooltip value/y formats. So a single entry becomes selectable everywhere with no new
plumbing, and shows up in the author-facing Tick Format dropdown for free.

```js
{ label: "Duration (M:SS)", value: "minutes_seconds", func: minutesSecondsFormat }
```

Requirements for the formatter:
- Input is **minutes** (fractional). `0.9 → "0:54"`, `1.5 → "1:30"`, `12 → "12:00"`.
- **Negatives must carry the sign on the whole value**, not the minutes component:
  `-0.9 → "-0:54"`, not `"-0:-54"`. This matters immediately — the reporting case is a *difference*
  graph, where roughly half the values are negative.
- Seconds always zero-padded to 2; minutes not padded.
- Rounding: round to whole seconds, and carry `59.6s → 1:00` rather than emitting `0:60`.
- Hours: leave as accumulating minutes (`90 → "90:00"`) unless a real case wants `H:MM:SS` — don't
  invent that without one.
- **Arity 1.** Same hazard as `makeEpochTimeFormat`: d3 calls tick formatters as `(value, index)`,
  so never accept a second positional parameter (see
  `epoch-time-format-bucket-width.md`).

## Wiring the default (the part that belongs to the report-spec work)

`src/themes/transportny/components/MeasurePicker/vocabulary.json` measures already know their own semantics.
Add a per-measure display hint (e.g. `"valueFormat": "minutes_seconds"`) on the duration measures —
`travelTime` and the delay family — and have
`src/themes/transportny/components/MeasurePicker/composeMeasureConfig.js` set
`displayPatch.yAxis.format` from it, exactly where it now sets `xAxis.epochMinutesPerUnit`. Measures
whose units are already readable (speed in mph) leave it unset and keep the current default.

Explicitly NOT doing: making this automatic based on a column's name or magnitude. Guessing "this
looks like a duration" from data is the kind of implicit behavior that surprises authors.

## Testing checklist

- [ ] `0.9 → "0:54"`, `1.5 → "1:30"`, `0 → "0:00"`, `12 → "12:00"`
- [ ] `-0.9 → "-0:54"` (sign on the whole value)
- [ ] Carry case: `0.9999 → "1:00"`, never `"0:60"`
- [ ] Arity guard: `fn(0.9, 999) === "0:54"` (ignores a d3 tick index)
- [ ] Selectable from the y-axis Tick Format dropdown on a real section
- [ ] Tooltip and axis agree on the same graph
- [ ] A travel-time graph built from a spec gets it by default; a speed graph does not
- [ ] GridGraph legend unchanged (`formatMinutesAuto` path untouched)
