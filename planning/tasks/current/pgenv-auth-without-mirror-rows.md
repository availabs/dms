# pgEnv auth without mirror rows: external sources and views are judged from the pgEnv itself

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Release:** commit — then deploy (the mirror rows on `dms-mercury-3` are already deleted) · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

Go back on the pgEnv mirror ([pgenv-mirror-into-dms.md](./pgenv-mirror-into-dms.md), built 2026-11-05).
It keeps a DMS row for every source and view of every pgEnv, per site, in step with `data_manager` through
hooks and a reconcile script. Owner decision 2026-11-12, after discussion with another developer: keeping
rows in step between the pgEnv database and the DMS database costs more than letting auth handle a pgEnv
as its own case.

After this task:

- A site has **one `:dmsenv` row per pgEnv** it uses, and nothing else in DMS for that pgEnv.
- An external source or view is judged from **`data_manager` in the pgEnv**, read at request time.
- **Source grants live in `data_manager.sources.auth_permissions`**, shared by every app that uses the
  pgEnv (owner, 2026-11-12: "auth across different apps is all stored in the pgEnv and that is ok").
- The auth layer's external API is unchanged: `authorize`, `requireCan`, `assertCan`, `canRead`,
  `readableSources`, `sourceOfView`, and the addresses they take.

## Decisions (owner, 2026-11-12)

| Decision | Answer |
|---|---|
| Keep source / view mirror rows? | No. Removed. |
| Keep the single `:dmsenv` row per pgEnv per site? | Yes. It carries the env-level grants and is what `create-source` is asked of. |
| Where do an external source's grants live? | `data_manager.sources.auth_permissions`, one set for all apps on the pgEnv. |
| Does the auth API change? | No. The pgEnv case is handled inside the auth functions. |

## Current state (what the mirror put in place)

- `dama/mirror.js` (322 lines): `mirrorSource` / `mirrorView` / `unmirror*`, `grantsIn` / `setGrantsIn`,
  `reconcile`, `mirrorAppsOf` (`settings.mirror_apps` of the pgEnv).
- Hooks that copy dama to DMS: `dama/upload/metadata.js` (source create, view create),
  `routes/uda/uda.controller.js` (`updateSource`, `updateView`, view create), `dama/delete.js`
  (`unmirrorViews`, `unmirrorSource`). A plugin that writes `data_manager` by direct SQL bypasses them.
- `routes/auth/owners.js`:
  - `index()` fills `snap.external` with mirror rows keyed `s:<pgEnv>:<source_id>` / `v:<pgEnv>:<view_id>`.
  - `snapshotFor` (the function that turns an address into `{ snap, row }`), pgEnv branch: looks the
    subject up in `snap.external`; `no mirror row` when absent.
- `routes/uda/uda.route.js`: `writeSource` sends `auth_permissions` to the site's mirror row
  (`setGrantsIn`); the `sources.byId` get overlays the mirror's grants (`grantsIn`).
- `routes/uda/utils.js getSiteSources`: lists the site's mirror rows beside its internal sources; the
  client's datasets list drops a pgEnv from its external datasources once the site mirrors it
  (`buildEnvsForListing`).
- `scripts/reconcile-pgenv-mirror.js`; `tests/test-pgenv-mirror.js`; ten other suites seed mirror rows
  as fixtures (`test-read-auth`, `test-data-auth`, `test-source-auth`, `test-uda-auth`, `test-uda`,
  `test-upload-auth`, `test-schedule-auth`, `test-datatype-auth`, `test-pattern-filter-sync-load`,
  `mirror-sync`).

## Design

### The one auth change: `snapshotFor` builds the row in memory

Everything after `snapshotFor` (`ruleFor`, `grantsAt`, `mapsFor`, the judge) receives `{ snap, row }` and
does not care where the row came from. So the pgEnv branch of `snapshotFor` is the only auth code that
changes. For `{ env: <pgEnv>, sourceId | viewId, app }`:

1. `app` missing: refuse `no site named`, as today. The env row holds per-site env-level grants.
2. Find the site's env row: `snap.rows.find(kind === 'dmsenv' && data.pgEnv === env)`. None: refuse
   `pgEnv <env> is not attached to <app>`.
3. Look the subject up in the **pgEnv catalog** (below). Not there: `source <env>/<id> not found`.
4. Return a row built in memory, in the shape `wrap()` produces:

```
source: { id: null, app, kind: 'source', type: '<envInstance>|<slug>:source', instance: <slug>,
          parentKey: <envInstance>, parent: <the env row>,
          data: { pgEnv, source_id, name, type, categories, auth_permissions } }
view:   { id: null, app, kind: 'view', parent: <the source row built above>,
          data: { pgEnv, view_id, source_id } }
```

Why nothing downstream changes:

- `parentOf` returns `row.parent` before it looks at `data.parent_id` or the type path. That hook predates
  the mirror and is still there.
- The rules (`source: ['ancestor:dmsenv', 'self']`, `view` and `data: ['ancestor:dmsenv',
  'ancestor:source']`) resolve through that parent chain: env grants spread under the source's own.
- `grantsOf` already reads `data.auth_permissions`, with `view: false` inside it.
- `sourceOfView` already returns `data.source_id` for a row that carries `pgEnv`.
- The in-memory row is never put in `snap.byId` / `snap.rows`, so a cached app snapshot stays app data only.

### The pgEnv catalog (a second cache, beside the app snapshot)

`readableSources` judges a catalog one id at a time, so a query per subject is not acceptable. One bulk
read per pgEnv, cached 30 s like the app snapshot (`cached('pgenv|<env>', …)`):

```
sources:  SELECT source_id, name, type, categories, auth_permissions FROM <sourcesTable>
views:    SELECT view_id, source_id FROM <viewsTable>
```

- `sourcesTable` / `viewsTable` differ by dialect (`data_manager.sources` on Postgres, `sources` on the
  SQLite dama harness); reuse the helpers `mirror.js` has and move them somewhere that survives it.
- `fresh` (every write, and a read's one retry) reloads it, as it does the app snapshot.
- A grant write clears that pgEnv's entry, so a changed grant is read at once on the same server.
- `clearSnapshots()` clears both caches (tests rely on it).
- Size: a pgEnv has thousands of sources and views; five small columns each. Measure on the largest
  (`hazmit_dama`, `npmrds`) before settling on "load all" over "load by id with a small LRU".

### Grants go back to the column

- `writeSource` (`uda.route.js`): `auth_permissions` is written by `updateSource` like any other key. The
  `no site named for the grants` refusal goes; the `edit-source-permissions` check stays.
- `sources.byId` get: no overlay; the column is the value. The `enforce` trimming (a caller without
  `edit-source-permissions` / `update-source` sees only their own entries) is unchanged.
- `createDamaSource` already seeds the column (creator `*`). Confirm it still does once the mirror hook
  is gone.

### The catalog and the client list

- `getSiteSources` returns the pattern's internal sources only, as before 2026-11-05.
- The client lists each pgEnv's sources from `uda[<pgEnv>].sources` again: `buildEnvsForListing` stops
  dropping a "mirrored" pgEnv. Read this client code before estimating it; it is the least examined piece.
- Hidden types / categories are applied by the pgEnv's own listing, as they were.

### What is deleted

- `dama/mirror.js`, `scripts/reconcile-pgenv-mirror.js`, `tests/test-pgenv-mirror.js`.
- The hook calls in `metadata.js`, `uda.controller.js`, `delete.js` (and `MIRRORED_SOURCE_KEYS` /
  `MIRRORED_VIEW_KEYS`, `afterWrite`).
- `snap.external` in `owners.js index()`.
- `settings.mirror_apps` on each pgEnv (a key nothing reads afterwards; removed by the migration).
- [prune-unlisted-views-deletes-mirror-rows.md](./prune-unlisted-views-deletes-mirror-rows.md) has
  nothing left to fix once the rows are gone: close it with this task.

### Removing the rows that exist (Phase 1, before any auth change)

Owner, 2026-11-12: the first thing done is deleting the mirror rows already in the database.

**What is there** (read-only count over the 178 main tables of `dms-mercury-3`, 2026-11-12; other DMS
databases not checked):

| App | pgEnv | Source rows | View rows | Env row | Created |
|---|---|---|---|---|---|
| `mitigat-ny-prod` | `hazmit_dama` | 13,552 | 14,038 | 1 | 2026-11-07 to 2026-11-10 |
| `rowauth-test` | `hazmit_dama` | 0 | 0 | 1 | 2026-11-02 |

`scripts/retire-pgenv-mirror.js --db <config> --app <app> [--pg-env <name>] [--apply]`, dry run by default:

1. **Report grants that differ.** For each mirror source row, compare `data.auth_permissions` with the
   pgEnv column. Same: nothing to do. Different: listed.
2. **Copy back** (`--apply`): write the mirror's grants to the column, **unless** another app's mirror of
   the same source differs from this one too. Then it stops and lists both: the owner picks. It never
   merges or picks a winner. (Today only one app has mirrors, so this cannot arise yet.)
3. **Drop the app from `settings.mirror_apps`** of the pgEnv, **first**. While it is listed, every
   server running the mirror hooks re-creates a row on each source or view create.
4. **Delete the mirror rows**: every `source` / `view` row of the app carrying `data.pgEnv`, in one
   transaction. The `:dmsenv` row stays, with its grants.

**What running it before the auth change does**, while servers still run the mirror code:

- Under `DMS_AUTH_MODE=log`: nothing is refused. Every external read logs a would-deny (`no mirror row`).
- Under `enforce`: every external source and view is refused until Phase 2 is deployed. So Phase 1 needs
  every server on that database at `log`; confirm mercury's mode before `--apply`.
- Editing an external source's grants fails (`setGrantsIn` finds no row) until Phase 3. Reading them
  falls back to the column.
- The hooks mirror nowhere once `mirror_apps` is empty, so nothing comes back.

### What this does to the other tasks

- [pgenv-config-on-the-site-row.md](./pgenv-config-on-the-site-row.md): `attachPgEnv` becomes "create the
  one `:dmsenv` row and its `dms_envs` ref". No reconcile, no stubs, no `mirror_apps`, no long-running
  job; detach removes one row. That doc is updated when this task is accepted, not before.
- [pgenv-mirror-into-dms.md](./pgenv-mirror-into-dms.md): closed as superseded when Phase 4 lands.

## Things to watch

- **Groups are shared across apps.** A grant naming a group applies in every app on the pgEnv, as before
  the mirror. Two apps whose auth projects use the same group name for different people would share a
  grant. Check which sites share a pgEnv and whether their auth projects differ.
- **`resolveAuthPermissions(stored, subdomain)`** is applied to the column's value. A subdomain-keyed
  grant shape there means the same thing for every app; confirm no site relies on it.
- **Direct-SQL plugins** (38 files in `data-types/`) are correct again without a reconcile: this is the
  main thing the reversal buys.
- **The catalog cache is per process.** Two servers on one pgEnv see a grant change within 30 s.
- **Internal sources are untouched.** Only the branch where `env` is a pgEnv name changes.

## Phases

### Phase 1 — remove the mirror rows that exist
- [x] `retire-pgenv-mirror.js` + tests (same grants, differing grants, two apps diverged, `mirror_apps`
      entry dropped, rows deleted, env row kept, re-run is a no-op).
- [x] Dry run on `mitigat-ny-prod` / `hazmit_dama` (2026-11-12): 13,552 sources, 14,038 views, **one**
      source whose grants differ (below).
- [ ] Owner: confirm every server on the database is at `DMS_AUTH_MODE=log`, or deploy this code first.
- [x] Owner chose the pgEnv side for source 14301. Run 2026-11-12 with `--apply --grants pgenv`: 27,590 rows
      deleted, 0 grants copied, `mitigat-ny-prod` removed from `hazmit_dama`'s `mirror_apps` (now empty).
- [x] Counted again on `dms-mercury-3`: zero source / view rows carrying `pgEnv`; both env rows kept.
- [ ] Check the other DMS databases the same way.

### Phase 2 — auth reads the pgEnv
- [x] `owners.js`: the pgEnv cache; `snapshotFor`'s pgEnv branch builds source / view rows in memory;
      `snap.external` removed; `clearSnapshots` clears both; `clearPgEnv(env)`.
- [x] `dama/pgEnv.js`: `sourcesTable` / `viewsTable`, `envRowOf`, `ensureEnvRow`.
- [x] The six suites that called the mirror helper attach the pgEnv instead (`tests/attach-pgenv.js`).
- [x] New cases (`tests/test-pgenv-auth.js`): no env row refuses; no site named refuses; a view is judged
      on its source's grants and the env's; `view: false` narrows; a grant write is read at once; a
      source made after the cache was filled is found.
- [ ] Measure the pgEnv cache load on `hazmit_dama` under real traffic (the dry run's two reads of all
      sources and views took a few seconds from a laptop, most of it connection setup; not timed alone).

### Phase 3 — grants and the catalog
- [x] `uda.route.js`: `writeSource` and the `sources.byId` get use the column; `updateSource` clears the
      pgEnv cache when it writes `auth_permissions`.
- [x] `getSiteSources` lists internal sources only; client `buildEnvsForListing` lists every pgEnv,
      `DatasetsList` no longer treats a row carrying `pgEnv` as a mirror.
- [ ] Check the datasets list, the source page and the permissions editor in a browser on a site with a
      pgEnv, under `log` and under `enforce`. Not done: tests only.

### Phase 4 — delete the mirror
- [x] Removed `dama/mirror.js`, the hooks in `metadata.js` / `uda.controller.js` / `delete.js`,
      `scripts/reconcile-pgenv-mirror.js`, `tests/test-pgenv-mirror.js`, `tests/mirror-sync.js`.
- [x] `scripts/attach-pgenv.js` keeps the one thing the reconcile did that is still needed: the env row.
- [x] Docs: `dama/CLAUDE.md` ("Reads", `requireCan` helper row), `scripts/README.md`, the headers of
      `owners.js` and `siteGrants.js`.
- [x] `pgenv-config-on-the-site-row.md` notes the one-row attach; `pgenv-mirror-into-dms.md` and
      `prune-unlisted-views-deletes-mirror-rows.md` marked dropped (not moved until the rows are gone).

## Testing

- `npm test` plus the auth suites (read, data, source, uda-auth, upload, schedule, datatype) on SQLite.
- The Postgres container for the catalog queries (`node tests/postgres-docker.js run tests/<test>.js`).
- Known failures that are not this task's, as of 2026-11-10: `test-pattern-stub` (3), `test-uda` (2),
  `test-migrate-site`, `test-db-copy` (1), and `test-auth.js` "users by project".

## Built — 2026-11-12

Nothing committed. `retire-pgenv-mirror.js` has been run only as a dry run.

**What changed**
- `routes/auth/owners.js`: `snapshotFor`'s pgEnv branch finds the site's env row, reads the subject from
  the pgEnv (`pgEnvSubject`) and returns `externalRow(...)`. A cached bulk read per pgEnv
  (`source_id → grants`, `view_id → source_id`) answers reads; a `fresh` question (every write verb, and
  a read's one retry) asks the pgEnv for that one subject and patches the cache, so a write never
  reloads the lot and a source created seconds ago is found.
- Grants: the column. `uda.sources.update` no longer refuses a grant write that names no site by itself;
  the auth check does, under `enforce` (`no site named`).
- The design section above said the cache would hold `name, type, categories`; it holds only grants.
  Nothing in the walk reads the others.

**Found on the way**
- **The controller's delete is unsafe for mirror rows.** `cascadeSourceDelete` finds a source's views by
  `'<slug>|%:view'` and drops their split data tables. A mirror source that shares a slug with an
  internal source would take that source's views and tables. The removed `unmirrorSource` hook went
  through it. The retire script deletes by id instead, and a test holds a same-slug internal source and
  view in place.
- **One source differs on `mitigat-ny-prod`:** `hazmit_dama` 14301 (mirror row #2902393). Mirror
  `{"users":{"1468":null},"groups":{"public":[]}}`, column `{"groups":{"public":[]}}`. A `null` grant
  list for user 1468 confers nothing, so either side reads the same; `--grants pgenv` is the tidy one.
- **Removing a user or group from a site no longer strips their grants on pgEnv sources**
  (`auth/utils/siteGrants.js` sweeps DMS rows only). That is the pre-mirror behaviour; say if it needs
  a sweep of the column.

**Tests** (2026-11-12)
- New `tests/test-pgenv-auth.js`: 21 pass on SQLite and on the Postgres container
  (`DAMA_TEST_DB=dama-postgres-test`).
- Pass: `npm test`; read-auth 30, uda-auth 29, source-auth 27, upload-auth 37, schedule-auth 12,
  datatype-auth 8, data-auth 66, sync 107, access-log 14, site-grants 8; client vitest 61.
- Fail, not from this task: `test-uda` 2 (the same two as on 2026-11-10: a write naming no site is
  logged, not refused, under `log`); `test:pg:transactions` 1 ("one backend per transaction":
  `setDataById` reads the row's type before its transaction when no type is passed; that lookup is in
  the committed code).

## Progress

- 2026-11-12: `retire-pgenv-mirror.js --apply --grants pgenv` run on `mitigat-ny-prod` at the owner's request; verified zero mirror rows left.
- 2026-11-12: built (all four phases' code); dry run on `mitigat-ny-prod`. The `--apply` run is the owner's.
- 2026-11-12: phases reordered on the owner's instruction: removing the existing mirror rows is Phase 1.
  Counted them on `dms-mercury-3` (read-only): 27,590 rows, all `mitigat-ny-prod` / `hazmit_dama`.
- 2026-11-12: filed from the owner's decision. Assessed against the code (`owners.js`, `mirror.js`,
  `uda.route.js`, `utils.js`); nothing built.
