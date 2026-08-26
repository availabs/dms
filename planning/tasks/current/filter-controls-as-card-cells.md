# Filter controls as Card cells (`filter_control` columnType) — scoping

## Status: PROPOSAL (2026-08-25) — decision + design wanted before any code

## The question (owner, 2026-08-25)
"Is there a world where we just deprecate the Filter component and use the Card component to lay
out filters, because Card has so much better layout control?"

## Assessment

**Don't deprecate the Filter section** — but the instinct is right, and there is a clean path to
Card-grade layout for filters.

What the Filter section actually is, post the 2026-08-25 theming pass:
- Its CONTROLS are already the shared columnType components (`ColumnTypes.multiselect` /
  `ColumnTypes.text`), themed via named styles (`theme.filters.<style>.controlStyle` →
  `theme.multiselect`/`theme.input` styles). Look is no longer the gap.
- Its LAYOUT is the gap: one wrapper + one flex/grid list (`gridSize`), label-beside-control rows.
  No tracks templates, no spans, no per-control placement, no group headers — everything the
  Card's cells-grid does well. The dashboard works around it with sibling lexical headers and two
  side-by-side Filter sections; the mockup's single 3-group panel isn't expressible.
- It also carries real machinery Card has none of: the filter TREE (leaf ops, OR search groups,
  option fetching scoped by sibling leaves, unary toggles, active tokens, clear-all, page-variable
  sync). Deprecating it means rehoming all of that; hundreds of live sections bind it.

**The enrichment path: a `filter_control` columnType.** A Card cell whose "value" is a filter
control: config names the source column, the op (`filter`/`like`/`empty`), the `searchParamKey`,
placeholder, and control style; the cell mounts the same control components and writes page
variables directly (`updatePageStateFilters`), with options fetched from the Card's own
`externalSource` (reuse `useColumnOptions`). Then a filter bar is just a Card — tracks templates,
group-header cells, count cells, spans — and the Filter section remains for the simple
one-row case and for everything already live.

Design questions to settle before building:
1. State contract: page-variable-only (no section filter tree)? That covers the dashboard's bar
   (every leaf there is `usePageFilters` anyway) and dodges the tree-editing UI entirely.
2. Option scoping: which sibling constraints narrow a control's option list (the Filter section
   uses same-AND-group leaves; a Card cell would want "the other filter_control cells on this
   card" + authored static leaves).
3. Edit-mode UX: the column-config surface (column picker → op → searchParamKey → placeholder →
   control style) and how it composes with existing Card column controls.
4. Clear-all / active tokens: card-level display toggles mirroring `showClearAll` /
   `showActiveTokens`.
5. BC: purely additive columnType; no change to the Filter section.

## Motivating use
MNY Actions Dashboard filter bar (mockup `pages/county-actions/dashboard.html`: one tinted panel,
three labeled groups, search on its own line, result count in the header) — currently approximated
with 2 Filter sections + 3 lexicals + 1 count Card. See root-hub task
`planning/mitigateny/tasks/current/actions-dashboard-live-build.md`.
