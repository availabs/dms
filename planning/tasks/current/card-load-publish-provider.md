# Card: `load_publish` provider (component-actions parity with Spreadsheet)

> **Status:** ✅ BUILT 2026-07-17, verified live on tsmo2/incident_view (dev). Rides the next
> git sync/deploy.
> **Driver (Alex):** corridors on the incident view must be labeled by
> `string_agg(distinct road)` from the TMC shapefile-v6 meta — which forces the
> Delay-by-corridor spreadsheet to JOIN meta with a `meta.year` filter, and it can't consume
> `metaYear` because it was the section publishing it (deadlock). The year is a property of
> the EVENT, so the event-header **Card** must publish it — Cards had no `load_publish`.
> (Also unblocks the incident-dot phase of the same redesign: the event Card can publish
> `incidentTod` etc.)

## Change (additive/BC)

`patterns/page/components/sections/components/ComponentRegistry/Card.jsx` — a `load_publish`
effect mirroring the Spreadsheet's (spreadsheet/index.jsx): when the Card's data arrives,
derive a row (`first` / `max` / `min` over `args.metric`) and publish `args.publishes[]`
(or single `args.column` → provider `paramKey`) column values to page action params, with
`publishedRef` value-dedupe and empty-result `emptyValue` sentinel publishing.

**Card-specific guard:** Cards PERSIST fetched rows in the saved config (`state.data` seeds
first paint), and publishing from that seed would broadcast stale values (last-authored
event's date/year) before the live fetch lands. The effect publishes only once `state.data`'s
**identity** differs from its mount-time value — a completed fetch always produces a fresh
array even when contents are identical, so same-data fetches still publish exactly once.
(The Spreadsheet variant instead keys off `display.totalLength !== undefined`, which is
useless for Cards because `totalLength` is saved into the config.)

`Card.config.jsx` — `componentFunctions.providers` gained the matching **author-facing
descriptor** ("On Load: Publish Derived Row"), same shape as the Spreadsheet's, so the
provider is reachable from the section Actions panel, not just programmatic builds.

## First consumer

tsmo2/incident_view event-header Card (page 2182470, builder
`build_tsmo2_incident_view.mjs`): two `selectOnly` calculated columns
(`to_char(start_date_time::timestamp, 'YYYY-MM-DD') as evt_date`,
`extract(year from start_date_time::timestamp)::int as evt_year`) + provider publishing
`activeDate` / `metaYear` (derivation `first` — single event row). The Delay-by-corridor
spreadsheet now consumes `metaYear` (requireResolved) to join TMC meta 582/**v984 (pg)** and
label corridors `coalesce(nullif(trim(string_agg(distinct meta.road, ', ')), ''), 'corridor '
|| ds.tmclinear)`, while still publishing `activeTmcLinear` (click_publish + row_highlight +
load_publish on the same hidden `ds.tmclinear as corridor` identity column).

## Verified

- Publish chain on dev: event Card → `activeDate`/`metaYear` → corridors table (gated) →
  `activeTmcLinear` → Delay-by-TMC + speed grid + fused header Cards. Corridor click
  re-scopes everything; corridor labels are road names ("I-495", "CROSS ISLAND PKY"),
  falling back to `corridor <tmclinear>` when meta has no/blank road.
- No publish from saved seed rows (guard) — fresh-fetch-only confirmed by the gated
  corridors table rendering correctly on a cold load.
