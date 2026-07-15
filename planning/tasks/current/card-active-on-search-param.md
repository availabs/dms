# Card cell enrichment: `activeOnSearchParam` — link cell active when its params match

**Status:** NOT STARTED
**Topic:** patterns/page (Card)
**Driver:** MNY Action Prioritize Phase 3 #2.

## Objective

Give a Card **link cell** (`isLink` + `location: "?key=value"`) a real **active state**: when the
page's current search params already match the cell's own `location` params, the cell renders a
named active style. Replaces the current hack (a hardcoded `cellBgColor` on one cell that never
changes) used by the Action Prioritize stat strip.

## Current behaviour

A Card cell with `isLink:true` + `location:"?implementation_status=Proposed"` navigates on click
(writes the search param). It has NO way to know it is "the currently selected filter", so authors
fake it with a fixed `cellBgColor`. The stat strip's "All" cell is permanently tinted regardless of
the live filter.

## Change (additive, opt-in, BC)

Add a per-column / cell flag **`activeOnSearchParam`** (boolean). When true, at render the cell:
1. parses its own `location` query string into `{key: value}` pairs;
2. reads the live page filters from `PageContext` (the Card section is inside the page pattern —
   `PageContext.pageState.filters` and/or the URL search params; use the same source the link cell
   already uses to build/read params — inspect how `usePageFilters` leaves resolve values);
3. if every param in `location` matches the current page value for that key (treat the empty/`"?"`
   location = the "All / no filter" state, i.e. active when NONE of the group's params are set),
   applies the active style.

The active style is a named style resolved from the theme (e.g. an `activeStyle` name on the column,
falling back to a theme default). Do NOT invent a new colour in the component — pull the class from
the theme (mny will supply it). A sensible key: `column.activeStyle` (a `theme.dataCard` style name)
or a dedicated `dataCard` key like `cellActive`. Match how other named styles resolve in Card.

## Files

- `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.jsx`
  — cell render: read `PageContext`, compute active, apply the class.
- `.../ComponentRegistry/Card.config.jsx` — add the `activeOnSearchParam` control (a boolean toggle)
  near the existing `isLink`/`location` controls, and (if used) an `activeStyle` selector.
- Possibly the Card/dataCard theme default for the active class (library default; mny overrides).

## Investigate before coding

- How the Card cell currently reads/uses `location` and `isLink` (search `Card.jsx` for `location`,
  `isLink`, `linkText`, navigate).
- How the Card accesses page filters: `PageContext` import + `pageState.filters` shape (see
  `patterns/page/.../context`); the stat cells on page 2262755 use `usePageFilters` leaves — the same
  param values must drive "active".
- How existing named cell styles resolve (so the active class comes from theme, not hardcode).

## Backward compatibility

Opt-in flag, default off → every existing Card renders identically. No change unless
`activeOnSearchParam:true` is set on a cell.

## Testing checklist

- [ ] A cell with `activeOnSearchParam:true` + `location:"?implementation_status=Proposed"` gets the
      active style ONLY when the page's `implementation_status` === `Proposed`.
- [ ] The "All" cell (`location:"?"` / empty) is active only when no status filter is set.
- [ ] Changing the filter moves the active state between cells (no stale hardcoded tint).
- [ ] Default off: existing cards unchanged. Fast-Refresh clean; lint passes.

## Notes

Consuming page: dms-template 2262755, Card section 2262757 (the 4 stat cells). Wiring the flag +
removing the fake `cellBgColor` is the ORCHESTRATOR's job after this ships. Do not edit the page or
publish here.
