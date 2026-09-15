# `date` columnType: normalize mixed raw date-string formats

**Status:** LIBRARY CODE COMPLETE — awaiting live verification
**Topic:** ui (columnTypes)
**Driver:** MitigateNY `DHSES_County_Database` external source — `plan_approval_date`/`expiration_date`/
`date_funded` columns store a mix of ISO (`2026-07-15`) and US-locale (`7/16/2021`) date strings across
rows (bulk-imported at different times / through different paths), which surfaced two visible bugs on
`mitigat-ny-prod` pages built on that source (components 1077908, 2527762).

## Objective

Make the `date` columnType tolerant of mixed raw date-string formats without any data migration:

1. **Edit-side (the concrete bug):** the native `<input type="date">` only accepts strict ISO
   `YYYY-MM-DD` per the HTML value-sanitization algorithm — a stored value like `"7/16/2021"` makes the
   picker render/report **empty**, even though the row's stored value is untouched. If an author saves
   from that state without re-entering the date, the field is genuinely overwritten with an empty value.
2. **View-side:** columns of `type: "date"` with no `formatFn` set render the raw stored string
   verbatim (`TableCell.jsx:313-317`, `Card.jsx:429-446` both fall through to `rawValue` when
   `attribute.formatFn` is unset), so two rows with differently-formatted raw values show up
   differently on the same table/card.

## Current State

`ui/columnTypes/index.jsx:74-77`:
```js
'date': {
    EditComp: (props) => <TextEdit {...props} type={'date'} />,
    ViewComp: (props) => <TextView {...props} type={'date'} />,
},
```
Both just alias the generic text column type with `type='date'` — no date-specific parsing anywhere.
`TextEdit`/`TextView` (`ui/columnTypes/text.jsx`) pass the raw value straight to `Input`/a `<div>`.

Existing view-side escape hatch: setting `formatFn: "date"` on a column already fixes display, because
`formatFunctions.date` (`patterns/page/components/sections/components/dataWrapper/utils/utils.jsx:208-218,256`)
does `new Date(dateString).toLocaleDateString(...)`, and JS's `Date` constructor already parses both
ISO and US-locale strings correctly. There is no equivalent escape hatch for the edit-side native input.

## Proposed Changes

**Revision (2026-09-15):** dropped the `patterns/` cross-import and the `looksLikeRawDate` gating —
`ui/` must not import from `patterns/` (even though `TableCell.jsx`/`Card.jsx` already do; not a
precedent to extend), and per author direction it's fine to always display `type: "date"` columns in
plain ISO `YYYY-MM-DD`, regardless of how the value happens to be stored. That means `DateEdit` and
`DateView` can share the exact same normalization — no locale formatting, no format-detection
heuristic, no dependency outside `ui/columnTypes/`.

New files, both under `ui/columnTypes/`:

**`date.utils.js`** (non-component logic — plain `.js` per the Fast-Refresh convention):
- `toISODateValue(value)` — returns `value` unchanged (truncated to 10 chars) if it already looks ISO
  (`^\d{4}-\d{2}-\d{2}`), otherwise `new Date(value)`-parses it and reformats using **local** date
  parts (`getFullYear`/`getMonth`/`getDate`, not `toISOString`, to avoid a UTC-vs-local off-by-one day
  shift on non-ISO input), returning `''` if unparseable/empty.

**`date.jsx`** (components only, no non-`ui/` imports):
```jsx
export const DateEdit = ({ value, ...rest }) => (
    <TextEdit {...rest} type={'date'} value={toISODateValue(value)} />
)
export const DateView = ({ value, ...rest }) => (
    <TextView {...rest} value={toISODateValue(value)} />
)
```

**`ui/columnTypes/index.jsx`**: import `{ DateEdit, DateView }` from `./date`, declare
`const date = { EditComp: DateEdit, ViewComp: DateView }`, replace the inline `'date'` entry with it.

## Why this scope (not a bigger fix)

- Scoped to the `date` columnType only — `timestamp` (`datetime-local` input) has the same theoretical
  edge case but no reported bug; left untouched.
- `ui/` stays free of any `patterns/` import for this feature — self-contained in
  `ui/columnTypes/`, no cross-layer dependency added or extended.
- View display is intentionally always ISO now, not a reproduction of whatever format the row was
  entered in — simpler and consistent, per author direction, at the cost of losing per-author display
  formatting preference for `type: "date"` columns specifically (an author who wants `M/D/YYYY` or a
  spelled-out date display should still use `formatFn` on top, which runs independently in
  `TableCell.jsx`/`Card.jsx` before the value reaches `DateView`).
- No DB migration: existing mixed-format rows keep whatever string they have at rest; both the edit
  picker and the default view now tolerate it. New saves from the (now-fixed) native date picker will
  naturally write ISO going forward, so the dataset trends toward consistency without a bulk rewrite.

## Files Requiring Changes

- **New:** `src/dms/packages/dms/src/ui/columnTypes/date.utils.js`
- **New:** `src/dms/packages/dms/src/ui/columnTypes/date.jsx`
- **Edit:** `src/dms/packages/dms/src/ui/columnTypes/index.jsx`

## Backward Compatibility

Purely additive/replacing one registry entry — no other columnType touched. Any column not typed
`"date"` is unaffected. Columns typed `"date"` now always display in ISO `YYYY-MM-DD` in `DateView`,
**regardless of whether a `formatFn` was already set** (`DateView` normalizes whatever value it
receives, including an already-`formatFn`-formatted one). This is a visible behavior change for any
existing `type: "date"` column across every site that had `formatFn: "date"` (or another date-shaped
formatFn) configured for a non-ISO display — it will now show ISO instead. Flagging this explicitly
since it's a real, intended tradeoff (author direction: consistency > per-column display preference for
dates) rather than an overlooked side effect.

## Testing Checklist

- [x] `toISODateValue("2026-07-15")` → `"2026-07-15"` (already ISO, pass-through).
- [x] `toISODateValue("7/16/2021")` → `"2021-07-16"`.
- [x] `toISODateValue("07-16-2021")` → `"2021-07-16"`.
- [x] `toISODateValue("5/27/2029")` → `"2029-05-27"`.
- [x] `toISODateValue("Jul 16, 2021")` → `"2021-07-16"` (spelled-out dates also normalize).
- [x] `toISODateValue("")`/`null`/`undefined` → `""`.
- [x] `toISODateValue("garbage")` → `""` (unparseable, same blank result as before — no worse).
      (All cases run directly against the real `date.utils.js` file via `node --input-type=module`,
      not reimplemented inline — confirmed correct both before and after the no-patterns-import
      revision.)
- [x] `npx eslint` on the three touched/new files: `date.utils.js` is fully clean (0 errors — no JSX);
      `date.jsx` emits only the same `react/prop-types`/`no-unused-vars` classes every sibling
      columnType already emits (verified `text.jsx` alone has 32 of the same); `index.jsx`'s errors are
      100% pre-existing (the `switch` type entries at lines ~106/113), confirmed unrelated to this diff.
- [x] Confirmed no other file in the repo references `looksLikeRawDate` or imports `formatFunctions`
      from `date.jsx`/`date.utils.js` — the revision is a clean removal, nothing left dangling.
- [ ] Live: open MitigateNY admin component 2527762 (Chenango County), confirm `plan_approval_date`'s
      native date picker now shows `2021-07-16` instead of blank.
- [ ] Live: confirm the read-only view of `plan_approval_date`/`expiration_date` on component 1077908
      now renders consistently across all counties (no mix of `2030-05-06` vs `5/27/2029` style).
- [ ] Fast-Refresh check: editing `date.jsx` in dev hot-reloads without a full page reload.
