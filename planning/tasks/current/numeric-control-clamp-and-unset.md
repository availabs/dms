# Bounded numeric display controls — clamp on write, blank means unset

**Status:** IMPLEMENTED · **Started:** 2026-08-25 · **Topic:** patterns/page

## Objective

Make `{type:'input', inputType:'number'}` display controls safe to use for values with a real
range. Reported symptom: **"when I set the inner padding on a bar graph, the bars disappear."**

## Root cause

Two independent defects in the same write path.

### 1. Nothing clamped the value, and out-of-range is destructive for `paddingInner`

`paddingInner` is a d3 band-scale **fraction**, not pixels. From `d3-scale/src/band.js`:

```js
// line 63
scale.paddingInner = function(_) {
  return arguments.length ? (paddingInner = Math.min(1, _), rescale()) : paddingInner;
};
// line 28
bandwidth = step * (1 - paddingInner);
```

`Math.min(1, _)` clamps any entry ≥ 1 to exactly 1, and then `bandwidth = step * (1 - 1) = 0`.
**Every bar becomes zero-width — the chart silently renders nothing.** No error, no warning.

The label read "Inner Padding", which sounds like pixels, so typing `10` (meaning 10px) was the
natural thing to do and it wiped the chart. Measured against the real d3 scale (600px range, 5
categories):

| paddingInner | bandwidth |
|---|---|
| 0 | 120.00 (bars touch) |
| 0.3 | 89.36 |
| 0.9 | 14.63 |
| **1 / 2 / 10 / 30** | **0.00 — invisible** |

HTML `min`/`max` would not have fixed this on their own: they drive the spinner and form
validation but **do not prevent typing** an out-of-range number. The clamp has to be on write.

### 2. Clearing the field wrote `0`, so a control could never be un-set

Both renderers did `+e.target.value`, and `+'' === 0`. So emptying the box pinned an explicit
`0` rather than removing the key. That matters now that themes carry brand `chartDefaults`:
`graph_new/index.jsx`'s `mergeChartDefaults` is `{...defaults, ...display}`, so a stored `0`
(or even a stored `undefined`) shadows the theme's value and the renderer falls back to its own
hardcoded default. There was no way, from the UI, to say "use the brand default".

This is exactly the state MitigateNY's SHMP home graph is in (section 2061332,
`paddingInner: 0`) — see `planning/mitigateny/tasks/current/mny-avlgraph-theme-defaults.md`.

## Changes

### `patterns/page/components/sections/controls_utils.js`

- **New export `coerceControlValue(item, raw)`** — the single raw→stored conversion for numeric
  controls. Accepts either a raw value or an event. Non-number controls pass through untouched.
  - blank / `null` / `undefined` / a lone `-` or `.` (mid-typing) → `undefined` (unset)
  - non-finite (`"abc"`) → `undefined`
  - otherwise `Number(value)`, clamped into `[min, max]` when those are finite
  - a control with **no** `min`/`max` is unchanged — arbitrary numbers still allowed (BC)
- **`updateDisplayValue` now deletes the key when the value is `undefined`** instead of storing
  an explicit `undefined`. A stored `undefined` still wins the object spread in
  `mergeChartDefaults`, so it would leave the brand default shadowed; deleting restores
  inheritance. Handles dotted keys (`yAxis.tickSpacing`) too.
  **Only `undefined` deletes** — `0`, `''`, `null` and `false` are all preserved, so an explicit
  `paddingInner: 0` ("bars deliberately touch") still round-trips.

### `patterns/page/components/sections/sectionMenu.jsx`

`controlItemTransformers.input` now:
- forwards `min` / `max` / `step` / `placeHolder` from the control item onto the leaf menu item,
  which `NavigableMenu` spreads into `ui/components/Input` and on to the DOM `<input>` — so the
  spinner and arrow keys respect the same range the write path clamps to;
- routes the write through `coerceControlValue` instead of `+(e?.target?.value ?? e)`.

### `.../dataWrapper/components/InputControl.jsx`

New optional **`coerce`** prop. When supplied it owns the raw→stored conversion and receives the
raw field text (so a blank stays blank instead of becoming `0`). When absent, behavior is
byte-for-byte the historical `type === 'number' ? +value : value`. BC for every other caller.

### `.../dataWrapper/components/MoreControls.jsx`

Passes `coerce={value => coerceControlValue({inputType, ...rest}, value)}` and
`value={display[key] ?? ''}` (keeps the input controlled when the key is unset). `min`/`max`/`step`
already reached the DOM here via the existing `{...rest}` spread.

### `.../ComponentRegistry/graph_new/config.jsx`

- **Inner Padding → `Bar Spacing (0–0.9)`**, `min: 0, max: 0.9, step: 0.05`,
  `placeHolder: "theme default"`. `max: 0.9` puts the zero-bandwidth state out of reach entirely
  rather than merely discouraging it.
- **Bar Opacity → `Bar Opacity (0–1)`**, `min: 0, max: 1, step: 0.05`, same placeholder — same
  class of bug (a 0–1 fraction in an unbounded number box).

## Verification

Ran `coerceControlValue` into the **real** `d3-scale` band scale (600px range, 5 categories),
with the stored value resolved through the same unset→theme-default path the graph uses:

| typed | stored | effective | bandwidth |
|---|---|---|---|
| `""` | `undefined` | 0.3 (theme) | 89.36 |
| `"0"` | `0` | 0 | 120.00 |
| `"0.3"` | `0.3` | 0.3 | 89.36 |
| `"0.9"` | `0.9` | 0.9 | 14.63 |
| `"1"` | `0.9` | 0.9 | 14.63 |
| `"10"` | `0.9` | 0.9 | 14.63 |
| `"30"` | `0.9` | 0.9 | 14.63 |
| `"-5"` | `0` | 0 | 120.00 |
| `"abc"` / `"."` / `"-"` | `undefined` | 0.3 (theme) | 89.36 |

**No input produces a zero-width bar.** Previously `1`, `2`, `10` and `30` all did.

`updateDisplayValue` unset semantics (verified against a draft):
- `undefined` → key removed; `0` → key kept with value `0`; `''`/`null`/`false` → kept
- dotted `yAxis.tickSpacing` unset removes only that child, sibling `format` preserved

Also checked: passthrough for `inputType:'text'`; event-shaped input (`{target:{value}}`);
an unbounded number control still accepts `250`. All 5 files parse (esbuild). ESLint reports
only pre-existing errors (e.g. the dead `useCallback` import at `controls_utils.js:2`, unrelated
`sectionMenu.jsx` prop-types/unused-vars) — none on changed lines.

## Testing checklist

- [x] `coerceControlValue` unit behavior across valid / out-of-range / blank / garbage input
- [x] Clamped values fed to the real d3 band scale never yield `bandwidth === 0`
- [x] `updateDisplayValue` deletes only on `undefined`; `0`/`''`/`null`/`false` survive
- [x] Dotted-key unset removes only the child
- [x] Unbounded numeric controls unchanged (no `min`/`max` → no clamping)
- [x] All touched files parse; no new lint errors
- [ ] **Live UI pass, not yet done** — open a BarGraph's Settings → Bar Graph Layout and confirm:
      spinner honors 0/0.9/0.05; typing `10` clamps to 0.9 rather than blanking the chart;
      clearing the box shows the placeholder and the bars adopt the brand default
- [ ] Live pass on the **More** popup path (`MoreControls`) as well as the settings tree
- [ ] Confirm the `value ?? ''` change didn't make any other MoreControls input jump between
      controlled/uncontrolled

## Notes / follow-ups

- Only `graph_new`'s two 0–1 controls were given bounds. Other `inputType:'number'` controls
  across the registry (Card, Spreadsheet, map) are untouched and keep their old unbounded
  behavior — adding `min`/`max` to any of them is now a one-line change per control.
- `paddingOuter` is read by the renderer (`GraphComponent.jsx:177`) but still has **no** author
  control; it can only be set from a theme's `chartDefaults` or by editing element-data.
- `ui/components/Input` receives the whole menu item via `<Comp {...menuItem}>`, so non-DOM props
  (`menuItem`, `items`, …) leak to the DOM and React warns. Pre-existing, not addressed here.
