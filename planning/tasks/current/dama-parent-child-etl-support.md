# DaMa / datasets — parent → child ETL support for multi-source data types

**Initiatives:** [mny_fusion_data_update](../../../../../planning/initiatives/mny_fusion_data_update.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** built · **Release:** deploy — dms-server + frontend (needs the `dms-server-real-transactions.md` deploy; same deploy as authoritative views), then the TransportNY theme sync · **Created by:** amuro@albany.edu · **Edited by:** —

**Project:** DMS library · **Topic:** dms-server / dama + patterns/datasets · **Started:** 2026-10-02

> The platform half of the Fusion pipeline work. The design and gap analysis are in
> [`fusion-datatype-analysis-and-design.md`](../../../../../planning/mitigateny/tasks/completed/fusion-datatype-analysis-and-design.md)
> and `dms-template/scratchpad/fusion-analysis/03-platform.md` §7 (gaps G1–G13, with file:line
> references). The site task that consumes it is
> [`fusion-pipeline-datatype-implementation.md`](../../../../../planning/mitigateny/tasks/current/fusion-pipeline-datatype-implementation.md)
> (its Phase A).

## Objective

Let one data type own a set of ordinary `csv_dataset` / `gis_dataset` child sources: create them,
add a view to each per run, record on each view which run produced it and which views it was built
from, roll that up to the parent and the children for display, retire old views cleanly, and do all
of it behind real auth. Nothing here is Fusion-specific; `work_zone` (14 stages, about 20 output
types) is the second consumer.

## Principle: lineage lives on views (owner, 2026-10-02)

**A source is only metadata about its views.** Every parent → child and input → output link is
recorded on a **view**. One view of a source can depend on entirely different sources than another
view of the same source. Real case: DLS source 858's view 1647 was built from sources 372, 854, 71, 88,
831 and 342, and its view 2398 from 1548, 1540, 71, 1545, 1558 and 342. Only 2 of the 6 input sources
are shared, and the switch from SBA 88 to 1545 is what caused the Fusion −7.2% drop.

Source-level lineage is allowed only as:
- a **derived roll-up**, computed from the source's views on read and never stored as truth;
- a **recommendation**, advisory metadata such as "the child source this output normally adds its
  view to". It never states what any view was built from.

## Scope (must for Fusion v1 unless marked)

- [x] **G1 · View-level lineage** (per the principle above). BUILT 2026-10-02.
  - **Each output view records:**
    - `view_dependencies`: the exact input views it was built from. The server resolves them from the
      run's inputs; the client never asserts them. `createDamaView` already accepts it
      (`dama/upload/metadata.js:181`).
    - `metadata.produced_by = {view_id, output, stage}`, where `view_id` is the parent's **run view**,
      the view that orchestrated it.
  - **The run view** (one view of the parent per run) records its own `view_dependencies`: the external
    inputs it pinned or reused.
    - Its outputs are **derived**: the views whose `produced_by.view_id` is the run view. They are not
      stored a second time.
  - **Sources hold no lineage.** `sources.source_dependencies` stays unwritten as truth (the old item
    "`createDamaSource` accepts `source_dependencies`" is dropped).
    - A source may carry a **recommendation**, e.g. the parent's
      `metadata.output_targets = {<output>: child_source_id}`: the child source a run adds each
      output's view to by default.
    - A run resolves the targets and may override them. Whatever the run actually did is recorded on
      the views.
  - **Read routes** (derived, read-only):
    - `uda[env].views.byId[id].lineage` → `{inputs: [{view_id, source_id, source_name, version}],
      produced_by: {view_id, source_id, output, stage} | null, outputs: [{view_id, source_id, output,
      stage}]}`. `outputs` is non-empty only for a run view.
    - `uda[env].sources.byId[id].lineage` → the source roll-up: per view, `{view_id, input_source_ids,
      produced_by}`, plus the union of input sources and, for a pipeline parent, the union of produced
      sources.
    - Both use their own Falcor request, as `authority` does, so an older server can't fail the batch.
- [x] **G2 · An `outputs` default page** (`pages/dataTypes/defaultPages.js`) on the parent. BUILT 2026-10-02.
  - It's derived from the parent's run views: per run view, the views it produced.
  - Rolled up per child source, it shows the type, the authoritative and latest view, version,
    `end_date`, the run view that produced each, and links.
  - It reads G1's routes. It never reads a stored child list.
- [x] **G3 · Runs ↔ outputs, and per-version lineage.** BUILT 2026-10-02.
  - Convention: `tasks.result.outputs = [{output, source_id, view_id, rows, status}]` plus
    `tasks.result.run_view_id`.
  - `RunsPage.jsx` renders it and links each output view to its own source.
  - **The version page** shows:
    - "Produced by run view #N of <parent>", from `produced_by`;
    - "Built from": that view's inputs as view → source + version, from G1's view route.

    This was G13 (could). It's now a must, because inputs differ from version to version.
  - The source's Versions list marks a version whose input sources differ from the previous
    version's. For example 2398 vs 1647 above.
- [x] **G4 · The DaMa helpers take a transaction handle.** An optional `db`/`tx` on `createDamaSource` /
      `createDamaView` / `ensureSchema` (`values.db ?? getDb(pgEnv)`). Depends on the
      `dms-server-real-transactions.md` deploy. BUILT 2026-10-02 (`ensureSchema` already took `db`).
- [x] **G5 · Retiring views and tables.** BUILT 2026-10-02.
  - A `deleteDamaView(env, viewId, {drop:true})` primitive: drop by `pg_class.relkind` (TABLE vs
    VIEW), ClickHouse via `getChDb`, and refuse when another view's `view_dependencies` contains it.
  - A "Delete version" button on `default/version.jsx`.
  - Source delete calls it per view, so a default delete drops tables (audit rec 1).
  - An opt-in cascade from a run view to the views it produced (`produced_by.view_id`).
- [x] **G7 · Auth on plugin routes.** BUILT 2026-10-02.
  - `helpers.requireUser` / `helpers.requireSourcePermission` in the `mountDatatypeRoutes` helpers
    (`dms-server/src/index.js:277-288`).
  - Child sources created by a pipeline copy the parent's `auth_permissions` at creation. Permissions
    are source metadata, not lineage.
  - Coordinate with `auth-permission-chain-and-unguarded-writes.md`.
- [ ] **G6 (should) · A generic `views.statistics` renderer** on the version page and the Versions
      card. The v1 workaround is a run-ledger table on the parent.
- [ ] **G8 (should) · Worker-safe writes:** expose `setAuthoritativeView` and a single-statement
      metadata patch to workers, with a system-actor convention for scheduled runs.
- [ ] **G9 (should) · Isolation + a concurrency cap:** let the child-process runner load plugin
      workers (IHP is about 25M rows), plus a per-env cap on running tasks.
- [ ] **G10–G12 (could):** `ctx.step` stage resume; a child's Add Version → parent; the post-run link
      fix. (G13's "Derived from" list is folded into G3.)

## Decision 2026-10-02 (owner): source delete drops tables; Archive is the recoverable path

There is one **Delete**. It drops every view's table through `deleteDamaView`. It refuses while a view
outside the source depends on one of the source's views, and while the source's run views have
produced views in other sources, unless `cascade` is set. The keep-tables delete is removed, so new
orphans stop.
- For a recoverable removal, the admin page points to **Archive**, the existing lifecycle category:
  hidden from the catalog, nothing deleted.
- `uda.sources.hardDelete` stays as an alias of `uda.sources.delete`, for old clients.
- Both calls now need a logged-in user plus `delete-source` on the source. They had no check, and they
  now destroy data.

## Build plan (Phase A of the Fusion implementation task)

Server first, then client, each phase ticked here as it lands.

- [x] **P1 · G4 transaction handles** (`dama/upload/metadata.js`). DONE 2026-10-02.
  - `createDamaSource` / `createDamaView` take `values.db` (`?? getDb(pgEnv)`).
  - The default-category settings read goes through the same handle (`getSettings(env, db)`). On
    SQLite, an adapter query inside the transaction would throw and silently fall back.
- [x] **P2 · G1 lineage** (new `dama/lineage.js` + uda routes). DONE 2026-10-02. Controller:
  `getViewLineageById` / `getSourceLineageById`; DMS envs read as empty lineage.
  - `createDamaView` accepts `produced_by` and validates it: the run view must exist. It also refuses
    `view_dependencies` naming views that don't exist, so the server never records ghosts.
  - `getViewLineage` and `getSourceLineage` read Postgres and SQLite (`view_dependencies` is an
    INTEGER[] on PG and text on SQLite).
  - The source roll-up carries `inputs_changed` per view, against the previous view that has inputs.
  - Falcor literal routes: `views.byId[ids].lineage`, `sources.byId[ids].lineage`.
- [x] **P3 · G5 delete** (`dama/delete.js`; planned as `dama/views/delete.js`). DONE 2026-10-02.
  `softDeleteSource` → `deleteDamaSource`, `hardDeleteSource` is an alias; an `authorize(sourceIds)`
  hook checks every source a cascade touches. Calls live in `uda.tasks.route.js`.
  - `deleteDamaView(env, viewId, {drop, cascade, db})`:
    - refuses: outside dependents; an authoritative view (clear it first); a run view with outputs
      and no `cascade`;
    - drops by `pg_class.relkind`, with no `CASCADE`, and skips a table another view still names;
    - Postgres rows + DDL in one transaction; ClickHouse and storage after commit (failures become
      warnings).
  - `deleteDamaSource` per the decision above.
  - Calls: `uda.views.delete` (new); `uda.sources.delete` and `uda.sources.hardDelete` guarded.
- [x] **P4 · G7 plugin helpers** (`src/index.js`). DONE 2026-10-02 (docs with P5).
  - `requireUser`, `requireSourcePermission`, `deleteDamaView`, `getViewLineage`.
  - `createDamaSource({authPermissionsFrom: parentSourceId})` copies the parent's permissions.
  - Document the helpers in `data-types/CLAUDE.md`.
- [x] **P5 · client**: DONE 2026-10-02.
  - `api/index.js` lineage reads + `udaDeleteView` / `udaDeleteSource`;
  - version page: "Produced by" / "Built from" + a working **Delete version** (the old "Delete View"
    link 404s);
  - Versions list: an inputs-changed chip;
  - RunsPage: renders `result.outputs` + `run_view_id`, linking each view on its own source;
  - G2: an `outputs` default page;
  - the admin delete modal per the decision.
- [x] **P6 · tests**: `tests/test-uda.js` lineage + delete suites on SQLite and Docker Postgres; the
      full `npm test`; a client build. DONE 2026-10-02, plus a live browser check (below).

## Testing checklist

- [x] Server (VERIFIED 2026-10-02, SQLite + Docker Postgres, `testDamaLineageAndDelete`): G1 round trip: a run view producing views in 2 child sources, and two views of one child
      built from **different** input sources. Read the lineage from each output view, from the run view
      (its outputs) and from the source roll-ups (the union, and the per-view difference). Also G3
      result rendering; G5
      refuses a depended-on view, drops tables and views, cascades only when asked; G7 refuses
      unauthenticated runs and missing permissions. SQLite + Postgres.
- [x] Client (VERIFIED live 2026-10-02 against the Docker env, see the log): the outputs page (derived from run views), Runs links, the version page's "Produced by" /
      "Built from" and the Versions list's inputs-changed marker on a fixture pipeline; the
      delete-version flow.
- [ ] `work_zone` keeps working (it uses the "newest source of type" fallback today). Not exercised:
      nothing in its path changed except that `createDamaView` now refuses unknown dependency ids.
      Confirm on its next run after the deploy.

## Progress log

- 2026-10-02 — Task created from the Fusion design (owner approved the design; decisions F1–F11).
- 2026-10-02 — **Owner: lineage lives on views; a source is only metadata about its views.**
  Source-level lineage may only be a derived roll-up or an advisory recommendation, because one view
  can depend on entirely different sources than another (DLS 858: 1647 vs 2398).
  - G1 rewritten to view-level `produced_by` (→ the run view) plus `view_dependencies`, with view and
    source-roll-up lineage routes. The `metadata.outputs` map and `source_dependencies` writes are
    dropped; the parent's `output_targets` is a recommendation.
  - G2 is derived from run views. G3 adds the version page's "Built from" (G13 folded in) and the
    inputs-changed marker. G5 cascades from a run view.
- 2026-10-02 — **Phase A implementation started.** Owner chose the delete semantics (above). Build plan
  P1–P6 written.
- 2026-10-02 — **P1–P4 (server) done; tests green.**
  - New `dama/lineage.js` + `dama/delete.js`; `metadata.js` takes `db`, `produced_by`,
    `authPermissionsFrom`; uda lineage routes; guarded `uda.sources.delete` / `hardDelete` and new
    `uda.views.delete`; plugin helpers `requireUser`, `requireSourcePermission`, `deleteDamaView`,
    `getViewLineage`, `getSourceLineage`.
  - `tests/test-uda.js` gained `testDamaLineageAndDelete` (8 checks). `tests/graph.js` now loads
    `uda.tasks.route.js` as the server does (it didn't, so no delete call was testable).
  - Results: `npm test` (SQLite) green; `node tests/postgres-docker.js run` green (UDA 142/142,
    including the DaMa half via `DAMA_TEST_DB=dama-postgres-test`; transactions-pg 11/11, including the
    source-delete rollbacks).
  - Created the gitignored local `src/db/configs/dama-postgres-test.config.json` (Docker :5499),
    which `test-transactions-pg.js` / `test-uda-feature-id.js` expect.
  - Checked `hazmit_dama` read-only: views have `_created_timestamp`, and none has `produced_by` yet
    (12,984 views).
- 2026-10-02 — **P5–P6 done; status → `built` (Release: deploy).**
  - **Client:**
    - `api/index.js`: `udaGetViewsLineage`, `udaGetSourceLineage`, `udaGetSourceAuthorities`,
      `udaDeleteView`, `udaDeleteSource`.
    - `components/LineageControls.jsx`: the version page's "Produced by" / "Built from" / "Produced
      N", `InputsChangedChip`, `DeleteVersionButton`.
    - The Versions list chip; `RunsPage` `RunOutputs`; the G2 `default/outputs.jsx`, registered as
      the `outputs` default page.
    - The admin dialog is now one Delete, with the Archive pointer and a cascade offer on
      `has_outputs`.
    - Removed the dead "Delete View" link (it pointed at a `versions/:id/delete` route that doesn't
      exist).
    - Theme keys `verInputsChangedChip`, `lin*`, `verDelete*` in `sourceOverview.theme.js` and
      TransportNY `themev2.js`; `deleteModalSoftBtn` removed.
  - **Docs:** `data-types/CLAUDE.md` (auth helpers, "Multi-source pipelines: lineage lives on views",
    `outputs`) and `dms-server/src/dama/CLAUDE.md` (lineage, helpers, "Deleting views and sources").
  - **Checks:** `npm run build` green. The new files lint clean (the edited files' existing
    prop-types errors are untouched).
  - **Live check (local only):**
    - Setup: the harness server on :3011 + vite :5288 (`npmrdsv5`, `VITE_DMS_PG_ENVS=dama-postgres-test`).
      Docker DaMa fixtures: SBA 88-like and 1545-like sources, a pipeline with two runs, a DLS child.
    - All checks OK:
      - the DLS overview shows "inputs changed";
      - the DLS 2026-04 version shows "Produced by run view #6" and "Built from" the SBA v2 subset + PA;
      - the run view shows "Produced 1 version";
      - Outputs lists the DLS child with both versions (`latest` badge, run links) plus the Runs card;
      - the Runs detail renders `run view` and `source 5 · view #7`;
      - Delete version on an input is refused with the server's text, and on a spare it deletes and
        returns to the overview;
      - the Admin delete is refused for an input source, and a throwaway source deletes (row and table
        gone).
    - For the check, the pipeline fixture was typed `wz_event` and `outputs` was added to
      `data-types/work_zone/pages/index.jsx` temporarily. **Reverted.** Servers and the container
      were stopped afterwards.
  - **Not done here:**
    - G6/G8/G9 (should) and G10–G12 (could) stay open;
    - nothing deployed;
    - `work_zone` doesn't opt into `outputs` (its runs don't write `produced_by` yet).
- 2026-10-02 — **G4 follow-up, found building the Fusion skeleton.** `createDamaSource` on a Postgres
  `tx` now runs each insert attempt under a savepoint. Its duplicate-name retry would otherwise abort
  the caller's whole transaction. Note: `data_manager.sources.name` is not unique (a plain index;
  hazmit_dama has 8,674 rows sharing one name), so that retry only fires on envs with a UNIQUE index.
  Verified by the Fusion integration test on Docker Postgres + `npm test`.
