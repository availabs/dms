# Control room served stale ticket statuses — `fetchMode: smart` on live data

> **Status:** ✅ FIXED 2026-07-29 by configuration (`fetchMode: 'force'` on three control-room
> sections). No library change. One documentation/UX gap left open below.
> **Origin:** ticket 2191409 was `Resolved` in the database, but `/sitemgmt/tickets` kept rendering
> it as `Needs data / 2026-07-16` on a hard reload, indefinitely. #180 likewise showed `In review`
> when it was `Closed`. The KPI cards above the table were correct the whole time.

## What was actually wrong

**A configuration mistake, not a defect.** Per the fetchMode rule (Alex, 2026-06-13):

| mode | for | behaviour |
|---|---|---|
| `smart` | query fixed, but filter params (page variables) can change it | renders seeded rows, **refetches only on param change** |
| `cache` | data can't change between content publishes | never fetches; seeds *are* the content |
| `force` | rows change between loads with **no param signal** — live feeds, running counts | always fetches |

The control room's ticket list and ticket detail are the third case: statuses change in the database
with no URL or param change. They were set to `smart` **and** carried seeded rows, so they behaved
exactly as `smart` is specified to behave — painted the seeds and never re-queried. The seed snapshot
had been captured while the rows still read `Needs data`.

The KPI cards on the same page were right because they carry **no** seeds, so there was nothing to
paint and they queried.

## Mechanism, for future debugging

`data` is a persisted field of the v2 element-data schema (`schema.js:71` — "cached rows (for view
mode immediate rendering)"). `useDataLoader` seeds its dedup ref from it:

```js
// useDataLoader.js:91-96
const lastFetchKeyRef = useRef(
  state.data?.length && (state.externalSource?.source_id || state.externalSource?.isDms)
    ? computeFetchKey(state) : null
);
```

so `fetchKey === lastFetchKeyRef.current` is true on the **first** evaluation of the load effect,
which returns at line 272 without issuing a request. `force` sets `bypassDedup`, which is what makes
it exempt.

Symptoms to recognise: **live headline numbers above a frozen table on the same page**, and zero
network requests for the table's own columns. Confirmed here by instrumenting the effect —
`dedupSkip: true` for the table section, `false` for all ten siblings.

## Fix applied

`display.fetchMode = 'force'` on:

| section | page | type |
|---|---|---|
| 2196415 | 2185867 `tickets` (published) | Spreadsheet |
| 2195694 | 2185867 `tickets` (draft) | Spreadsheet |
| 2194783 | 2185870 `ticket` (published) | Card |

Their stale seeds were also cleared (plus the derived `display.totalLength`/`filteredLength`), which
is what made the difference immediately; `force` is what keeps them correct after any future editor
re-save re-seeds them. Cost is one query per view over a 108-row view — negligible.

Verified after: the list renders 108 live rows across 5 pages with current statuses (#180 `Closed`,
#2196812/#2197157 `Resolved`), and `/sitemgmt/ticket?id=2191409` renders `Resolved`.

## Still open — the trap, not the bug

A `smart` section whose seeds have gone stale is **indistinguishable from a working one**: no error,
no staleness indicator, no console warning. It silently presents old rows as current. That cost real
confusion here — a resolved ticket looked unresolved for a day, and the natural read was "the write
didn't land" rather than "this section is configured not to re-query".

Worth considering, in rough order of value:

1. **An authoring-time nudge.** The section Settings drawer could warn when `smart` is selected on a
   section with no `usePageFilters`/`searchParamKey` leaf — i.e. no param signal exists that could
   ever trigger the refetch, so `smart` is functionally `cache`. That is exactly the tickets table's
   shape, and it is statically detectable.
2. **An audit helper**, to find sections already in that state across the delivery sites: walk each
   page's `sections`/`draft_sections` and flag `mode !== 'cache' && seeds > 0 && no param leaf`.
   A throwaway version of this found all three sections above in the `sitemgmt` pattern.
3. Possibly a dev-only console note when a `smart` section skips its fetch because of seeds.

Also worth a look while nearby: the pattern-level **`preload_data`** switch
(`patternEditor/default/settings.jsx:483-485`) is `undefined` on all 19 patterns in npmrdsv5, so
route-loader preload is off everywhere and the path is unexercised. The switch writes to a local
`tmpValue` and only persists when the Save button is pressed
(`settings.jsx:298`, disabled while `isEqual(tmpValue, value)`) — flipping it alone does nothing,
which is a plausible explanation for a toggle that "didn't take". Note preload embeds fetched rows
into element-data (`preloadSectionData.js:145-158`), so a page saved from the editor while preload
was on persists that snapshot — which is one way a `smart` section acquires seeds it never asked for.
