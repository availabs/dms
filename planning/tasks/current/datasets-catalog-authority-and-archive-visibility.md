# Datasets catalog — show authority on the sources list; keep archived sources out of search and pickers

**Initiatives:** [mny_dama_hygiene](../../../../../planning/initiatives/mny_dama_hygiene.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** built · **Release:** commit — library + dms-server + `src/themes/_legacy/datasets.js` + the v6 mockup are uncommitted; then deploy dms-server (for `superseded_by`) and the MNY / TransportNY frontends, and sync `_legacy/datasets.js` with the TransportNY theme copies · **Created by:** amuro@albany.edu · **Edited by:** —

**Project:** DMS library · **Topic:** patterns/datasets + page/dataWrapper · **Started:** 2026-10-21 (created 2026-10-14)

> Split out of the MitigateNY close-out task
> [`hazmit-dama-closeout.md`](../../../../../planning/mitigateny/tasks/current/hazmit-dama-closeout.md)
> (Phases 4 and 6), which drives it to done. Builds on two built tasks it must not duplicate:
> [`datasets-authoritative-views.md`](./datasets-authoritative-views.md) (the `authority` record, the Versions
> card badges and the picker ★) and
> [`datasets-lifecycle-listing-and-sandbox-promotion.md`](./datasets-lifecycle-listing-and-sandbox-promotion.md)
> (the per-pattern hidden lifecycle set and the `some` rule).

## Objective

- **A. Authority on the list.** A reader scanning the catalog should see, per source:
  - whether it has an authoritative view;
  - which one, by label and date, or how many when keyed;
  - or that it is undecided;
  - and, when lineage says so, what superseded it.

  Today authority shows only on the source's own Versions card and in the version pickers.
- **B. Archived out of the main view.** A source in a hidden lifecycle (Archive, Data Processing, Sandbox,
  Uploaded File) shouldn't appear in:
  - the default list;
  - **search** and **"Show all"**;
  - the page editor's **source pickers**.

  It stays reachable on purpose, through the signed-in lifecycle buckets or an explicit toggle.

## Current state (library code, 2026-10-14; corrected 2026-10-21)

- **The list** (`patterns/datasets/pages/DatasetsList/index.jsx`):
  - `visibleSources` hides a source when any of its top-levels is in the pattern's resolved hidden set
    (`utils/lifecycle.js` `resolveHiddenForPattern` / `isSourceHidden`).
  - But `if (isListAll || isSearching) return sources || []`, so **search (more than 2 characters) and
    "Show all" return every source**, archived included.
  - Signed-in users get the hidden lifecycles as sidebar buckets (`hiddenBuckets`).
- **Authority** (built in `datasets-authoritative-views.md`):
  - helpers in `utils/authority.js`: `authoritativeViews`, `isAuthoritative`, `authorityState`
    (undecided | single | keyed), `keyLabel`;
  - the list cards don't read any of them.
  - **Correction (2026-10-21):** `authority` is *not* in the list's source attributes. The list fetches
    only `name, type, categories, description` (+ `app` for internal), and leaves `metadata` out on
    purpose: it is tens of KB per DaMa source (`utils/datasources.js` `buildEnvsForListing`). So "no
    extra request" isn't possible. `authority` has to come in **its own request** per env, because an
    older server reads it as a column and fails the whole batch. `api/index.js` already has
    `udaGetSourceAuthorities` for this.
  - **An authority entry carries only `view_id`.** To show the view's label (2354 → "01/29/2026") the
    list needs `uda[env].views.byId[ids]`: `version` on DaMa, `name` on DMS. That is one more batched
    request per env, for the authoritative view ids only.
- **Lineage on the source:** `metadata.superseded_by` (one source id) / `supersedes` (a list), written
  by the MNY retag on 14 sources. **Not reachable from the list either** (it lives in `metadata`). The
  server needs a derived, read-only attribute like `authority` (`uda.controller.js` `getSourceById`
  already reads `metadata` into `__authority_meta` for it), fetched in its own request.
- **Server lifecycle floor:** `uda.controller.js` `getHiddenCategories` honours `hidden_categories`
  only when it is an absolute array. An env whose settings hold the `{hide, show}` delta (the shape the
  settings page writes) hides nothing server-side. **All lifecycle filtering is client-side.**
- **Pickers:**
  - the dataWrapper source select (`page/components/sections/components/dataWrapper/useDataSource.js`
    `getSources`) lists every source in the env with no lifecycle filter. External envs fetch
    `['name', 'metadata']` (`render/spa/utils/index.js` `buildDatasources`), not `categories`.
  - **Source objects are merged into the section's persisted `externalSource`** (both on load and on
    pick), so `categories` must be fetched but kept out of them (same rule as `authority`).
  - The menu that renders it is `page/components/sections/sectionMenu.jsx` (Dataset › Source, and
    Join Dataset › Source).
  - the map's source selector lives in the app now (`dms-template/src/patterns/mapeditor/.../SourceSelector`),
    so its change is tracked in the MNY close-out task, not here.
- **Design:** the live library default catalog theme is the **tessera v6** port
  (`dms-template/src/themes/tessera/design_system_v6/pages/datasets-catalog.html`,
  `datasets-page-pattern-v6-port.md`). Project themes (MNY, TransportNY, …) render the pre-v6 look
  through `dms-template/src/themes/_legacy/datasets.js` (`withLegacyDatasets`).
  - So the mockup goes in the **v6 page**. The TransportNY v2 page (`…/dms_design_system_v2/pages/datasets-catalog.html`)
    predates the live catalog (no Hidden group, no uploads toggle) and is not its source.
  - Each new theme key gets a v6 default in `datasetsList.theme.js` **and** a value in
    `_legacy/datasets.js`. Otherwise MNY falls back to v6 classes built on `--t-*` tokens it doesn't
    define.
  - Existing chips to reuse: `verAuthBadge` (v6 go-soft green / legacy blue) and `verUndecidedChip`
    (amber), from the source Overview's Versions card.

## Proposed changes

### Part A — authority indicators (design first) — BUILT

**Owner decisions (2026-10-21)**, from the mockup's review panel:
1. **Undecided:** ~~the amber `undecided` chip, shown to everyone~~ → **revised the same day: no chip.**
   An undecided source's card and table cell stay blank ("can be blank", owner). The facet keeps its
   "undecided" filter row. A theme can still opt in through `authUndecidedChip`, which is `''` by
   default in both the v6 and legacy values.
2. **Table view:** its own **"authoritative view"** column, between type and category.
3. **B3, hidden matches in search:** a **labelled group under the results** ("in hidden lifecycles ·
   N", signed-in only), in every view, not a toolbar toggle.
4. **Extras: both ship.** The "superseded by <name> →" line under the title (needs the derived
   server attribute), and the **authority facet** in the rail (authoritative · keyed · undecided).
   The facet is for everyone, since undecided is.

- [x] **A1 · Mockup** in the v6 `datasets-catalog.html`, for all three views — converged 2026-10-21 (decisions
      above). The page now carries only the chosen variants. The review panel and the unchosen ones
      are gone.
  - A **review panel** (bottom right, marked `REVIEW ONLY`) switches each option live. URL params
    also select them, for screenshots: `?und=amber|muted|none&sup=line|off&tbl=column|inline&facet=on|off&hs=group|toggle&view=grid|cards|table&q=flood&hsOn=1`.
  - The page is generated: `inject_options.py` in the session scratchpad
    (`catalog-mockup/`) rewrites it from a pristine copy. After the choice, strip the unchosen
    variants and the panel by hand.
  - Tokens reused, no new ones:
    - single / keyed chip = the Versions card's `verAuthBadge` look (`text-go bg-goSoft`, `★` as on
      the source page's version select);
    - undecided = `verUndecidedChip` (amber), or a dashed pencil outline for the signed-in-only
      variant;
    - superseded = `t-proseXS text-amber` plus a cobalt link;
    - lifecycle chip on hidden matches = the type badge's outline plus the rail's EyeOff icon.
  - Options to show:
  - a chip on the card's badge row: `★ 01/29/2026` (single) · `★ 3 keyed` (keyed, tooltip lists
    `keyLabel`s) · `undecided` (muted; admins only?);
  - a "Superseded by <name>" line or link when `metadata.superseded_by` is set;
  - a table-view column "Authoritative view";
  - a sidebar/filter facet: Authoritative · Undecided · Keyed.
- [x] **A2 · Data:**
  - one batched `authority` request per env after the list loads (`udaGetSourceAuthorities`), a
    failure reading as undecided;
  - one batched view-label request per env for the authoritative view ids (DaMa `version`, DMS
    `name`);
  - (if the superseded line is chosen) a derived `superseded_by` source attribute on dms-server, read
    from `metadata` like `authority`, fetched in its own request; the name comes from the loaded list.
  - Kept in a map beside `sources`, not on the cached source objects.
  - **Built:**
    - server: `uda.controller.js` `METADATA_DERIVED_ATTRS` (`authority`, `superseded_by`) reads
      `metadata` once (`__derived_meta`) for whichever derived attributes a request names;
      `readSupersededBy` returns an integer or null;
    - client (`api/index.js`): `udaGetSourcesSupersededBy` and `udaGetViewLabels` (DaMa `version`,
      DMS `name`), both fault-tolerant, beside `udaGetSourceAuthorities`;
    - `DatasetsList` fetches per env after the sources load, skipping `file_upload` sources (11k on
      hazmit_dama). It keys by `${srcEnv}|${id}`. A source whose authority request failed has no
      entry and renders no chip; undecided is shown only when the server says so.
- [x] **A3 · UI** (`DatasetsList/index.jsx`): `AuthorityChip` (badge row and the table's
      "Authoritative view" column), `SupersededLine` (under the title in cards and table rows), the
      rail **authority** facet, and `HiddenMatches` (B3). `utils/authority.js` `authoritySummary`
      gives `{state, text, title}`.
  - Theme keys, v6 in `datasetsList.theme.js` and pre-v6 in `_legacy/datasets.js`:
    - `authChip`, `authUndecidedChip`, `supersededLine`, `supersededLink`;
    - `sidebarFacetGroup`, `sidebarFacetLabel`, `sidebarFacetMark`, `sidebarFacetBadgeUndecided`;
    - `hiddenMatch*` and `lifecycleChip*`;
    - `columnSizes.authority`.

    No `className` passthroughs. An empty `sidebarFacetGroup` / `hiddenMatchWrap` turns that piece off.
  - **Design notes:**
    - The facet shows only once some source in view is marked. On an env with no authority, like
      TransportNY today, it would be one "undecided" row repeating the cards.
    - Facet counts follow the category and the search.
    - The legacy chip doesn't uppercase view labels (they are data, like category names). The
      `undecided` chip stays uppercase, like the type badge.
    - A view with no label shows `v<id>`, as the Versions card does. Many hazmit_dama views have
      no `version`, e.g. 13526, 2024, 1883.
- [x] Unmarked sources render as today (BC): no chip, because `authUndecidedChip` is `''`, so
      `AuthorityChip` returns null for them. A theme that sets the key gets the chip back.

### Part B — lifecycle-aware search, "Show all" and pickers — BUILT except B3 (waits on the mockup)
- [x] **B1 · Helper** `utils/lifecycle.js` `catalogVisibility({sources, hiddenSet, legacyFiltered,
      listAll, keep})` → `{visible, hidden}`. One rule for every mode: a source in a hidden
      lifecycle is never `visible`. "Show all" adds uncategorized + legacy-`filtered_categories`
      sources. `keep(source)` keeps explicitly requested uploads visible (the uploads toggle). Also
      `hiddenLifecycleOf(source, hiddenSet)` (the lifecycle's name, for labels) and
      `inHiddenLifecycle`, which `isSourceHidden` now uses for its ANY rule.
- [x] **B2 · List** (`DatasetsList/index.jsx`): default, search and "Show all" all start from
      `visible`, so search and "Show all" no longer surface hidden lifecycles. `hiddenBuckets` is built
      from `hidden`. The main rail never lists a hidden lifecycle name, even under "Show all"
      (`!hiddenSet.has(c)` is now applied in every mode).
  - **Design note:** search now filters the **current mode's pool** (it used to search every
    source). That's what the approved v6 empty state already says: "Search covers names and
    categories… or turn on *show all* to include filtered and uncategorized sources". So in the default
    mode a search no longer finds uncategorized or legacy-filtered sources until "Show all" is on.
- [x] **B3 · Search treatment (design choice, same mockup):** either an explicit "include hidden
      lifecycles" toggle (signed-in), or hidden matches in a separate, labelled group under the
      results (signed-in). **Chosen: the labelled group.** Built as `HiddenMatches`: signed-in, while
      searching, from `catalogVisibility(...).hidden` × the category path × the search. It is not
      shown while browsing a hidden bucket or the uncategorized filter. It sits inside the grid /
      stack, so it scrolls with the cards. In the table and empty states it goes in a block column
      (`hiddenMatchColumn`) with them, only while the group shows.
  - **Seen live:** "bild" gives 13 results and 80 in the group. The group has no cap. If that proves
    long, a follow-up could cap it and link to the bucket.
- [x] **B4 · dataWrapper source select** (`useDataSource.js` + `sectionMenu.jsx`): exclude sources in
      the env's hidden lifecycles by default.
  - `categories` fetched in the same `byIndex` request but kept out of the source objects (like
    `row_type`); env `settings` fetched per external env.
  - Hidden set = `resolveHiddenForPattern(settings, null)`: the library default set
    (`LIFECYCLE_DEFAULTS`) plus the env floor. The pattern-level set isn't available in the page
    editor.
  - A section that already binds a hidden source (main or join) still lists it, marked with its
    lifecycle, so nothing breaks.
  - A "show hidden datasets" toggle in Dataset › Source and Join › Source for the deliberate case.
  - **Built:** `getSources` returns `{sources, categoriesById}`; `getHiddenSets` reads
    `uda[env].settings` per external env (a DMS env takes the first external env's set, as its
    catalog does). `hiddenLifecycleBySource` is kept in hook state, not on the source objects.
    `sourceOptions` filters unless `includeHiddenSources` is on or the id is bound (main source or
    any join). Hidden entries are labelled `Name [env] · Archive`. The hook also returns
    `hiddenSourceCount`, `includeHiddenSources` and `setIncludeHiddenSources`. The menu shows a
    `Show hidden datasets (N)` toggle at the top of both Source lists, only when N > 0.
  - **Design note:** the switch is labelled "Show hidden datasets", not "include archived". It also
    reveals Sandbox / Data Processing / Uploaded File, and the catalog calls the same group "Hidden".
- [x] **B5 · Tests:** `packages/dms/tests/datasetsLifecycleVisibility.test.js`, 16 passing
      (`npx vitest run src/dms/packages/dms/tests/datasetsLifecycleVisibility.test.js` from dms-template).
  - Helpers: default / Show all / search over both pools / the uploads `keep` / a pattern that shows
    Archive / the env floor.
  - The picker: mounts the real `useDataSource` with a minimal fake Falcor client (happy-dom). It
    checks that:
    - hidden sources are left out;
    - the switch lists them, labelled;
    - a section bound to an archived source still lists it as its current value, and so does a
      join's hidden source;
    - the env floor can un-hide a lifecycle;
    - the refreshed `externalSource` never picks up `categories`.
  - "A bound page still renders" isn't unit-testable here. Nothing in `getData` reads lifecycle, so
    it's left to the live check.

## Testing checklist
- [x] Mockup approved (Part A + the search treatment), 2026-10-21.
- [x] Unit tests: `packages/dms/tests/datasetsLifecycleVisibility.test.js`, 21 passing (lifecycle
      helpers, the picker hook, `authoritySummary`). Full client suite: 752 passed; the 12 failures are
      pre-existing and untouched by this task:
  - `avlGraphThemeDefaults` and 2 in `syncDeltaConvergence` are the known-red ones;
  - `radioTheme`, `userMenus` and `sectionGroupCollapsible` import nothing changed here. The last
    one's UI stub has no `Button`, which `sectionGroup` has used since 2026-10-16.
- [x] Server: `node tests/test-uda.js` (SQLite) 143 passed, including the new `superseded_by` checks
      (DaMa: derived, null when unset, alongside real and derived attributes; DMS: JSON-text metadata).
- [x] **Local against production data (reads only), 2026-10-21:** a spare-port Vite on :5199
      (`VITE_DMS_APP=mitigat-ny-prod`, API `dmsserver.availabs.org`), signed in with a minted token
      (owner's permission), `/cenrep`.
  - Chips read right: 1649 → `★ 01/29/2026`, "BILD 2026 Simplified Draft V1" → `★ 02/03/2026`, Fusion V2 →
    `★ AVAIL - Fusion Events V2 (12/10/2024)`, unlabelled views → `★ v13526`.
  - Facet: authoritative 46 · keyed 3 · undecided 151 over the default 200.
  - "bild v3": results = V3.1 only; group = the archived V3.2–V3.6. Same under "Show all".
  - "Show all" + "archive": 0 results, 23 in the group, matching the Archive bucket (23).
  - Default 200 datasets, "Show all" 255. No page errors.
  - The prod server predates `superseded_by`, so no superseded lines showed. The request failed
    quietly, as designed.
  - Table view: the "authoritative view" column and the group under the table.
- [ ] After the deploy, on devmny.org `/cenrep`:
  - "superseded by" shows on the retagged sources (e.g. 1480/1117/1505 → 1649, in the Archive
    bucket or the group once archived);
  - spot-check 1567 keyed;
  - an Archive-tagged source is absent from the default list, search and "Show all", and present in
    the signed-in Archive bucket (verified locally above);
  - the section source picker omits hidden sources unless "Show hidden datasets" is on, and a page
    bound to an archived source still lists it and still renders. Unit-tested; not clicked live,
    to keep the local session read-only.
- [ ] TransportNY catalog: unchanged. Its envs carry no authority, so there are no chips (undecided is
      blank) and no facet until something is marked. Needs the theme sync (`_legacy/datasets.js`).

## Files

| file | change |
|---|---|
| `packages/dms/src/patterns/datasets/utils/lifecycle.js` | `hiddenLifecycleOf`, `inHiddenLifecycle`, `catalogVisibility` |
| `packages/dms/src/patterns/datasets/utils/authority.js` | `authoritySummary` |
| `packages/dms/src/patterns/datasets/pages/DatasetsList/index.jsx` | one visibility pool for every mode; authority fetch, chips, superseded line, facet, hidden-match group |
| `packages/dms/src/patterns/datasets/pages/DatasetsList/datasetsList.theme.js` | v6 values for the new keys |
| `dms-template/src/themes/_legacy/datasets.js` | pre-v6 values for the new keys (MNY, TransportNY, …) |
| `packages/dms/src/api/index.js` | `udaGetSourcesSupersededBy`, `udaGetViewLabels` |
| `packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataSource.js` | picker lifecycle filter, bound-source exemption, `includeHiddenSources` |
| `packages/dms/src/patterns/page/components/sections/sectionMenu.jsx` | "Show hidden datasets (N)" toggle in Dataset › Source and Join › Source |
| `packages/dms-server/src/routes/uda/uda.controller.js` | derived `superseded_by` (`METADATA_DERIVED_ATTRS`) |
| `packages/dms-server/tests/test-uda.js` | `superseded_by` tests |
| `packages/dms/tests/datasetsLifecycleVisibility.test.js` | new, 21 tests |
| `dms-template/src/themes/tessera/design_system_v6/pages/datasets-catalog.html` | the converged mockup |
| `skills/marking-authoritative-views.md` | catalog display + `superseded_by` |

## Progress log

- 2026-10-14 — Created from the MNY close-out task (owner: authority "on the sources list view visually",
  and "datasets which are archived are no longer listed in the main datasources view"). The code read
  shows the default list already hides lifecycles. The gaps are search, "Show all" and the editor
  pickers, plus authority not shown on the list at all.
- 2026-10-21 — Started. A code read corrected the doc (see "Current state"): the list doesn't fetch
  `authority` or `metadata`, so authority, view labels and `superseded_by` each need their own batched
  request (plus a server-derived attribute for `superseded_by`). The server's lifecycle floor ignores
  the `{hide, show}` delta, so filtering is client-side. The mockup moves to the tessera v6 page, the
  live default's source. Plan: build Part B (helper, list, picker, tests) now; mock up Part A and the
  search treatment for the owner; port after the choice.
- 2026-10-21 — Part B built except B3 (the search treatment waits on the mockup): `catalogVisibility`
  + list wiring, the picker filter with bound-source exemption and the "Show hidden datasets" switch,
  16 tests passing. Not deployed; not live-checked.
- 2026-10-21 — A1 mockup built in the tessera v6 `datasets-catalog.html`, with a review panel switching
  five choices (undecided treatment, superseded line, table column vs inline, authority facet, B3
  hidden-match treatment). Checked in Playwright at 1480 px in all three views, with no page errors.
  Asking the owner to pick.
- 2026-10-21 — Owner picked:
  - amber undecided for everyone;
  - an own table column;
  - hidden matches in a labelled group;
  - the superseded line and the facet.
  Built Part A and B3 end to end (server attribute + tests, API helpers, list UI, v6 + legacy theme
  keys). The mockup was converged to the chosen variants. Checked locally against MNY production
  data, read-only, signed in, then the spare server was stopped and the token deleted. Status →
  built; commit + deploys are the owner's.
- 2026-10-21 — Owner revised decision 1: undecided sources get no chip. `authUndecidedChip` is now `''`
  (v6 + legacy) and `AuthorityChip` renders nothing for undecided unless a theme sets it. The mockup's
  undecided chips (7) were removed; the facet's "undecided" row stays. 21 tests still pass.
