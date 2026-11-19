# Page load: the router's hydration data carries drafts, the home page and copied metadata

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** built · **Release:** commit — uncommitted · **Created by:** amuro@albany.edu · **Edited by:** —

## Found

2026-11-17, after the BILD index ([setindex-composite-covering-indexes.md](./setindex-composite-covering-indexes.md))
made MitigateNY's risk profiles render in 3–4 s: their server-rendered HTML is 10–15 MB. Compressed it is ~0.8 MB on
the wire, but the browser still unpacks it, parses the HTML and `JSON.parse`s the router data before the page is
interactive, and the server builds and serializes it on every request.

Baseline on the hub (`mny.localhost:5555`, `MitigateNY_2025`, all 159 public pages, 2026-11-17):
**490 MB of HTML in total, 429 MB of it router hydration data** (`window.__staticRouterHydrationData`, a JSON string
inside a `JSON.parse`, which adds ~25 % escaping). Largest: flooding risk profile 15.2 MB; the other risk profiles
12–13 MB; the lightning risk profile 9.85 MB.

Lightning risk profile, broken down: hydration data 9.2 MB = loader key `3` (`data`, the 164 pages of the pattern).
Of the 7.39 MB raw:

| | MB | |
|---|---|---|
| this page's `draft_sections` | ~3.1 | drafts; view mode never shows them |
| this page's `sections` | ~3.1 | needed, but full of copied metadata (below) |
| the home page's sections + drafts | ~0.5 | the "page 0" fallback, expanded on every page |
| 162 other pages' nav fields | small | |

Inside the sections: map `symbologies` 1.8 MB (each map layer's 17 `interactive-filters` each hold their own
`hover-columns` copy, ~30 KB each), `externalSource` 0.64 MB (each Spreadsheet/Card stores the source's whole
column list, 348 columns ≈ 148 KB for AVAIL BILD).

## Cause

1. **Drafts in view.** The page pattern's list route (`/*`, `patterns/page/siteConfig.jsx`) requests
   `draft_sections` and `draft_section_groups` for every route, and the loader expands every `dms-format` key on
   the active page (`api/proecessNewData.js` `loadDmsFormats`; the sync path `api/index.js` `loadFromLocalDB`).
2. **Page 0 always.** Both resolvers also expand the first page of the list whatever the URL (`|| i === 0`,
   `if (idx === 0) return true`), the fallback for "no page registered at `/`".
3. **Copied metadata.** Section configs save copies of source/layer metadata they could look up.

## Plan

### Phase 1 — loader (steps 1 and 2) — built 2026-11-17

- [x] Drafts only on the edit route. The list route stops requesting `draft_sections` / `draft_section_groups`.
  The edit route's own request (`searchOne` with no attribute list) already reads the page's whole `data`, so
  the editor still gets its drafts with no change there.
- [x] Page 0's sections only when no item is active, in both resolvers (`proecessNewData.js`, the sync path's
  `needsRefResolution` in `api/index.js`). The root URL is still covered: the format's `defaultSearch` makes
  the root page the active item. A list with no id or wildcard (the admin's site row) still expands item 0.
- [x] Measured (below); rendered markup unchanged.
- [x] Loader run in Node (`dmsDataLoader` through Vite, as the dev render loads it), logged out:
  view → this page's sections, no drafts; edit → sections and drafts (44/44 on the lightning risk profile);
  `/` and `/edit` → the home page; an unknown slug → the home page as the fallback, as before.
- [ ] Signed-in editor check in a browser (open edit, add/change a section, save, publish). Not done: the test
  browser is signed out.

### Phase 2 — section data trimmed for view (step 3) — built 2026-11-17

- [x] A section registry capability `trimForView(elementData) → elementData`, applied by the page pattern's
  `preload` hook on view routes only, after the data preload (which builds its requests from the full
  settings). The core (`trimSectionsForView`) calls the capability; it names no section type.
- [x] DataWrapper sections (Spreadsheet, Card, Graph): `dataWrapper/trimForView.js` keeps the source columns
  whose name appears anywhere else in the section's settings (columns, filters, join, pivot, display,
  calculated SQL), so it keeps a superset of what the request reads. Sections with no chosen columns, names
  that aren't plain identifiers, and unreadable settings are left alone.
  - The client's fetch key (`useDataLoader computeFetchKey`) never reads the source column list, so the trim
    can't cause a re-fetch of preloaded rows. After mount `useDataSource` reads the source list and puts the
    full column list back (it already does whenever the saved copy is stale), so "Download → All Columns" and
    anything else that wants every column still has them.
- [x] Every Spreadsheet / Card / Graph section on the 159 pages, published and draft (958 sections, 948
  trimmed): `buildUdaConfig` builds **the same request** (`options`, `attributes`, `columnsToFetch`,
  `columnsWithSettings`, `skipFetch`) from the trimmed settings as from the full ones; 0 differ. Their settings
  go from 54.6 MB to 19.5 MB. (`outputSourceInfo` differs only by carrying the column list; it describes the
  output for the editor's chaining picker, isn't saved and isn't part of the request.)
- [ ] ~~Map: one `hover-columns` per layer~~ **Not done, can't be done safely in view.** Within one layer
  the interactive filters' `hover-columns` really differ (the lightning risk profile: one layer has 16
  distinct lists, three have 3), and selecting a filter spreads its settings over the layer
  (`section/index.jsx`), so a filter without its own list would keep the previous filter's. Maps are now the
  largest part of a risk profile (1.8 MB on lightning). Fixing it means changing what the map saves (below).

### Later (own task)

Stop saving the copies: the editor reads the column list from the source, and a migration removes the stored
copies. For maps, an interactive filter would store only what it changes from its layer.

## Results

All 159 public `MitigateNY_2025` pages on the hub (dev SSR, logged out):

| | HTML, all pages | of which hydration data | lightning risk profile | flooding risk profile |
|---|---|---|---|---|
| before | 490.4 MB | 428.7 MB | 9.85 MB | 15.23 MB |
| phase 1 | 228.0 MB | 166.3 MB | 4.93 MB | 7.89 MB |
| phase 2 | **201.5 MB** | **139.9 MB** | **3.87 MB** | **6.14 MB** |

- Rendered markup (scripts and comments removed) is byte-identical for every page but 5–7 hazard pages, which
  differ between two runs **of the unchanged code** as well: tied values in a ranked county list come back in a
  different order (Orleans/Oneida, Warren, Kings…). Checked by hand each time.
- Lightning risk profile in Chrome, trim on vs off (3 runs each): 0 hydration errors either way; no data
  re-fetch after load in most runs either way. An occasional run re-fetches 10–16 preloaded sections, with or
  without this change, and with no preload over budget: a pre-existing intermittent re-fetch, not looked into.
- Library tests: 99/99 (`npx vitest run src/dms/packages/dms/src`), including the new `trimForView.test.js`.

## Found on the way (not this task)

- **Client-side navigation to a hazard page keeps the old content.** In Chrome, on `/assess_risk/natural_hazards`,
  clicking the Lightning link changes the URL (no document load) but the page still shows the Natural Hazards
  overview. Same with every change in this task undone. A raw `history.pushState` + `popstate` navigation also
  throws `sectionSource.find is not a function` in `SectionGroup` (a page row whose `sections` were never
  expanded, so still the JSON string), again with this task's changes undone.
- The occasional re-fetch of preloaded sections after hydration (above).

## Files

- `api/proecessNewData.js` — the first item expanded only when no item is active
- `api/index.js` — the same rule in the sync path (`loadFromLocalDB`)
- `api/preloadSectionData.js` — `trimSectionsForView(data, slug, components)`
- `patterns/page/siteConfig.jsx` — list route without the draft fields; the `preload` hook trims on view routes
- `patterns/page/components/sections/components/dataWrapper/trimForView.js` (new) + `trimForView.test.js` (new)
- `ComponentRegistry/spreadsheet/config.jsx`, `Card.config.jsx`, `graph_new/config.jsx` — `trimForView`

## Testing checklist

- [x] Size and markup sweep, all 159 pages, before / phase 1 / phase 2
- [x] Loader output for view, edit, root, edit root and an unknown slug
- [x] Request equivalence for all 958 data sections
- [x] Chrome: hydration errors and post-load requests, trim on vs off
- [x] Unit tests
- [ ] Signed-in editor in a browser: edit a risk profile, save, publish; view → edit → view client-side
- [ ] A production build (`npm run build`) and the same sweep against it
