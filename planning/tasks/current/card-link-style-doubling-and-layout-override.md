# Card: link-cell style doubling fix + per-column headerValueLayout override

> **Status:** ✅ BUILT + VERIFIED (2026-07-06). Two small BC changes in `ui/components/Card.jsx`,
> both surfaced by the control-room tickets page.

## 1. Bugfix — link cells applied `valueFontStyle` twice

The value wrapper div AND the inner `<a>`/`<Link>` both received `theme[attr.valueFontStyle]`.
Text tokens nested harmlessly (which hid this), but a box-shaped token (`chip`, the new
`btnPrimary`) rendered a phantom second box — a "double button".

Fix: the wrapper skips the valueFontStyle class exactly when the styled-link branch renders
(`isLink && !(allowEdit || attr.allowEditInView)`) — the class lives on the anchor only, where
that branch already put it. BC: non-link cells unchanged; link cells keep the same anchor class
(text-styled links render identically).

## 2. Enrichment (additive) — per-column `attr.headerValueLayout`

`headerValueLayout` was card-wide only. One line at the CardColumnField call site:
`headerValueLayout={attr.headerValueLayout || headerValueLayout}`. Lets a single cell deviate
from the card's ambient layout — the motivating case: a full-width `data_bar` (needs `col`;
`row` collapses it to content width — the documented data_bar gotcha) inside an otherwise
row-aligned stats card. BC: no existing column config sets the key.

## 3. Enrichment (additive) — `searchParamsCol` ported to Card link cells

TableCell already supported `searchParamsCol` (display one field, link by another column's row
value); Card.jsx's own link builder didn't — a Card link cell with `searchParamsCol` produced an
empty param (`?key=`). Ported the same branch (reads `source[attr.searchParamsCol]`, wins over
`searchParams` value modes; BC: only engaged when the attribute sets it). Motivating case: the
ticket detail's target-page link — displays `page_name`, links by `page_key`.

## Verify

Tickets page (npmrdsv5 `/sitemgmt/edit/tickets`): single Add-ticket button (no phantom);
resolution data_bar renders full-width inside the row-aligned stats card; existing text-styled
link columns (`view →`, ticket `#`) render unchanged.

## Files

- `packages/dms/src/ui/components/Card.jsx` — both changes, commented inline.

**Sync to transportNY** with the pending core batch. Follow-up candidate: surface the
per-column layout override in `Card.config.jsx` as an author-facing control.
