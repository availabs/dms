# Card: numeric 0 / falsy cell values render blank

> **Status:** ✅ FIXED + VERIFIED (2026-07-06). BC bugfix, one line. Verified: tickets summary
> Blocker/Polish boxes render `0`; control-room overview renders clean (its 0-count stage cards now
> show `0` too — the same bug, now fixed); no console errors. **Remaining:** sync `Card.jsx` to
> transportNY with the other pending core syncs (batched, per the theme-sync recipe).
> **Origin:** TransportNY control-room tickets page (`sitemgmt` pattern) — aggregate count boxes
> for `Blocker`/`Polish` severities render empty when the count is 0. Same limit previously logged
> on the control-room overview ("empty-stage cards show their label without a 0") and recorded as
> a platform gotcha (dashboard empty-set limits).

## Root cause

`ui/components/Card.jsx` (`rawValue` resolution):

```js
const rawValue = attr.origin === 'static'
    ? attr.staticValue
    : source?.[attr.normalName] || source?.[attr.name];
```

`||` swallows falsy cell values. A calculated column's data is keyed under `normalName` (the SQL
alias); when the computed value is numeric `0`, `source[normalName] || source[name]` falls through
to `source[<full SQL string>]`, which is undefined → the cell renders blank.

## Fix

`||` → `??` on that line. Nullish keeps `0`, `""`, `false` from the primary key while still
falling through when the key is absent.

## BC audit

`getData.js` `rowWithData[column.normalName || column.name] = cleanValue(row[key])` — each row
object is keyed by **exactly one** of `normalName` / `name` per column (also documented in the
comment at getData.js:281-283, which references Card's exact lookup shape). So the `??` change only
alters behavior when the primary key holds a falsy value — precisely the bug — and the fallback
key never coexists with it. Regular columns (no `normalName`) are untouched: `source[undefined]`
is undefined and `??` falls through the same as `||`.

## Verify

- Tickets summary (`/sitemgmt/edit/tickets`, npmrdsv5): Blocker/Polish open-count boxes show `0`.
- Control-room overview (2184939) still renders; stage-count cards unaffected.
- An unrelated Card-heavy page (e.g. TSMO congestion) renders unchanged (BC spot-check).

## Files

- `packages/dms/src/ui/components/Card.jsx` — one-line fix.

## Sibling instances (follow-up, not changed)

The same `||`-swallows-falsy pattern exists in the table view path:
- `ui/components/table/components/TableRow.jsx:152` — `rowData[attribute.normalName] || rowData[attribute.name]`
- `ui/components/table/components/TableCell.jsx:277` — same shape (its edit branch at :276 already uses `??`).

A Spreadsheet cell whose calc value is numeric 0 would blank the same way. Same BC argument
applies (getData keys each row by exactly one of normalName/name). Fix together when a concrete
case surfaces, with the same verify pass.
