# One editable flag on every source, internal and external

**Initiatives:** [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) (primary), [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** in progress: defaults, the server refusal, the client and the backfill script are built and tested (2026-11-25, not committed); the backfill is applied to every database configured on this machine; phase 5 (no value reads as not editable for internal sources too) is next and needs the server changes deployed first; not checked in a browser · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

Prerequisite for [uda-result-cache.md](./uda-result-cache.md): the cache serves only sources whose flag is
false, so the flag has to mean the same thing, and be present, on every source.

## Objective (owner, 2026-11-25)

Every created source carries an explicit `isEditable`, in the same place whatever its type, and the code treats
a source by that flag alone:

- internal (DMS) sources get `isEditable: true`, where an external source has it;
- every source with no value gets an explicit `false`;
- a new source is created with the right value.

## Where the flag lives today

| | External (DaMa) source | Internal (DMS) source |
|---|---|---|
| Row | `data_manager.sources` | `data_items`, type `{dmsenv}\|{name}:source` |
| Metadata | `metadata` column (jsonb) | `data.metadata` (already read there for `authority`, `superseded_by`: `getSourceById`, `uda.controller.js`) |
| Flag | `metadata.isEditable`, absent by default | none; editable is assumed |
| Set by | the Editable switch (`patterns/datasets/pages/dataTypes/default/admin.jsx`), needs a primary key; `setPrimaryKeyColumn` clears it | nothing |
| Enforced | every row write (`resolveEditableTable`, `uda.controller.js`) | the DMS routes' grants only |

The flag's place for an internal source is therefore `data.metadata.isEditable`.

Readers that assume instead of reading, to change:

- `dataWrapper/index.jsx` (9 places), `ui/components/Card.jsx:1134`: `isDms || isEditable`
- `dataWrapper/getData.js:485,500` and its server mirror `dms-server/src/dms/mirrors/getData.js:183,187`
- `dataWrapper/useDataSource.js:50`: reads `isEditable` from `metadata` (external); an internal source's
  columns come from `config`, so its flag is never read
- `api/index.js:452`: `!isDms && isEditable` picks the external write path (stays: it chooses the route, not
  whether editing is allowed)

## What the data looks like (hazmit_dama, 2026-11-25)

13,562 sources: 3 with `isEditable` true (1515, 12453, 13824), 1 false (11869), 652 with metadata but no key,
12,906 with `metadata` NULL (mostly `file_upload` rows), 1 whose metadata is not a JSON object. Other DaMa
databases and the internal sources in each DMS database are not counted yet (phase 1).

## Phases

- [x] **Phase 1 (count).** The backfill script's dry run is the audit: it prints true / false / blank / none /
      odd values by source type and writes nothing (`dms-server/src/scripts/backfill-source-editable.js`; one
      script, not the two first planned). Run on hazmit_dama and the hub's DMS database; numbers in the log.
- [x] **Phase 2 (new sources get the value).** Built 2026-11-25, not committed.
  - External: `createDamaSource` adds `isEditable: false` unless the caller passed a boolean (so a new source's
    metadata is never NULL).
  - Internal: `routes/dms/sourceEditable.js withSourceEditableDefault`, applied on the server in
    `createData` and in `/sync/push` creates. The controller already handles the `source` kind there (its
    caches); the default joins it rather than going through a format declaration, which has no server-side
    "default value" notion today.
  - Duplicated or copied sources keep the source's value (their data is copied whole).
- [x] **Phase 3 (read the flag, stop assuming).** Built 2026-11-25, not committed.
  - Client: `sourceIsEditable(externalSource)` (`dataWrapper/schema.js`) replaces the eight
    `isDms || isEditable` checks in `dataWrapper/index.jsx`. `useDataSource` reads an internal source's
    `metadata.isEditable` (the page pattern's internal datasources now request `metadata`,
    `render/spa/utils/index.js`) and moves a changed flag into the section's state without touching anything
    that keys a fetch. No value still reads as today (internal: editable, external: not).
  - The Editable switch (`EditableToggle`, `dataTypes/default/admin.jsx`) now serves internal sources on both
    admin pages. It loads the stored metadata itself before it can be used, since a save replaces the blob.
  - Server refusal (answer 1): `assertSourceEditable` in the DMS controller, before `createData`,
    `setDataById`, `updateDataById`, `setMassData` and `deleteData` on a dataset row type; the internal
    upload's publish and validate routes answer 409 up front; `uda.viewsById.clearData` refuses too. Only an
    explicit `false` refuses. The error is 409 `SOURCE_NOT_EDITABLE`.
  - Left as they were: `getData.js` and its server mirror still ask for the row id of any internal source
    (identity, not editing); `ui/components/Card.jsx:1134` passes `isDms || isEditable` as a display hint while
    `allowEdit` comes from the section.
- [x] **Phase 4 (backfill).** Applied 2026-11-25 to every database configured on this machine: the hub and
      production DMS databases and the five DAMA databases (log). A database not configured here still needs it. To apply, per database: `node src/scripts/backfill-source-editable.js --db <config>
      [--app a,b] --apply` from `packages/dms-server`, with `DMS_DB_CONFIG_DIRS` naming the config folder.
- [ ] **Phase 5 (drop the fallback).** After phase 4 has run everywhere: `sourceIsEditable` and
      `refusesRowWrites` treat no value as not editable for an internal source too.
- [x] **Tests.** `packages/dms-server/tests/test-source-editable.js` (30 checks, in `npm test` and
      `npm run test:source-editable`): create defaults, the refusal on every row write and its return, the
      backfill on SQLite. `packages/dms/tests/sourceIsEditable.test.js` (3).
- [ ] **Docs.** `dama/CLAUDE.md` says it (sources table, `createDamaSource`). A `documentation/` page for the
      datasets metadata contract is not written.

## Owner's answers (2026-11-25)

1. **Editable off on an internal source: the server refuses row writes**, as it does for an external source.
   The check goes in the DMS data-row write path, expressed without naming a row kind (a format rule).
2. **The internal default is applied on the server** at create time.
3. **A source with no metadata is left alone and reads as not editable.** The backfill does not write to the
   12,906 NULL-metadata rows. My reading, to confirm: an external source that has metadata but no flag (652 in
   hazmit_dama) still gets an explicit `false`.
4. **Sources from outside the server.** Internal sources no longer come from outside it. External sources
   default to not editable, and an author turns Editable on deliberately. Readers treat a blank external source
   as not editable.

## Log

### 2026-11-25

- Dry run, hazmit_dama (external): 13,562 sources. true 3, false 1, blank 651 (would become false), no
  metadata 12,906 (left alone; 12,849 of them `file_upload`), 1 not a JSON object (source 1650, never written).
  Blank by type: `file_upload` 321, `gis_dataset` 201, `csv_dataset` 85, the rest pipeline types.
- Dry run, hub DMS database (`hub-dms`, internal): chat 61, hub 2, mny 86, tny 15 sources, every one blank
  (would become true).
- **Applied (owner: "apply everything necessary", 2026-11-25).** Hub DMS database (`hub-dms`): 164 internal
  sources set to true (chat 61, hub 2, mny 86, tny 15), none blank after. hazmit_dama: 651 external sources set
  to false; after: true 3, false 652, no metadata 12,906, 1 not an object (1650, untouched). Changed ids:
  `dms-template/scratchpad/source-editable/hub-dms.json` and `hazmit_dama.json`.
- **Applied to every DAMA database configured on this machine (owner, 2026-11-25):** npmrds2 386 set to false
  (after: 387 false, 76 no metadata; sources 808, 921, 973 are not JSON objects, untouched), nysdos 1,049 set
  to false, wcdb-dama 1 set to false (7 already true), landbank_dama nothing to write (its 1 source is true).
  With hazmit_dama that is all five (`db-configs/` plus the built-in `landbank_dama`); `dama-sqlite-test` is a
  test file. Changed ids per database in `dms-template/scratchpad/source-editable/`.
- **Production DMS database (`dms-mercury-3`, dms3): applied (owner: "go", 2026-11-25).** 146 internal sources
  set to true, none blank after: mitigat-ny-prod 87, chat_spike 16, npmrdsv5 15, shaun-test-app 6, qa_test 5, wcdb 4,
  availabs 3, asm 2, avail 2, nydos 2, type_refactor_2 2, uda-test-1783706184448 2. Changed ids in
  `dms-template/scratchpad/source-editable/dms-mercury-3.json`.
- Server tests run one file at a time: controller, graph, workflow, delete-cascade, transactions,
  change-history, upload-pipeline, uda-auth and source-editable pass. `npm test` as a whole stops at its
  second file (`test-config-dirs.js`, a config lookup inside the `no-remote-dms` preload), which this work
  does not touch. `test-uda.js` has one failing assertion in the authoritative-views block (a call expected
  to be refused for lack of a grant is allowed); that block inserts its sources by SQL and is not on a path
  changed here. Neither was checked against a clean tree.
- Not checked in a browser: the switch on an internal source's admin page, and a section losing its edit
  controls after the switch goes off.
- Known gaps: a refused write reaches the browser as Falcor's generic error (the message is lost on the
  client, as for other thrown route errors), so the page relies on hiding the controls. A source row changed
  by `uda.sources.update` or `/sync/push` is seen by the row-write check within 5 s (its cache), not at once.
  Legacy `…:data-invalid-entry` row types are not covered by the check.

## Not in this task

The result cache itself; primary keys for internal sources; changing who may edit (grants).
