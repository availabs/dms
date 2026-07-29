# `epoch_time` x-axis formatter hardcodes a 5-minute bucket width

**Status:** DONE — implemented, module-verified, and **live-confirmed by the user 2026-07-27**
("looks good"). Isolated library change, deliberately kept separate
from the report-spec work that motivated it (`dms-template/planning/tasks/current/report-spec-and-build-script.md`)
per `feedback_isolate_shared_code_changes`.

## Objective

Make the `"Epoch Time (HH:MM)"` x-axis tick/tooltip formatter correct for **every** epoch-derived
resolution, not just raw 5-minute epoch — so a 15-minute or hourly NPMRDS graph shows true clock
times instead of times computed as if each bucket were 5 minutes wide.

## Root cause

`packages/dms/src/ui/components/graph_new/utils.js:367-371`:

```js
const epochTimeFormat = d => {
    const totalMinutes = Math.round(+d * 5);   // <-- hardcoded 5 min/unit
    ...
}
```

It is registered as a flat name→`func(d)` entry in `ValueFormats` (`utils.js:405-407`), resolved
through `ValueFormatsFuncMap` by `getFormatFunc` (`utils.js:413-419`). The function receives only
the tick value — it has no access to the bucket width, so there is nowhere for a non-5-minute
resolution to make itself known.

NPMRDS `epoch` is a 5-minute-of-day index (0-287). The report vocabulary
(`dms-template/data-types/npmrds_graph_vocabulary/vocabulary.json`) derives coarser buckets by
integer division, so the true width per resolution is:

| resolution | xAxis expr | minutes/unit |
|---|---|---|
| `5-minutes` | `epoch` | 5 |
| `15-minutes` | `intDiv(epoch, 3) as quarter_hour` | 15 |
| `hour` | `intDiv(epoch, 12) as hour` | 60 |
| `day` / `weekday` / `month` | date-based | n/a — `epoch_time` does not apply |

So a 15-minute chart's bucket 4 (= 01:00) currently renders as "0:20" (4 × 5 min).

**Second, separate half of the same symptom** (recorded in
`dms-template/src/dms/skills/creating-reports.md`, since split out of
`creating-routes-and-reports.md`, and the NY-9D memory): the Measure
Picker never *clears* a stale `xAxis.format: 'epoch_time'` when the author switches resolution away
from 5-minute. With this task's fix that stops mattering for correctness — the format becomes valid
at every epoch resolution — but see "Note on the picker side" below.

## Approach chosen: parameterize the formatter (not extra registry entries)

Rejected alternative: add `epoch_time_15` / `epoch_time_hour` entries beside `epoch_time`. Zero
plumbing, but it puts three near-identical options in an author-facing dropdown and makes the author
responsible for matching one to the resolution they already picked — a footgun of exactly the kind
this arc is trying to remove.

Chosen: carry the width in the graph's own `xAxis` state (a real render input), keep **one**
author-facing "Epoch Time (HH:MM)" option, and have the Measure Picker set the width from the
resolution the author already chose.

**It must NOT read `display._measurePick`** for the width, even though that key already holds the
resolution: `MeasurePicker/index.js:179-182` explicitly declares that key bookkeeping-only and
never read by the render/query pipeline, and Python-converter-built sections don't have it at all.

## Files requiring changes

- `packages/dms/src/ui/components/graph_new/utils.js` — accept a bucket width; keep the default at
  5 so every existing caller/section is unchanged.
- `packages/dms/src/ui/components/graph_new/GraphComponent.jsx` — pass the width through at **both**
  format-resolution sites: the xAxis tick formatter (~`:180`) and the `hoverComp` tooltip
  formatter (~`:91`, the one that got `xFormat`/`indexFormat` on 2026-07-24).
- `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/graph_new/config.jsx`
  — expose the width if it needs an author-facing control (decide during implementation; may not be
  needed if the Measure Picker always sets it).
- **dms-template (separate repo-root change, tracked in the report-spec task):**
  `src/themes/transportny/components/MeasurePicker/composeMeasureConfig.js:157-159` currently sets
  `xAxis.format` **only** for plain 5-minute epoch. It should set it for all three epoch
  resolutions with the correct width. This inverts today's condition.

## Testing checklist

Module-level (21 assertions, all passing 2026-07-27, run through Vite's SSR resolver so the exact
browser module graph is exercised):

- [x] Default behavior unchanged: `getFormatFunc('epoch_time')` with no opts still width-5
      (`tick 80 → "6:40"`) — regression guard, this formatter is used by live converted reports
- [x] **Arity hazard guarded**: the registry formatter ignores a 2nd positional arg
      (`fn(4, 999) → "0:20"`, not width-999). d3 calls tick formatters as `(value, index)`, so a
      single `(d, minutesPerUnit)` function would have silently consumed the tick index as the
      width. This is why `makeEpochTimeFormat` is a factory and the registry entry is its width-5
      instance.
- [x] 15-minute resolution: bucket 4 → `1:00` (was `0:20`); bucket 34 → `8:30`
- [x] Hour resolution: bucket 7 → `7:00`
- [x] Non-epoch formats unaffected (`integer` → `1,234`; unknown → identity)
- [x] Composed state per resolution: 5-min/15-min/hour get `format: 'epoch_time'` +
      `epochMinutesPerUnit` 5/15/60; `day`/`month` get neither
- [x] **Bug 2 fixed as a side effect**: switching 5-minutes → day now explicitly clears the stale
      `epoch_time` (`format: null`), instead of leaving it to label date buckets as clock times.
      Necessary because `applyMeasurePick` *merges* `display.xAxis` rather than replacing it, so
      omitting the key would preserve the stale value.

Not yet done:

- [x] **Live browser verification** — user drove a real report graph to 15-minute resolution and
      confirmed correct labels 2026-07-27. NOTE: this could not be seen until TWO other bugs were
      fixed first (the length-query 500 and the difference-mode x-column collapse) — the label fix
      was correct the whole time but masked. See `length-query-calculated-groupby-alias.md`.
- [ ] Tooltip-matches-axis confirmed visually at 15-min/hour (the `hoverComp` site is wired the
      same way as the ticks and shares the resolver, but that's reasoning, not observation)
- [ ] Port to transportNY afterwards (theme + submodule are manual-copy only, verified 2026-07-27 —
      see `dms-template/research/npmrds-reports/reportroutelist-cross-repo-sync.md`)

## Migration note: existing sections keep the old behavior until re-picked

Already-saved sections carry `xAxis.format: 'epoch_time'` with **no** `epochMinutesPerUnit`, so they
resolve to the width-5 default — i.e. a pre-existing 15-minute graph stays mislabeled until someone
re-applies a Measure pick (or it's rebuilt from a spec). That is deliberate: the alternative is
inferring width by parsing the xAxis column's SQL (`intDiv(epoch, 3)`), which is fragile. Flag it
rather than silently back-fill. A one-off migration over existing report sections is possible later
if the mislabeled-graph count justifies it — count first.

## Progress log

- **2026-07-27** — Task created; root cause confirmed by reading `utils.js:367-371`, the
  `ValueFormats`/`getFormatFunc` resolution path, and the vocabulary's per-resolution xAxis exprs.
  Approach decided with the user (parameterized, not extra registry entries).
- **2026-07-27** — **Implemented, module-verified, NOT live-verified.** Four files:
  1. `graph_new/utils.js` — `makeEpochTimeFormat(minutesPerUnit)` factory +
     `EPOCH_MINUTES_PER_UNIT_DEFAULT = 5`; registry entry is now the width-5 instance (arity stays
     1 — see the arity note in the checklist). `getFormatFunc(format, isDollars, opts)` gained an
     optional third arg; `opts.epochMinutesPerUnit` rebuilds the formatter for a coarser bucket.
     Omitted → byte-identical previous behavior.
  2. `graph_new/GraphComponent.jsx` — passes the width at **both** resolution sites: the `hoverComp`
     tooltip formatter and the xAxis tick formatter. Both must agree or the tooltip and the axis
     disagree with each other.
  3. `data-types/npmrds_graph_vocabulary/vocabulary.json` (dms-template) — added
     `xAxis.epochMinutesPerUnit` = 5/15/60 to the three epoch-derived resolutions only. Correction
     to this task's original assumption: the `_provenance` string implies the JSON is generated
     *from* the Python converter, but the converter actually **reads** it
     (`convert_old_reports.py:905-906` pulls `HOUR_EXPR`/`QUARTER_HOUR_EXPR` out of it), so the JSON
     is the shared source of truth and is the correct home for this field.
     Applied with `ensure_ascii=True` and no trailing newline after a first attempt reformatted four
     unrelated `—` label escapes — keep the byte-diff to the 3 intended additions so the
     cross-repo copy comparison stays clean.
  4. `MeasurePicker/composeMeasureConfig.js` (dms-template) — keys off the presence of
     `epochMinutesPerUnit` (which doubles as "is this resolution epoch-derived?") instead of the old
     `type === 'plain' && column === 'epoch'` check, and explicitly nulls the format for date-based
     resolutions. This is what also fixes Bug 2.
  Next: live verification on a scratch report page.

## Remaining (small)

- [ ] `hour` / `weekday` / `month` resolutions spot-checked in the browser — same code path as
      15-minutes, untested. `weekday`/`month` are date-derived, so worth an actual click.
- [ ] Port to transportNY (theme + submodule are manual-copy only).
- [ ] Consider whether to back-fill `epochMinutesPerUnit` onto existing 15-min/hour sections; they
      keep the width-5 default until re-picked (deliberate — see the migration note above). Count the
      affected sections before deciding.
