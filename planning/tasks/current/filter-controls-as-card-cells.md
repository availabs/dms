# Filter controls as Card cells (`filter_control` columnType)

## Status: IMPLEMENTED 2026-08-25 (owner approved same day) — live-verified on the MNY Actions Dashboard

**What shipped:**
- `patterns/page/components/sections/FilterControlCell.{jsx,theme.js}` — the cell component
  (select via `MultiSelectEdit`, search via `Input`; label + control inside a themeable wrapper,
  key `filterControlCell`). Column config: `name` (options source + default param), `searchParamKey`,
  `controlOp` (`filter`|`like`), `isMulti`, `placeholder`, `controlLabel`, `activeStyle` (names a
  `theme.multiselect`/`theme.input` style, e.g. `pill`).
- Registered as `filter_control` in `patterns/page/siteConfig.jsx` (module scope,
  `registerColumnType`) — appears in the Card column Type picker automatically.
- Card.config.jsx: five wiring controls (`Search Param`, `Control Op`, `Multi Select`,
  `Placeholder`, `Control Label`) gated on `type === 'filter_control'`.
- **buildUdaConfig drops `filter_control` columns at intake** (same spot the inactive
  comparison-series columns drop). This is load-bearing: leaving them in `columns` while excluding
  them from the fetch recreates the present-but-unfetched poison — the section's data request dies
  and the whole Card renders empty (hit during this build; length query fine, zero rows out).

**Design answers (as scoped, all confirmed in the build):**
1. State contract: page-variable-only — reads `pageState.filters`, writes
   `updatePageStateFilters`; no section filter tree, so no tree-editing UI.
2. Option scoping: the HOST CARD's own authored filter tree, pruned of any leaf wired to this
   control's page variable or naming its column — a geoid leaf county-scopes every picker,
   siblings cascade, and a control never narrows away its own alternatives.
3. Edit-mode UX: the five column controls above + the existing per-column `activeStyle`
   ("Column Type Style") for the control's named style.
4. Clear-all / count: not control features — a static link cell (`origin:'static'`,
   `isLink`, `location:'?'`) and an aggregate calc cell on the same card do both jobs.
5. BC: purely additive; the Filter section is unchanged and NOT deprecated.

**Verified live** (dashboard page 2410892, one Card = the mockup's single tinted panel: 2 group
headers + live count + clear-all + search pill + 4 select pills on a 5-track grid): picking
"Bethel (Town)" wrote `?jurisdiction=…`, table 474→25, strip/charts/count followed, token-in-pill
+ branded menu rendered.

**Round 2 (2026-08-25, same day) — design-parity options added, all additive:**
- `controlIcon` — Icon-registry glyph before the label/control (the mockup's icon-only search
  pill); themed via `filterControlCell.icon`.
- `controlOp: 'toggle'` + `controlValue` — a checkbox writing a fixed value to the page variable
  (the Key-Characteristics / workspace-toggle control kind; no live consumer until the flag
  fields become physical columns). Theme keys `toggleWrapper`/`checkbox`.
- **Debounced `like`** (400ms, local buffer, external changes re-seed) — a search keystroke no
  longer navigates per character; URL-seeded values and Clear all round-trip correctly.
- `excludeOptionValues` / `optionLabels` — design-vocabulary shaping of the option list (hide the
  `NA` sentinel; label `Discontinued/Paused` → "Discontinued"); written values stay raw.
- Card display knobs `cardsRadius` + `cardsBorderColor` (Card.layout.js `resolveCellsGridStyle`,
  siblings to `cardsBgColor`) — the panel card's rounded corners + hairline border without a
  theme change. Config controls added for all of the above.

Verified: mid-typing URL stays clean, one write after the pause (`?search=culvert` → 63 rows);
`?search=` deep-link seeds the box; Clear all converges (474, box empties); status menu shows no
`NA` and the "Discontinued" label. Residuals: no hairline group divider (`cellBorderColor` is a
4px accent — groups separate via a fixed 40px spacer track), no exact 11px-uppercase eyebrow
token (deferred token-set decision), "of N" unfiltered total not expressible in a single filtered
query.

---

Original scoping doc below, kept for the reasoning record.

## Status when scoped: PROPOSAL (2026-08-25)

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
