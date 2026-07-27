# Filter bar: author-controlled clear (×) for single-select pickers — `filter.allowClear`

> **Status:** IN PROGRESS (2026-07-27) · BC-additive (opt-in, default off) · driven by TransportNY
> **#161** + two owner requirements: *"when making it single select it still needs to be clearable
> (with the x) so we can get back to full state"* and *"it might be better if the year control didn't
> have the x, I don't know how to make that author editable though."*

## Objective

Let an author decide, **per filter**, whether a single-select page-filter control offers an × that
clears back to no-constraint. Some filters need the way back (a Region that starts statewide); others
are meant to always hold a value (a Year the page is built around).

## Root cause

`MultiSelect` has supported single-select clearing for a while — it renders an × next to the caret
when `singleSelectOnly && allowDeselect && value.length`, and clicking the already-selected option
also clears. Two call sites drive filter pickers:

| Call site | Used by | `singleSelectOnly` | `allowDeselect` |
|---|---|---|---|
| `sections/ConditionValueInput.jsx` | filter-tree editor / ExternalFilters | ✅ | ✅ (already passed) |
| `…/dataWrapper/components/filters/Components/RenderFilterValueSelector.jsx` | **the filter BAR** (the `Filter` section, `display.filterStyle`) | ✅ | ❌ **missing** |

So a single-select filter-bar control was **stuck on its first pick** — no × and no way back to the
unset state. Confirmed on `/congestion_v2`: with a value set the trigger rendered only `singleValue` +
caret (one `<svg>`), and no clear span existed in the DOM.

Found by instrumenting — the `ConditionValueInput` path never logged for these controls, which is what
identified `RenderFilterValueSelector` as the live path (its `Search <Column>...` placeholder is the
tell).

## Design

**`filter.allowClear`** — per-filter boolean, **default off**, only meaningful for single-select
`filter`/`exclude` operations:

```jsx
allowDeselect={['filter','exclude'].includes(filter.operation)
    ? (!filter.isMulti && Boolean(filter.allowClear)) : undefined}
```

Author surface: an **"Allow clear"** switch in the filter's settings, rendered next to the existing
"Multiselect" switch and shown **only when the filter is single-select** — a multi-select already
clears per token, so the control would be noise there.

Default-off is the deliberate choice. It keeps every existing page byte-identical in behavior, and the
"always holds a value" case (Year) is a legitimate design, not an oversight. The filter-**tree** path
stays unconditionally clearable: that's an authoring surface, not a published one.

The existing `onChange` already handles the empty emission: `[]` → `newValues.length` is 0 → the key is
dropped from the page filters and `updatePageStateFilters(…, {[key]: true})` removes the search param,
so the URL loses the param entirely rather than carrying `?region=` (which would risk the `IN ('')`
empty-leaf class of bug).

## Files changed

| File | Change |
|---|---|
| `…/dataWrapper/components/filters/Components/RenderFilterValueSelector.jsx` | `allowDeselect` gated on `!filter.isMulti && filter.allowClear`; new "Allow clear" author switch, shown only for single-select filter/exclude |

Consumer (not in this submodule): `build_tsmo2_congestion_v2.mjs` sets `allowClear: true` on the
congestion Region filter; Year deliberately left off.

## BC check

- [x] `allowClear` absent → `allowDeselect` false → **identical** to pre-change behavior on every
      existing page. No control gains an × implicitly.
- [x] Multi-select pickers unaffected (`!filter.isMulti` guard) — tokens keep per-token removal.
- [x] Non-`filter`/`exclude` operations get `undefined`, i.e. the component default.
- [x] No new props on `MultiSelect`; no theme keys added — `singleClearWrapper` already exists in
      `MultiSelect.theme.js` and in the transportny `multiSelect` `styles[0]`, which named styles
      (`tone_bar`) inherit from. Verified the × picks up the inherited styling.
- [x] The author switch only appears for single-select filter/exclude, so existing authoring UIs are
      unchanged elsewhere.

## Verified (2026-07-27, `/edit/congestion_v2`)

- Region (`allowClear: true`): pick → menu **closes** → × appears (2 icons) → clicking × removes
  `region` from the URL entirely and restores the `Search Region...` placeholder.
- Year (`allowClear` absent): 1 icon — caret only, **no ×**, as the owner asked.
- No page errors either way. Year reactivity intact across values (2026→157.4, 2025→310.9,
  2024→277.1); when cleared it falls back to the page-settings default — **owner confirmed that is
  the intended meaning of "cleared"**, not "all values".
- Baseline: on the published (pre-fix) page the multi-select menu stays open after a pick and no ×
  exists.

## Testing checklist

- [x] Single-select + `allowClear`: closes on pick, × clears the param, placeholder returns.
- [x] Single-select without `allowClear`: no × (Year).
- [x] Clearing a single-select filter does not blank sections.
- [ ] A multi-select filter elsewhere (e.g. reliability_v2 Region) still shows tokens with per-token
      removal and no single-clear ×.
- [ ] The "Allow clear" switch round-trips in the authoring UI (toggle → save → reload).
- [ ] 390px: the × does not overflow the `tone_bar` trigger.
