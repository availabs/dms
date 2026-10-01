# Datasets — authoritative views: record which view of a source should be bound, and why

**Initiatives:** [mny_dama_hygiene](../../../../../planning/initiatives/mny_dama_hygiene.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** built · **Release:** deploy — dms-server FIRST, then the frontend (a new client asking an old server for `authority` gets a caught error and reads undecided, so the order only matters for the logs); transportNY vendored copy syncs after · **Created by:** amuro@albany.edu · **Edited by:** —

**Project:** DMS library · **Topic:** patterns/datasets + api (dms-server) · **Started:** 2026-09-30

> Split out of the MitigateNY stale-bindings task
> ([`hazmit-dama-stale-bindings-repoint-plan.md`](../../../../../planning/mitigateny/tasks/current/hazmit-dama-stale-bindings-repoint-plan.md)).
> That task found many sources where the right view to bind cannot be read off the data (newest
> date, highest version, most rows). A person has to decide from context the system does not hold,
> and today there is nowhere to write that decision down.

## Objective

Let an author record, on a source, **which of its views is authoritative**, meaning the one pages
should bind. Where a source holds parallel products, record **one authoritative view per key** (a
year, a region, a geography level, a variant). Every choice carries a **rationale** plus who set it
and when, so the decision survives the person who made it.

Then the rule for a curated project becomes checkable: a page may bind a source only if the source
is tagged as used in the project, and only through one of that source's authoritative views.
Choices *between* sources (IHP v1 → v2, SBA `88` vs `1545`) stay outside this feature: the project
records them by which source carries its usage tag (owner, D2 · 2026-09-30).

## Requirements

Revised 2026-09-30 after the owner's decisions (D1–D10 below).

- **R1 · Single authority, the common case.** Mark one view as the source's authoritative view. Most
  sources will only ever have one (owner, D7), so this path needs no keys at all.
- **R2 · Keyed authority, when needed.** Mark several views as authoritative, one per key value, over
  author-named dimensions (for example `year`, or `level` × `vintage`). Each key value has at most one
  authoritative view.
- **R3 · Rationale and provenance.** Each choice records a free-text note, the user who set it and
  the time. v1 keeps the current choice only, with no history (simplicity, in line with D4).
- **R4 · Undecided is simply "nothing marked".** It never falls back to "newest". Open questions stay
  outside the system (owner, D4).
- **R5 · Readable everywhere.** The datasets pattern, the section/map pickers and scripts read it
  through existing data paths.
- **R6 · Backward compatible.** Bindings keep pinning `view_id`; nothing rebinds; unmarked sources
  behave as today.
- **R7 · Both source kinds** in v1: DaMa and DMS internal (owner, D8).

## Fixtures from the MitigateNY sweep (2026-09-29)

The design has to express each of these. Evidence is in the MitigateNY task and its report.

| case | source | why the data can't decide |
|---|---|---|
| newest view is a subset | `367` OGS Buildings | newest view 1051 has 55% fewer rows than 843 |
| many same-day views | `1610` NFIP claims enhanced v1.2 | 13 views made 2026-04-27, 5 with tables, labels `X` / `test` |
| newer view changes the numbers | `870` Fusion Events V2 | 2401 adds 2024 but NY total damage falls 7.2%; authority waits on a QA explanation |
| keyed by year | `423` NYS Tax Parcels | one view per parcel year, 2016–2024 |
| keyed by two dimensions | `1567` TIGER | geography level × vintage (`county_2020`, `tract_2010`, …) |
| keyed by variant | `1612` NFIP Community Layer · `938` Hazus Sullivan | comprehensive / split · 50 / 100 year |
| superseded by another source | `854` IHP Enhanced → `1540` | the successor is a different source |
| "newer" source is wrong | `88` SBA vs `1545` v2 | v2 is a 63% smaller subset; `88` stays authoritative despite its name |
| undecided between two sources | `1558` vs `1610` NFIP | same claims, different jurisdiction coding; needs a QA call |

The last three are choices between sources. Per D2 they stay outside this feature: the project
tags the source it uses. The chosen source then marks its own authoritative view like any other
(`88` → view 1646, with the note that `1545` is a subset).

## Scope

- **In:** data model, server read/write + auth, datasets-pattern UI (show, set, change, clear), a
  marker + preselect in the section and map view pickers, and a stable shape scripts can read.
- **Out:** automatic rebinding (the MitigateNY repoint tool does that); "follow the authoritative
  view" bindings (possible later); cross-source "superseded by" links (D2); open questions (D4);
  history of past choices (v1); per-pattern overrides (D3); the category/usage tagging itself.

## Current state

Surveyed 2026-09-30. `S/` = `packages/dms-server/src/`, `C/` = `packages/dms/src/`.

**Nothing records an authoritative view today.** A search for `authoritative`, `primary`,
`defaultView` and `superseded_by` finds nothing. Every "current view" notion is derived from order:
- The Overview Versions card puts a **`current` badge on the last view**
  (`C/patterns/datasets/pages/dataTypes/default/overview.jsx:96-97, 335`).
- `SourcePage` opens view-dependent tabs on the **last view** (`pages/SourcePage.jsx:155-160`).
- The version page falls back to the max view id (`default/version.jsx:89-94`).
- `createSourceView` copies the newest view as its template (`S/routes/uda/uda.controller.js:484-487`).

**Two hooks exist but nothing feeds them.** `pagesEditor.utils.js:150-152` hard-codes
`_viewChip {stale:false, fresh:false}`, though stale/fresh styles exist (`pagesEditor.jsx:201-203`).
`C/ui/columnTypes/sectionsChip.jsx:24-29` can show "N sections on outdated views", but nothing
computes `staleCount`. This feature is what those hooks need.

**Where a source's fields live**
- **DaMa:** columns on `data_manager.sources` (`S/db/sql/dama/create_dama_core_tables.sql:20-35`):
  `display_name`, `description`, `categories`, `metadata` (holds `metadata.columns`), `statistics`,
  `auth_permissions`, `source_dependencies`. New columns reach existing envs only through
  `migrate_dama_core.sql` (`ADD COLUMN IF NOT EXISTS`, e.g. `auth_permissions` at 26-35). A drift
  test enforces this, and there is a SQLite twin.
- **DMS internal:** everything is in the source row's `data` (`C/patterns/datasets/datasets.format.js:13-63`).
  Views are `data.views: [{ref, id}]`; a view row holds only `name`, `file`, `download`
  (`default/consts.js`, `InternalViewAttributes`).

**Write paths**
- **Source attributes:** Falcor `set uda[env].sources.byId[id][attr]` (`S/routes/uda/uda.route.js:174-219`)
  → `updateSource` (`uda.controller.js:257-283`).
  - DMS: a shallow `jsonMerge` into `data`.
  - DaMa: `SET <key> = $n` built from the payload keys, so a new top-level attribute needs a column.
  - Auth: `update-source`, or `edit-source-permissions` when `auth_permissions` is in the payload.
  - Client helper: `updateSourceData` (`default/utils.js:105-174`), which stringifies objects, so DMS
    attributes come back as strings and callers `parseIfJson`.
- **The metadata editor saves the whole blob.** `gis_dataset/pages/metadata.jsx:54` calls
  `updateSourceData({data: v, attrKey: 'metadata' | 'config'})`. A field nested inside `metadata`
  would ride along on every column edit and could be clobbered by a stale copy.
- **View attributes:** `set uda[env].views.byId` (`uda.route.js:335-368`) → `updateView`. This has
  **no auth check**, and nor do `uda.sources.update` or `uda[env].settings`. That fits the open
  [`auth-permission-chain-and-unguarded-writes.md`](./auth-permission-chain-and-unguarded-writes.md).
- **Observation, not in scope here:** the DaMa `updateSource` branch interpolates **payload keys as
  SQL column names** with no allow-list (`uda.controller.js:276-281`; the route passes
  `sourcesById[sourceId]` through unchanged). It is behind the `update-source` check, but it should
  get an allow-list. The auth task above does not mention it yet.

**Binding pickers**
- **dataWrapper** (`C/patterns/page/components/sections/components/dataWrapper/useDataSource.js`):
  - `getViews` keeps server order (view id ascending).
  - `onSourceChange` (269-314) clears `view_id`, so no view is chosen automatically.
  - `onViewChange` (316-333) stores `view_id`, `view_name`, `updated_at`.
  - The Version select (`sectionMenu.jsx:468-487`, `pages/edit/editPane/dataSourcesPane.jsx:106-133`)
    has no empty option, so it can look chosen when nothing is saved.
  - Bindings live in `externalSource` (canonical in `schema.js`) or `sourceInfo` (canonical in live
    data per `pagesEditor.utils.js:142`); anything reading bindings must handle both.
- **Map editor:** layer source/view is set in `LayerManager/SourceSelector/index.jsx:86-101`.
  `SourceList.jsx` sorts views newest first (43) and auto-picks only when there is one (60-62).
  Layer **view groups** (`filter-source-views`, `view-group-id`; `MapEditor/index.jsx:1095-1113`)
  already let one layer switch between several views, a precedent for keyed sets.

**Precedent to follow:** the lifecycle work
([`datasets-lifecycle-listing-and-sandbox-promotion.md`](./datasets-lifecycle-listing-and-sandbox-promotion.md)).
- A shared vocabulary module, mirrored on the server with a "keep in sync" note (`uda.controller.js:59-75`).
- Defaults are off, so nothing changes on deploy.
- Postgres and SQLite branches; tests in `test-uda.js`.
- UI is a gated admin action on the Overview card that lists what blocks it and offers the inverse
  action (`overview.jsx:118-138, 287-313`).

**No lineage between sources today.** `source_dependencies` / `view_dependencies` record what a
derived dataset was built from, and `metadata.created_from_view_id` records a view's template.
Nothing says "this source replaces that one". Usage isn't stored either: the admin sources tab
derives "Used By" at read time (`sourcesTab.jsx:147-176`).

## Proposed design

Rewritten 2026-09-30 for the owner's decisions. An earlier draft used a dedicated `authority`
column; that is superseded by D1 = inside `metadata`.

### Storage: `metadata.authority` on the source (D1)

- **DaMa:** `data_manager.sources.metadata -> 'authority'`. No schema change and no migration:
  `metadata` is already JSONB on every env.
- **DMS internal:** `data.metadata.authority` on the source row. On DMS sources the metadata editor
  writes `config`, not `metadata`, so this key has no competing writer there.

```jsonc
// single authority: the common case (D7). No key.
{ "views": [ { "view_id": 1646,
               "note": "v2 (1545) is a 63% subset of the NY loans; keep this one",
               "set_by": "amuro@albany.edu", "set_at": "2026-10-02T14:03:00Z" } ] }

// keyed authority: only when a source holds parallel products
{ "views": [
    { "key": { "year": "2024" }, "view_id": 2268, "note": "…", "set_by": "…", "set_at": "…" },
    { "key": { "year": "2023" }, "view_id": 1958, "note": "…", "set_by": "…", "set_at": "…" } ] }
```

**Rules the server enforces:**
- Every `view_id` belongs to the source.
- Either a single entry with no `key`, or keyed entries that all share the same key names.
  Unkeyed and keyed entries are never mixed.
- At most one entry per key value.
- Key names are free-form snake_case (D7). Values are strings.
- No `authority`, or an empty `views`, means undecided.

**Why this needs a server guard (the D1 trade-off).** Two writers replace the whole `metadata`
object today:
- the DaMa metadata editor (`gis_dataset/pages/metadata.jsx:54` → `updateSourceData`);
- `udaUpdateSourceMetadata` (read-modify-write).

A copy loaded before someone marked a view would silently erase the mark. So:
- the generic `updateSource` path **preserves the stored `metadata.authority`** whenever a payload
  carries `metadata`. For DaMa, in SQL:
  `metadata = $1::jsonb || jsonb_strip_nulls(jsonb_build_object('authority', metadata->'authority'))`,
  with a SQLite `json_patch` twin; the DMS branch does the same in its merge;
- any `authority` inside an incoming generic payload is **ignored**.

The dedicated call below is the only writer. This is a correctness requirement, not an option.

### Write path: two validated server calls

- `call uda.sources.setAuthoritativeView [env, sourceId, {view_id, key?, note}]`
  - Adds the entry, or replaces the one with the same key. With no key, it replaces the single entry.
  - `note` is required (default, see "Before implementing").
- `call uda.sources.clearAuthoritativeView [env, sourceId, {key?}]`
  - Removes one entry. With no key, it clears the single entry.

**How the server handles both calls:**
- Both are gated by `isUserAuthedForSource(['update-source'])` (D6).
- The server stamps `set_by` from the request user and `set_at` itself.
- Postgres writes run as `SELECT … FOR UPDATE` then `jsonb_set(metadata, '{authority}', …)`, so the
  rest of `metadata` is never rewritten. SQLite uses the same transaction shape with `json_set`.
- The response carries the new `authority`.
- The client reaches the calls only through `api/` helpers (library `CLAUDE.md`, Data Fetching Rules).

**Read path:**
- A derived, read-only source attribute `authority` (= `metadata->'authority'`), so pickers and lists
  don't have to fetch the whole `metadata` blob. `default/consts.js` adds it to both kinds'
  attribute lists.
- Shared helpers (client module with a server mirror and a keep-in-sync note, per the lifecycle
  precedent):
  - `authoritativeViews(source)` → `[{view_id, key?, note}]`
  - `isAuthoritative(source, viewId)` → `false | {key?}`
  - `authorityState(source)` → `undecided | single | keyed`
  - `keyLabel(key)` → `"year 2024"`

### Datasets pattern UI (D10: today's Overview, theme keys for the redesign)

- **Versions card.**
  - The authoritative view gets an `authoritative` badge (with the key label when keyed). It replaces
    the derived `current` badge when authority is set.
  - `latest` stays on the newest view when it differs.
  - Unmarked sources show `latest` and an **undecided** chip.
- **Admin action** "Mark authoritative…" on a view row and on the version page:
  - one step for the common case: confirm + note;
  - an "add a key" toggle for parallel products;
  - "Clear" is the inverse.
- **Version page:** "Authoritative — set by … on …: <note>".
- **Default view (D9):** `SourcePage` and the version page open the authoritative view (the single
  one, or the first key) instead of the last view, when authority is set.

### Pickers (D5)

- **dataWrapper Version select** (`useDataSource.js`, `sectionMenu.jsx`, `dataSourcesPane.jsx`) and
  **map `SourceList`**: authoritative views sort first with a marker (`★`, or `★ 2024` when keyed).
- **When a source is chosen** and it has exactly one authoritative view, that view is preselected.
  Everything stays selectable.
- **Unmarked sources behave exactly as today.**
- **Later, in the same phase:** feed the existing `_viewChip.stale` and `sectionsChip.staleCount` hooks
  ("N sections on outdated views") from authority.

### Scripts

The stale-binding detector reads `authority` for every bound source. A binding is **current** when its
`view_id` is one of the source's authoritative views and the source carries the project's usage tag.
- A source with no authority is reported as **undecided**.
- A bound source without the usage tag is reported as **not used by this project**. That is how the
  cross-source choices (D2) show up.

### Backward compatibility

- No schema change.
- Bindings keep pinning `view_id`.
- Unmarked sources render and pick as today, apart from the new undecided chip.
- The generic metadata write keeps working; it can no longer drop `authority`.
- No `@availabs/dms` primitive changes shape.

## Decisions (owner, 2026-09-30)

| # | question | answer |
|---|---|---|
| D1 | Where is the record stored? | **Inside the source's `metadata`** (`metadata.authority`; DMS `data.metadata.authority`). The owner first chose a per-view flag, then changed to this. No schema change; generic `metadata` writes must preserve it (see Storage). |
| D2 | Record "superseded by" between sources? | **No.** Handled outside this system: the project tags the source it uses. |
| D3 | One answer per source, or per-pattern overrides? | **One answer per source**, env-wide. |
| D4 | Record open questions on the source? | **No.** Overreach; keep the system simple and follow external rules. |
| D5 | Picker behaviour? | **Mark, sort first, preselect the single authoritative view**, only for marked sources. |
| D6 | Who may set it? | **`update-source`.** |
| D7 | Key dimensions? | **Free-form**, but most sources have one authoritative view, so the unkeyed case is the default path. |
| D8 | Source kinds in v1? | **Both** DaMa and DMS internal. |
| D9 | Datasets pages open on the authoritative view? | **Yes, by default when set.** |
| D10 | Build on today's Overview or wait for the redesign? | **Today's Overview**, behind theme keys. |

### Defaults taken while implementing (owner may override)

- **The note is required** when marking a view. Capturing the context the data can't show is the
  point of the feature.
- **No history in v1.** Only the current choice is kept (with its note, who and when).
- **Re-marking replaces.** Marking a view for a key that already has one replaces the old entry
  instead of rejecting the call.
## Plan

- [x] **Phase 1 — Design.** Current state, design and decisions D1–D10, answered by the owner
      2026-09-30 (D1 revised to "inside `metadata`").
- [x] **Phase 2 — Server — DONE 2026-09-30.**
  - `src/routes/uda/authority.js` (new): the shape and the pure rules — `readAuthority`, `applySet`,
    `applyClear`, `normalizeKey`, `parseJsonish`.
  - `uda.controller.js`:
    - `getSourceById` gains the derived `authority` attribute, read in JS because a DMS
      `data.metadata` may be an object or JSON text;
    - `readSourceMetadata` / `casWriteSourceMetadata` / `mutateSourceMetadata`, a compare-and-swap
      on the stored metadata text with 5 retries;
    - `setAuthoritativeView` / `clearAuthoritativeView`;
    - the `updateSource` guard: a generic `metadata` write keeps the stored `authority` and ignores
      an incoming one.
  - `uda.route.js`: `uda.sources.setAuthoritativeView` / `clearAuthoritativeView` calls, gated on
    login + `update-source`.
  - **Design note — CAS, not transactions:** the pg adapter runs every `db.query` on a pool, so
    `BEGIN`/`COMMIT` through it can land on different connections. The existing `BEGIN` uses in
    `uda.tasks.controller.js` have the same flaw (not fixed here).
  - **Design note — DMS metadata write:** uses `jsonb_set` / `json_set`, not `jsonMerge`. SQLite's
    `json_patch` merges nested objects, so clearing `authority` would not remove it.
  - **Fix found on the way — `sourceAuth.js`:** on SQLite, `auth_permissions` arrives as JSON text,
    so `getSourceAuthPermissions` returned a string, `.groups` was undefined, and **every guarded
    source write on a SQLite DaMa env was refused whatever the grant**. It now parses the string.
    Postgres (jsonb → object) was unaffected.
  - **Tests** (`tests/test-uda.js`, +17): pure rules; DaMa (SQLite) set / replace / refuse (foreign
    view, table-less view, no note, keyed-on-single, single-on-keyed, no grant, unauthenticated) /
    guard / clear / keyed; DMS internal set / read / refuse / guard / clear, with metadata stored as
    JSON text.
  - **Results:** UDA 132/132. `npm test` all green. `test-source-auth` 16/16.
  - **Not run:** Postgres (`npm run test:pg`, needs Docker).
- [x] **Phase 3 — Datasets pattern UI — DONE 2026-09-30.**
  - `components/AuthorityControl.jsx` (new): `AuthorityBadge` plus the per-view status and
    Mark/Clear form. The form handles a required note, an "one per key" toggle, key rows with
    suggested names, and fixed key names on an already-keyed source. It writes through the `api/`
    helpers.
  - `default/overview.jsx`: the Versions card gets the undecided chip, an authoritative badge
    beside `latest` (was `current`), the primary download button on the authoritative view when
    one is set, and the control on every row for `update-source` users.
  - `default/version.jsx`: badge, the control, and the D9 default view.
  - `SourcePage.jsx`: the D9 default view, a ★ marker in the version selector, and an `authority`
    fetch for route-preloaded DMS items.
  - `default/utils.js`: `getSourceAuthority`, read in its own request and resolving null on
    failure. **Design note:** `authority` is deliberately NOT in `External/InternalSourceAttributes`.
    A server that predates it treats it as a DaMa column, the SQL fails, and Falcor caches the
    error for the whole request.
  - Theme keys `verAuth*` / `verUndecidedChip` in the default `sourceOverview.theme.js` and in
    `src/themes/transportny/themev2.js`.
  - **Live check** (the running `npmrdsv5` dev server against the production API, signed in as the
    dev account, source 104, read-only; nothing clicked but Cancel):
    - the undecided chip, `latest` and **Mark authoritative…** render, 0 console errors;
    - the form opens in the transportny2 styling, and Save stays disabled until a note is entered.
  - **Bug the live check caught:** `readAuthority` took a source's own `views` array (its versions
    list) for an authority record, so every version read as authoritative. It now recognises a
    source by its other fields.
- [x] **Phase 4 — Pickers — DONE 2026-09-30** (except the stale chips, below).
  - `dataWrapper/useDataSource.js`:
    - `getSourceAuthorities` fetches per env, separately, and swallows failures;
    - authority is kept in an `authorityBySource` map, **never on the source objects**, which
      `getSources` merges into the section's persisted `externalSource`;
    - view options (and join views) sort authoritative first with a ★ label;
    - the single authoritative view is preselected only after the AUTHOR picks a source
      (`pendingAuthorityPreselect` ref), so existing bindings are never touched.
  - `mapeditor/.../SourceSelector/SourceList.jsx`: the same sort, a ★ authoritative badge, and the
    same preselect-on-open rule.
- [ ] **Phase 4b — stale chips (follow-up, not started).** Feed `pagesEditor.utils.js` `_viewChip`
      (`stale`/`fresh`) and `ui/columnTypes/sectionsChip.jsx` `staleCount` from authority. This needs
      the admin pages editor to load authority for every bound (srcEnv, source); `enrichSection` is
      synchronous and has none. Not needed for the MitigateNY rebinding, so it was left out of this
      pass.
- [x] **Phase 5 — Script contract + docs — DONE 2026-09-30.**
  - Skill [`src/dms/skills/marking-authoritative-views.md`](../../../skills/marking-authoritative-views.md)
    (indexed under "Authoring at the pattern level"): the record, the rules, the author flow, the
    two calls, the direct-SQL read for scripts, and the three gotchas.
  - Script contract: DaMa `metadata->'authority'`; DMS `data->'metadata'`, parsed as object or
    JSON text.

## Files requiring changes

**Server** (`packages/dms-server/src/`)
- `routes/uda/uda.controller.js`:
  - `setAuthoritativeView` / `clearAuthoritativeView` (DaMa + DMS, Postgres + SQLite, validation,
    `jsonb_set`/`json_set` in a transaction);
  - the `metadata.authority` preserve-guard in `updateSource`;
  - the derived `authority` attribute in source reads.
- `routes/uda/uda.route.js`: the two calls, gated by `isUserAuthedForSource(['update-source'])`.
- A shared authority vocabulary + validator (server mirror of the client helper module).
- Tests in `test-uda.js`.
- **No DDL.**

**Client** (`packages/dms/src/`)
- `api/index.js`: `udaSetAuthoritativeView` / `udaClearAuthoritativeView` helpers.
- `patterns/datasets/pages/dataTypes/default/consts.js`: the derived `authority` attribute for both kinds.
- `patterns/datasets/utils/authority.js` (new): the read helpers.
- `patterns/datasets/pages/dataTypes/default/overview.jsx`: badges, undecided chip, Mark/Clear.
- `patterns/datasets/pages/SourcePage.jsx`, `default/version.jsx`: default view, status line, action.
- `patterns/page/components/sections/components/dataWrapper/useDataSource.js`, `sectionMenu.jsx`,
  `pages/edit/editPane/dataSourcesPane.jsx`: sort, mark, preselect.
- `.../MapEditor/.../LayerManager/SourceSelector/SourceList.jsx`: sort, mark.
- Datasets theme: badge, chip and dialog keys (default + transportny2).
- Later in Phase 4: `pagesEditor.utils.js` `_viewChip`, `ui/columnTypes/sectionsChip.jsx` `staleCount`.

**Docs:** a short skill or doc page on marking authoritative views, plus the script contract.

## Testing checklist

**Server (`test-uda.js`, Postgres + SQLite, DaMa + DMS)**
- [x] mark a single authority; mark keyed authority (one key name; two names covered by the pure-rule test)
- [x] reject: a view from another source, a table-less view, mixed keyed and unkeyed entries,
      inconsistent key names, a missing note
- [x] re-marking a key replaces the entry; clearing removes it; `set_by`/`set_at` come from the server
- [x] **guard:** a generic `metadata` write (the metadata editor's full-blob save) leaves
      `metadata.authority` intact, and an `authority` inside a generic payload is ignored
- [x] a user without `update-source` is refused; unauthenticated is refused
- [x] unmarked sources read `authority: null` — SQLite 132/132 and Postgres 133/133 (DMS + DaMa both on PG)

**Client**
- [x] unmarked sources look as before apart from the undecided chip (live, source 104); picking unchanged by construction (preselect only fires when authority is set)
- [ ] single and keyed badges; `latest` still shown when it differs — **needs the deployed server** (helpers unit-checked)
- [ ] the picker preselects only when there is exactly one authoritative view; the map `SourceList`
      marks and sorts — **needs the deployed server** (`singleAuthoritativeViewId` / `sortAuthoritativeFirst` unit-checked)
- [ ] datasets pages open the authoritative view when set (D9) — **needs the deployed server** (`preferredViewId` unit-checked)

**Fixtures** (each expressible on a copy of `hazmit_dama` or in SQLite)
- [ ] `367` (older view authoritative) · `1610` (one of 13 same-day views) · `88` (kept, with note)
- [ ] `423` by year · `1567` by level × vintage · `1612` / `938` by variant

## Progress log

- 2026-09-30 — Task created from the MitigateNY stale-bindings work (owner request). Linked to
  `mny_dama_hygiene` (primary) and `dms_datasets_manager`.
- 2026-09-30 — **Phase 1 draft.** Code survey (source/view storage for both kinds, write paths, auth,
  datasets UI, binding pickers, the lifecycle precedent) written into Current state; design and
  decisions D1–D10 proposed. Verified by reading the code: DaMa `updateSource` builds `SET` from payload
  keys, and the metadata editor saves the whole blob, so authority gets its own field. Also noted,
  out of scope: those payload keys are not allow-listed before becoming SQL column names. Status →
  `blocked:decision`.
- 2026-09-30 — **Decisions D1–D10 answered by the owner.** D1 went from a per-view flag to "inside the
  source's `metadata`" (the per-view flag would also have been exposed: `useZoomToFit.js` saves the
  whole view `metadata` from client state through the unguarded `views.byId` set). D2 and D4: no
  superseded-by, no open questions; both handled outside the system. Design, files and tests
  rewritten. No schema change is needed any more. Added a required server guard: generic `metadata`
  writes preserve `metadata.authority`. Defaults taken: note required, no history in v1, re-marking
  replaces. Status → `next`.
- 2026-09-30 — **Phases 3–5 built.** UI, pickers, skill page. Live read-only check on the `npmrdsv5` dev
  server (source 104) caught and fixed the `readAuthority` "a source's views list is not an authority
  record" bug. `npm run build` is clean. Phase 4b (stale chips in the admin pages editor) is split out
  as a follow-up. Status → `built`; release = dms-server deploy, then frontend. The marked-state
  UI checks wait on that deploy.
