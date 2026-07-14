# Map share-state (`?layers=`) → route it through the page-variable system

**Status:** DESIGN — awaiting owner direction on the `f_<symId>` question (see research doc) · **Created:** 2026-07-14 · **Topic:** patterns/page · **BC:** required

> **Read first:** `src/dms/research/map-page-state-and-filter-architecture.md` — full analysis of the
> map's filter system, page-state buses, the share-state, and the single→multi-symbology gap (grounded
> in the county_template maps + code). It sharpens the open question below.

## Why (root cause, confirmed by instrumented tracing + a decisive disable test)

`freight_atlas?layers=<id>` reload-loops forever **only with React Compiler on** (transportNY dev;
dms-template disables the compiler in dev, which is why it's fine there — but dms-template **enables
it in prod builds**, so this is a latent prod bug). Root cause: the **map owns the URL itself**
(`map/index.jsx`, `useSearchParams` + a `setSearchParams` write effect, lines ~454–531), *outside*
the DMS page-variable system. On a shared load the map syncs state FROM the URL and then writes the
same params back; that redundant write is a navigation, and under the compiler it ping-pongs with the
page's own search-param handling into an infinite navigate→re-render→navigate loop. Commenting out the
map's `setSearchParams` write **stopped the loop** — confirmed.

## The rule (owner's architecture)

**The page is the single owner of URL params. Any URL param is a page variable. A component connects
its functionality to a page variable through the existing filters/actions system — never by touching
the URL directly.** Spreadsheet/Card already *read* page vars via dataWrapper filter leaves
(`usePageFilters` + `searchParamKey`); Filter *sets* them via `updatePageStateFilters`;
`setActionParam`/`clearActionParam` handle in-memory (non-URL) params. The map must do the same.

See skill `creating-interactive-pages.md` for the page-variable system (registry → control → consumers).

## The map is already half-on the system (de-risks the refactor)

Reading the components confirms the current approach and that we're **not diverging**:
- **READ** (Card/Spreadsheet): `usePageFilters:true` filter leaves + `usePageFilterSync.js`
  (`pageState.filters` → section filter tree, `isEqual`-guarded/idempotent) → `applyPageFilters`.
- **WRITE**: `updatePageStateFilters` (registry-gated, page-owns-URL) — called by `ConditionValueInput`,
  RenderFilters, **and the map's own `SymbologyViewLayer.jsx` (lines 238/1041–1042)** for its
  interactive/dynamic layer filters. `setActionParam`/`clearActionParam` for in-memory publish
  (e.g. `spreadsheet/index.jsx` click/load publish).

So the map **already** consumes `PageContext` (`updatePageStateFilters`, `setActionParam`) for layer
filters. **Only the `?layers=`/`f_<id>` share-state** (which symbologies are visible + their selected
interactive-filter index) still uses the off-road `useSearchParams`/`setSearchParams` in `map/index.jsx`.
The refactor = move that one piece onto the pattern the map already uses everywhere else.

## Plan — migrate the map onto the page-variable system

1. **Registry (Part 0).** `layers` (and per-symbology `f_<id>`) become registered page variables
   (`page.data.filters: [{ searchKey:'layers', useSearchParams:true, ... }]`). Decision A below: who
   registers.
2. **READ** — replace the map's `useSearchParams` read effect: derive the map's visible-symbology set
   from `pageState.filters` (searchKey `layers` / `f_<id>`) via `PageContext`, the way Card/Spreadsheet
   read page vars. The existing `updatePageStateFiltersOnSearchParamChange` (URL→pageState, registry-gated)
   already lands the URL value into `pageState.filters`.
3. **WRITE** — replace the map's `setSearchParams` write effect: when the user toggles a layer (or a
   per-layer interactive filter), call `updatePageStateFilters` (control→URL, registry-gated,
   page-owns-URL) with the `layers`/`f_<id>` values. No `useSearchParams`/`setSearchParams` in the map.
4. **Delete** the map's `urlReadDoneRef`/`urlWritePrimedRef`/`shareEnabled` URL plumbing.

Because the write now goes through the page (single owner) with the registry gate, the redundant-write
navigation and the page↔map tug-of-war both disappear — so it's compiler-safe **and** consistent with
every other component.

> Note: `layers`/`f_<id>` are UI-state page variables, not column filters — but the URL-sync layer
> (`page.filters` registry + `updatePageStateFilters` + `updatePageStateFiltersOnSearchParamChange`)
> only round-trips `searchKey`/`values`, so it carries arbitrary page variables fine (like an
> `action`-type param that's URL-synced).

## Map ↔ pageState: TWO distinct concerns (owner emphasis — don't conflate)

The map's page-state integration predates multi-symbology, so be careful:

1. **A symbology's own filters** (per-symbology, authored in the **mapeditor**): `filter-group`/
   `filterGroupEnabled`, `dynamic-filters`, `interactive-filters`, and click-filters. These already
   reach page state through the standard paths — click-filters → `updatePageStateFilters` (URL page
   filters, `SymbologyViewLayer.jsx:1020 updateFilterValues`), hover/click *publish* → `setActionParam`
   (transient). **This is the map's internal filter model → KEEP EXACTLY AS-IS.**
2. **The map's share-state** (multi-symbology display config): `layers` = which symbologies are
   visible; `f_<symId>` = which `interactive-filters` **variant** is selected for that symbology. This
   is NOT a data filter; it's the map's own display state, and it's the ONLY piece that bypassed page
   state via `useSearchParams`/`setSearchParams`. **This is what we route through page variables.**

⚠️ Because #1 already uses `updatePageStateFilters`, the share-state (#2) must not collide with a
symbology's authored filter keys. `layers`/`f_<symId>` are map-owned share keys, distinct from any
`searchParamKey` an author set on a symbology's filter.

## Scope boundary (owner, explicit)

**Keep the map's internal filter model exactly as it works today** — its symbology/interactive/dynamic
filter mechanics and UX are out of scope. **Change only the map↔DMS boundary**: how the map's state
reaches page params / the URL. Concretely:
- IN scope: replace `map/index.jsx`'s `useSearchParams`/`setSearchParams` share-state sync (the
  `?layers=`/`f_<id>` read+write effects) with `PageContext` (`pageState.filters` read +
  `updatePageStateFilters`/`setActionParam` write); page owns the URL.
- OUT of scope: how symbology filters/visibility are represented and applied inside the map
  (`state.symbologies`, SymbologyViewLayer's filter logic, the legend, etc.). The map keeps owning
  that; we only change how it *hands off* to and *reads back* from DMS page state.
- The existing `SymbologyViewLayer` → `updatePageStateFilters` path (internal layer filters) is the
  template for the boundary; extend the same discipline to the share-state.

## Decisions (LOCKED with owner 2026-07-14)

- **A. Auto-register.** When a page has a map section with `display.shareableState`, the platform
  derives the share page variables into the registry so authors don't hand-edit `page.filters`. **Must
  surface in the page Settings tab** for inspection. (Phase 1 DONE for `layers`; extend to the interactive
  keys under UNIFY.)
- **B → superseded by C.** (Was: keep per-symbology `f_<symId>` URL params.)
- **C. UNIFY the interactive-filter variant onto the page-variable system (owner, 2026-07-14).**
  The variant (`selectedInteractiveFilterIndex`) stops being a separate `f_<symId>` URL param and becomes
  a page variable identified by the interactive layer's own **`searchParamKey`** — the SAME binding a
  county-template map already uses to select a variant (research §3–§4). One owner, page owns the URL,
  and the variant becomes a first-class page variable (shareable AND cross-section).
  - **URL shape changes:** `?f_<symId>=<idx>` → `?<searchParamKey>=<value>`. Existing `?f_` links change;
    acceptable because `shareableState` is freight-atlas-only + WIP. (Optionally read old `f_` once for BC.)
  - **Pulls the multi-symbology bridge fix into scope** (was a follow-up): the interactive-filter↔page
    bridge (`dataPageFilters` effect, `index.jsx:606-631`) is `activeSym`/`activeLayer`-only today; unify
    needs it to read/write **each visible interactive symbology's** `searchParamKey` (research §5).
  - `layers` (visibility) stays a distinct map-owned page variable (no interactive-filter analog).

## Implementation plan (phased; each phase independently verifiable)

**Key constraint discovered:** the registry is `mergeFilters(item.filters, patternFilters)`, and
`updatePageStateFiltersOnSearchParamChange` (_utils) rebuilds `pageState.filters` from it — so a page
variable that isn't in that registry is clobbered on every URL change. Auto-registration must therefore
add to the **registry**, and every registry consumer must see the same derived set. The Settings tab
already renders `item.filters` + `pageState.filters` (`settingsPane.jsx:378`), so a registry entry shows
there for free (Phase 4 marks auto ones read-only).

**Investment framing (owner 2026-07-14):** this is a reusable component — build the page-variable-native
version properly, **including the multi-symbology interactive-filter bridge fix (confirmed in scope)**.

- **Phase 1 — Registry auto-derivation. — PARTIAL, needs UNIFY revision.** Implemented
  `deriveMapShareVariables(item)` + `getPageVariableRegistry(item, patternFilters)` in `_utils`; wired
  into `view.jsx` + `edit/index.jsx` seeds + `updatePageStateFiltersOnSearchParamChange`. Currently
  derives `layers` + `f_<symId>`. **Revise for UNIFY:** register `layers` (visibility) + each interactive
  symbology's **`searchParamKey`** (the variant page var); DROP `f_<symId>`. Requires reading a layer's
  `interactive-filters`+`searchParamKey` from section config. No-op when no shareable map → BC.
- **Phase 2 — Multi-symbology interactive-filter↔page bridge (reusability-critical; owner confirmed
  in scope).** Rework the `dataPageFilters` effect (`index.jsx:592-661`): the interactive-filter branch
  currently reads `searchParamKey` off `activeSym`/`activeLayer` only (research §5). Make it iterate
  **every visible interactive symbology**, each reading its own layer `searchParamKey` from
  `pageState.filters` → set that symbology's `selectedInteractiveFilterIndex` (match variant by
  `searchParamValue`/`label`). Likewise generalize the bits keyed off `activeSym` where they gate
  page-state binding (leave the single-active-symbology *authoring UI* alone unless it blocks this).
- **Phase 3 — Share-state READ via page state.** `layers` visibility: read from `pageState.filters` →
  symbology `isVisible`. Interactive variant: handled by Phase 2's bridge (no separate `f_` read).
  Remove the `useSearchParams` READ effect (`index.jsx:459-495`) + `urlReadDoneRef`.
- **Phase 4 — Share-state WRITE via the page.** `layers`: on visibility change → `updatePageStateFilters`.
  Interactive variant: on user variant change → write the variant's `searchParamValue` to its
  `searchParamKey` page var via `updatePageStateFilters` (page owns URL). Remove the `setSearchParams`
  WRITE effect (`:497-531`), `urlWritePrimedRef`, and the `useSearchParams` import. Verify (compiler ON):
  no loop; `?layers=` + `?<searchParamKey>=` load and round-trip; toggles update the URL via the page.
- **Phase 5 — Authoring controls for the multi-symbology bridge (owner-added scope, 2026-07-14).** The
  filter / page-interaction authoring UI (mapeditor `settings/filters.jsx`, `controls/FilterControls.jsx`,
  `symbologySelector.jsx`) resolves ONE active symbology (research §5) — today the author can only wire the
  page bridge (`searchParamKey` + interactive/dynamic filters) on the *active* symbology's active layer.
  Convert it so the author can set up the page-interaction bridge for **each** symbology, and make it
  **visually explicit** which symbology/layer a given `searchParamKey` binding belongs to (per-symbology
  grouping + a "page variable: `<key>`" badge, so the multi-symbology wiring is obvious to the author and
  self-documents how a URL param maps to a symbology). **Needs a short UX design pass first:** read the
  three files, propose the control layout, get owner approval before coding. (Data model already supports
  it — `searchParamKey` is per-layer; this is UI reach + clarity, not a schema change.)
- **Phase 6 — Settings surfacing + auto-register keys.** `deriveMapShareVariables` registers `layers`
  + interactive `searchParamKey`s; Settings tab shows them (auto/read-only). Guard >1 shareable map/page.
- **Phase 7 — Docs.** Component-authoring skill (`creating-page-section-components.md`): a "Connecting a
  component to page variables (consume via filter leaves + `searchParamKey`; produce via
  `updatePageStateFilters`/`setActionParam`; page owns the URL)" section, map as the worked example.

**Sequencing:** land the **runtime loop-fix + unify (Phases 1–4)** first and browser-verify (compiler ON,
no loop) — that resolves the actual bug and the runtime multi-symbology binding. Then do the **authoring
UX (Phase 5)** behind its own design pass, then **settings surfacing (6)** and **docs (7)**.

**BC:** The DMS page-var system delimits multi-value params with **`|||`** (`convertToUrlParams` joins /
the parser splits on `|||`), so unified `layers` **writes** are `?layers=a|||b` (consistent with every
other page var), NOT the old comma shape. Legacy `?layers=a,b` links still **read** correctly — the map
READ splits each `|||`-element on comma too (`toIds`). `?f_<symId>` → `?<searchParamKey>` (accepted;
freight-atlas-only, WIP). An interactive symbology needs a `searchParamKey` (authored in mapeditor) to be
shareable; absent → variant simply not shared (e.g. the freight-atlas symbologies until keys are authored).

## Documentation deliverable (owner asked)

The component-authoring skill (`creating-page-section-components.md`) does **not** cover connecting a
component to page variables — even though Spreadsheet/Card/Filter all do. Add a
**"Connecting a component to page variables (filters + actions)"** section (or a focused new skill)
documenting: read from `pageState.filters` via `PageContext`; write via `updatePageStateFilters`
(URL-synced) or `setActionParam` (in-memory); the Part-0 registry requirement; and the rule
**"never touch the URL directly — the page owns it."** Cross-link `creating-interactive-pages.md`.
The map migration becomes the worked example.

## Status — 2026-07-14

**Runtime loop-fix + unify (Phases 1–4): DONE in `dms-template`, mirrored to `transportNY`.** Files:
- `pages/_utils/index.js` — `deriveMapShareVariables` unified (registers `layers` + each interactive
  layer's `searchParamKey`; dropped `f_`; matches element-type `"Map"` case-insensitively). `view.jsx` +
  `edit/index.jsx` seeds + `updatePageStateFiltersOnSearchParamChange` already use `getPageVariableRegistry`.
- `ComponentRegistry/map/index.jsx` — removed the `useSearchParams`/`setSearchParams` share effects;
  READ folded into the `dataPageFilters` effect (visibility from `layers` + **multi-symbology** interactive
  `searchParamKey` binding + dynamic-filters, all idempotent-guarded); WRITE routed through
  `updatePageStateFilters` (page owns URL), primed-first-run, `|||`-delimited, legacy-comma-tolerant READ.
- Parses clean (babel). Mirror verified in-sync (both files).

**VERIFIED (owner, 2026-07-14): freight_atlas loads with React Compiler ON — no reload loop, map renders.**
The root cause (map writing the URL directly, fighting the page's URL ownership under the compiler) is
resolved by routing share-state through the page-variable system. Loop bug CLOSED.

**Phase 5 (authoring UX): DONE in `dms-template`, mirrored to `transportNY` (owner chose the per-symbology
drill-in list layout).** The map Settings → **Filters** screen is now a single `MapFilterBridgeList`
component (the framework calls `controls(theme)` with no map state, so the per-symbology list can't be
native drill-in nodes — it lives in one leaf that gets `mapAPI`). It renders a **row per symbology**
(name + the page variable it drives, e.g. `?truck_aadt=`, or "no page var" + filter counts); drilling into
one configures **that symbology's own layer** — Use Page Filters, Page Variable Key (`searchParamKey`),
interactive variants (value + Active), dynamic filters (key/default/type), click-filter mappings — never
just the first-visible symbology the legacy controls were bound to. Files:
- `settings/filters.jsx` — added `getSymbologyBridge(state,setState,symId)` (symId-scoped data + handlers)
  + `listBridgeSymbologies(state)`. Legacy `useMapSettingsFilters` (activeSym) kept for BC.
- `settings/controls.jsx` — added `MapFilterBridgeList`; the Filters nav now renders it. Both parse clean.
- **Cleanup debt:** the 5 legacy activeSym filter controls (`MapUsePageFiltersControl`, `MapKeySearchParamControl`,
  `MapInteractiveFiltersControl`, `MapDynamicFiltersControl`, `MapLayerClickFiltersControl`) are now
  unreferenced dead code in `controls.jsx` — remove in a follow-up (left in to avoid a 150-line deletion mid-session).

**NEXT — browser verify (owner):** open the freight_atlas map section in edit → Settings → **Filters**;
confirm the symbology list shows (each with its page-var badge), drilling into one edits that symbology's
bridge, and setting a **Page Variable Key** on an interactive symbology makes its variant shareable
(`?<key>=` round-trips in view). This is also how the freight-atlas symbologies get their `searchParamKey`
authored (the piece the runtime unify was waiting on).

**Phase 5b (main settings menu reorg): DONE in `dms-template`, mirrored to `transportNY` (owner chose the
unified Symbologies manager).** Root problem: the legacy single-symbology picker (`symbologySelector.jsx`)
and Refresh both did `draft.symbologies = { [id]: … }` — a destructive REPLACE that wiped multi-symbology
maps assembled via the Layer Library; and nothing surfaced what was visible/active. Fix:
- `symbologySelector.jsx` — `onUpdateSymbology(symId)` now merges that symbology **in place** (no collapse),
  symId-aware, guarded against being wired as an onClick.
- `symbology.jsx` — added `setSymbologyVisible(symId, visible)` (toggles `isVisible` + layer & interactive-
  variant sub-layer `layout.visibility`) and `setActiveLayer(symId, layerKey)`.
- `controls.jsx` — new `MapSymbologyManager`: mode toggles (Layer Library Panel, Shareable URL State) +
  an **"On this map"** list (per-symbology visibility toggle, **active** marker, category, per-symbology
  Refresh, active-layer picker when >1 layer, Remove) + **additive** "Add symbology" (never wipes others).
  The top menu is now **Symbologies / Filters / Display** (loose display toggles grouped under Display).
  All parse clean; mirrored in sync.
- **Cleanup debt (grew):** now-dead controls in `controls.jsx` — `MapSymbologyControl`, `MapLayerControl`,
  `MapLayerLibraryControl` (Phase 5b) plus the 5 legacy filter controls (Phase 5), and the cascade
  (`useMapSettingsFilters`, `useMapSettingsLayers`, `onSymbologyChange`/`onLayerChange`). Tracked as its
  own task: [`map-settings-dead-code-cleanup.md`](./map-settings-dead-code-cleanup.md).

**NEXT — browser verify (owner):** open a map section → Settings. Confirm the menu is Symbologies/Filters/
Display; in **Symbologies**, toggling visibility works, the **active** marker tracks the first-visible one,
Refresh no longer collapses a multi-symbology map, "Add symbology" is additive, and it no longer fights the
Layer Library. Check both a single-symbology map (county_template) and the multi-symbology freight_atlas.

## Post-verify fixes — 2026-07-14 (owner-reported, awaiting re-verify)

Two issues surfaced after the Phase 1–5b verify; both fixed in `dms-template` + mirrored:
1. **`?layers=` didn't register on SPA navigation (only on full reload).** Root cause: the URL→`pageState.filters`
   effect (`view.jsx` + `edit/index.jsx`) depended on `[searchParams, item?.filters]`, but a map's `layers`
   var is DERIVED from `item.sections` and `item.filters` is usually undefined — so on SPA nav it fired with
   a stale/loading item and never re-ran when the real item resolved. Fix: deps →
   `[searchParams, item?.id, item?.filters, item?.sections?.length]`.
2. **Turning a visible layer OFF started a navigation loop.** Root cause: the map WRITE effect only guarded
   against its own last-serialized value (`shareWritePrimedRef`), not against what the page already holds, so
   the write→navigate→READ→state round-trip could re-fire the write. Fix: added a **page-idempotency guard**
   — the WRITE returns early if the desired `layers`/keys already equal the current `pageState.filters`
   values (added `pageState.filters` to its deps). Prime-ref still suppresses the initial load sync.

**Known limitation (own task):** a search-only `navigate()` (the map writing `?layers=`) still visibly
**refreshes** the page — the tree remounts/re-renders instead of re-rendering in place. The infinite loop is
fixed (READ-gate), but the single refresh-per-write is the pre-existing navigate→remount issue, researched
+ tracked in [`page-remount-on-searchparam-navigate.md`](./page-remount-on-searchparam-navigate.md)
(leading fix: `shouldRevalidate` + memoize view sections).

**Phase 6 (settings surfacing) — DONE, mirrored.** `settingsPane.jsx` now renders a read-only
"Auto-registered variables" section listing `pageState.filters.filter(f => f.auto)` (searchKey + current
value + URL flag) so authors can inspect the `layers`/`searchParamKey` vars the page owns without being able
to hand-edit them. `deriveMapShareVariables` documents the >1-shareable-map-per-page limitation (dedup
prevents duplicate/crash; multiple shareable maps would share `layers` — namespacing is a future
enhancement; single shareable map per page is the intended use).

**Phase 7 (docs) — DONE, mirrored.** Added a **"Connecting a component to page variables"** section to
`skills/creating-page-section-components.md`: the "page owns the URL — never `useSearchParams`/`navigate` in
a component" rule; consume via `pageState.filters` / `usePageFilters`+`searchParamKey` leaves; produce via
`updatePageStateFilters` (URL) / `setActionParam` (in-memory); the registration/auto-derivation requirement;
the write↔read idempotency pattern; the map as worked example. Plus a checklist item, a pitfall, references,
and a cross-link to `creating-interactive-pages.md`.

## DONE — 2026-07-14

Core objective complete + owner-verified: the map's share-state is fully migrated onto the DMS
page-variable system (page owns the URL), the interactive-filter variant is unified onto `searchParamKey`,
the interactive bridge + authoring UX are multi-symbology, the main settings menu is reorganized, auto-vars
surface in Settings, and component↔page-variable wiring is documented. All mirrored to transportNY.

**Follow-ups tracked as their own tasks (NOT blockers for this one):**
- [`map-settings-dead-code-cleanup.md`](./map-settings-dead-code-cleanup.md) — remove 8 superseded controls + cascade.
- [`page-remount-on-searchparam-navigate.md`](./page-remount-on-searchparam-navigate.md) — the residual single-refresh-per-navigate.

## BC / risk

- The map's `?layers=` sharing is used across DMS maps (freight atlas gallery, etc.). Existing share
  links must keep loading — the READ path + registration (Decision A) must preserve the current URL shape.
- Card/column-type/theme discipline: this is a ComponentRegistry (`map`) change with site-wide reach —
  BC by default; verify against existing shared-map pages before declaring done.

## Interim state

The band-aid (idempotent map URL write) was **reverted** — it kept the map owning the URL, which is
exactly what this task removes. Two unrelated correct fixes are kept: `App.jsx` prop stabilization
(transportNY; fixed a real top-level remount) and the idempotent `setPageState` in
`updatePageStateFiltersOnSearchParamChange` (`_utils`; a genuine improvement to the page-var URL→state sync).
Until this lands, the reliable workaround is React Compiler off in transportNY dev (matches dms-template dev).
