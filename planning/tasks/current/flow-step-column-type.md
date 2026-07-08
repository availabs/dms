# `flow_step` columnType — lifecycle flow-strip boxes

> **Status:** ✅ BUILT (2026-07-06). BC, additive.
> **Origin:** TransportNY control-room tickets page — the `sitemgmt-tickets.html` mockup's
> "Where tickets stand" flow strip (dot · label · count boxes with `›` connectors and an
> emerald-tinted terminal box). Chosen with the user over accepting the deviation.

## What it is

A small, focused chrome columnType (per the themes-guide bar: renders ONE visual element; the
Card grid lays the steps out). Each cell = one step of a lifecycle funnel:
`[status dot · label · count]` in a rounded box, optional `›` lead-out connector (sits in the
cells-grid gap), optional tinted variant for the terminal (done) step.

- Value = the cell's count (typically an aggregate calc column).
- Label = the column's `customName`/`display_name` (author-controlled, like any column).
- Column attributes: `stepColor` (theme `dots` key: neutral/info/warn/done by default),
  `stepTint` (truthy → terminal variant), `connector` (truthy → renders the `›`).
- Themed via `flowStep` (getComponentTheme), neutral inline defaults as fallback;
  transportny brand pass in `src/themes/transportny/themev2.js` (Oswald label/count, ink).

## Files

- `packages/dms/src/ui/columnTypes/flow_step.jsx` — new (FlowStepView/FlowStepEdit, named
  exports, Fast-Refresh clean; Edit = read-only chrome).
- `packages/dms/src/ui/columnTypes/index.jsx` — registered as `'flow_step'`.
- Site theme: `dms-template/src/themes/transportny/themev2.js` `flowStep` key (additive).

## BC

Purely additive new type; no change to existing types or themes. **Sync to transportNY** with
the pending core batch (flow_step.jsx + index.jsx + themev2.js).

## Verify

Tickets page (`/sitemgmt/edit/tickets`, npmrdsv5): flow strip renders 4 boxes with dots
(slate/sky/amber/emerald), `›` connectors between, emerald tint on "Resolved / closed", counts
correct vs the status pills in the table.
