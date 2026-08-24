# Create / duplicate a DAMA source version (and the WCDB schedule version picker)

## Objective

Give an external (DAMA) dataset a way to gain a **new version** without an upload —
blank, or a row-for-row duplicate of an existing version — and consume it from the
WCDB admin schedule page so a programme director can draft next semester's week
without touching the one that is on the air.

## Why the capability did not exist

`createDamaView` (`dama/upload/metadata.js`) registers a `data_manager.views` row and
names its table, but **nothing creates the table**. Every caller is an ETL worker that
builds the table as a side effect of ingesting a file (`csv-publish`, `gis-publish`,
`file-upload-route`). So versions could only ever be born from an upload; there was no
"give me another version of what I already have".

`uda.route.js` had `viewsById.clearData` and the three `data.*` row verbs, but no
`views.create`. The client had no falcor path to reach one either.

## Design decision: versions are VIEWS, not a `version` column

The alternative was a `version` column on the one schedule table, with the picker as a
filter. Rejected:

- **Publishing.** The grid's Publish action repoints the public site at a version. With
  views that is one field on the public section (`externalSource.view_id`) and the public
  query is untouched. With a column, every public schedule query grows a version
  predicate and publishing means editing a filter.
- **Isolation.** A half-finished draft in its own table cannot leak onto the public site.
  In a shared table it is one missing predicate away.
- **It is the platform's own concept.** `getViews` already enumerates versions and the
  dataWrapper's source panel already lets an author pick one. This adds the missing
  verb, not a new concept.

The new table is always cloned from an existing view's table, never built from
`metadata.columns` — the physical table is the only place the real schema lives (types,
NOT NULLs, the PK and its indexes), and `metadata.columns` demonstrably drifts from it
(see `scripts/wcdb-admin/add-shows-image-column.mjs`).

## Changes

### Server — `packages/dms-server`
- [x] `dama/upload/metadata.js` — new `cloneViewTable(db, {fromSchema, fromTable, toSchema, toTable, withData})`.
      `LIKE … INCLUDING ALL` copies types/NOT NULLs/defaults/indexes/constraints and lets
      Postgres auto-rename the copied PK so it cannot collide. The one thing INCLUDING ALL
      gets wrong is SERIAL: it copies `nextval('…source_table_seq')` verbatim, so the clone
      would share the source's sequence and silently depend on it. Every sequence-backed
      default is rewired to a fresh `OWNED BY` sequence, and on a data copy each is
      `setval`'d past the copied rows (else the first insert collides on the PK).
- [x] `routes/uda/uda.controller.js` — `createSourceView(env, {source_id, version, copy_from_view_id, user_id})`.
      External+Postgres only. Template = the named view when copying, otherwise the source's
      newest view. Names the version (defaults to the new `view_id`). **Deletes the view row
      if table creation fails** — a view with no table shows up in every version list and
      fails on read, which is worse than no view at all.
- [x] `routes/uda/uda.route.js` — `uda.views.create` call route. Requires a user and
      `update-source` on the source (adding a version modifies the dataset). Invalidates
      `sources.byId[id].views` so the picker sees the new version.

### Client — `packages/dms`
- [x] `api/index.js` — `udaListViews(falcor, {env, source_id})` and
      `udaCreateView(falcor, {env, source_id, version, copy_from_view_id})`. Falcor stays in
      the api layer (CLAUDE.md); the two-step length-then-byIndex fetch mirrors
      `useDataSource#getViews`.
- [x] `patterns/page/components/sections/section.theme.jsx` — `menuPosition` gains `z-40`.
      **Real bug, all section types:** the section Settings menu is absolutely positioned
      with no z-index, so ANY section content that raises itself (a sticky toolbar, a pinned
      header) painted over it and made the section uneditable. Below `sectionGroup`'s
      `modalOverlay` (z-50) so a modal still wins.

### Theme — `src/themes/wcdb`
- [x] `ScheduleGrid.jsx` — version `<select>` in the bar, `New` / `Duplicate` buttons, and a
      `NameVersionDialog` (in-component, matching `PublishDialog`'s shell) that collects the
      name before creating.
- [x] `ScheduleGrid.theme.js` — selector + action + name-dialog keys; `versionBar` dropped
      from `z-30` to `z-10` (it only has to out-stack the grid rows it slides over).

### Switching versions is LOCAL state — deliberately
`switchVersion` writes `state.externalSource.view_id`. In view mode `setState` is a
`useImmer` setter that is never persisted, so picking a version is a per-session choice
that does not dirty the page and does not need page-edit rights. `view_id` is part of
dataWrapper's fetch key (`useDataLoader#computeFetchKey`), so setting it is all that is
needed to refetch. The version the section OPENS on stays its saved data binding.

## Verification

- [x] **Server, against the real `wcdb-dama` source 10** (`scratchpad/test-view-create.mjs`):
      blank version → 0 rows; duplicate → 69 rows; PK auto-renamed
      (`s10_v16_wcdb_schedule_pkey`, no collision); `ogc_fid` default points at a
      clone-owned sequence; `nextval` = 70 after copying 69 rows; editing the copy leaves
      the original untouched; the blank version accepts an insert. Both test views dropped.
- [x] **Falcor round-trip, the exact path the component takes** (`scratchpad/test-falcor-create.mjs`):
      real login → `createFalcorClient` with the bearer token → `udaCreateView` twice →
      `udaListViews`. Duplicate returned view 17 (69 rows), blank returned view 18 (0 rows),
      the list picked up both newest-first with the right `version` labels, and the
      `update-source` gate passed for an authLevel-10 user. Both views dropped after.
- [x] **UI renders** — selector with the bound version, `New`/`Duplicate` enabled, `v10`
      meta, no console errors.
- [ ] **Create clicked through the browser** (everything under the click is proven above). BLOCKED, environment not code: the dev
      frontend on :5173 points at `https://dmsserver.availabs.org` (`.env`), which does not
      have `uda.views.create` until the server change deploys. A dev server pointed at
      :3001 loads, but the `station_admin` pattern resolves to `id: "no-access"` on that
      server even with an authLevel-10 token, so the admin page never mounts there.
      Unblock by either deploying dms-server, or granting the local server's copy of the
      `station_admin` pattern to the dev user.

## Follow-ups

- [ ] `display.liveTargetSectionId` is set but Publish still only *describes* the repoint —
      it does not write `externalSource.view_id` onto the public section. That is the other
      half of the version story.
- [ ] Deleting / renaming a version has no UI. Renaming is a plain `views.byId` attribute
      set; deleting needs a guard against deleting the live version.
- [ ] `airing_id` is `INTEGER NOT NULL` with no default, so the add-airing modal has to
      supply one. A blank version starts empty, which makes this reachable sooner.
