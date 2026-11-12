# Mirror every pgEnv into DMS: an env row per pgEnv, a row per source and view

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** dropped — superseded by [pgenv-auth-without-mirror-rows.md](./pgenv-auth-without-mirror-rows.md): the mirror was reversed on 2026-11-12; not moved: until `retire-pgenv-mirror.js` has run on `mitigat-ny-prod` · **Created by:** amuro@albany.edu · **Edited by:** ssangdod@albany.edu

## Objective

An external source (a pgEnv's `data_manager.sources` row) is the one auth subject that is not a DMS row.
Everything in `routes/auth` that is not general exists to fake a row for it: the second loader
(`owners.js loadExternal` / `externalSnapshot`), the named-pattern locator (`?dms_pattern=`, `X-DMS-Pattern`,
`requestPatternRef`, `patternRef` on the Falcor router, `patternId` threaded through `requireCan` /
`assertCan` / `canRead` / `readableSources` and the UDA `reader`, `snap.named` in `patternsOver`), the `strict`
escape in `report.js` and the two UDA assert helpers, the two grant keys in `grantsOf`, and the
`patterns:datasets` entry in every source owner list.

**Owner, 2026-11-05:** mirror the pgEnv into DMS. One `:dmsenv` row per pgEnv, one DMS row per source and
per view, written by hooks in dama. **Both stores are maintained first**; whether to deprecate the dama side is
a later decision. The auth layer then has one kind of subject and the special cases above are deleted.

Dataset **rows** never move: the physical tables stay in the pgEnv and `getEssentials` keeps resolving a view
to its table. This task mirrors identity, parentage and grants (the auth subset) and leaves a full metadata
mirror as a follow-up.

## Row shapes

The same shapes internal sources already use, so the formats (`dmsEnv.format.js`), rules, `childRefs` and
`getSiteSources` describe them unchanged:

| Row | Type | `parent_id` | `data` |
|---|---|---|---|
| env | `{site}\|{name}:dmsenv` | site row | `pgEnv`, `sources: [{ref,id}]` (what `ensure-pgenv-rows.js` creates) |
| source | `{env}\|{slug}:source` | env row | `pgEnv`, `source_id`, `name`, `type`, `categories`, `description`, `authPermissions` |
| view | `{slug}\|v{N}:view` | source row | `pgEnv`, `view_id`, `version` |

The snapshot gains one index, `pgEnv:source_id` / `pgEnv:view_id` → row, so `snapshotFor({ env, sourceId, app })`
keeps its signature and no caller changes.

## Where the writes come from (measured 2026-11-05)

- **Creates: all through the helpers.** No file under `data-types/` inserts into `data_manager.sources` or
  `views`; the 79 plugin files that create them call `createDamaSource` / `createDamaView`
  (`dama/upload/metadata.js`). Two hooks cover creation.
- **Grants:** `uda.controller.js updateSource` with key `auth_permissions` (the UDA route is the only client
  path); three scripts write the column directly and are retired.
- **Deletes:** `dama/delete.js deleteDamaSource` / `deleteDamaView`, plus one plugin that deletes by SQL
  (`data-types/traffic_counts/TMAS/data_loaders/delete_source.js`).
- **Updates the hooks cannot see:** 38 plugin files update `metadata`, `version` and table names by direct SQL.
  None of it is auth-relevant. A full mirror needs a Postgres trigger + outbox or a periodic reconcile; out of
  scope here.

So: hooks on create / grant-write / delete, plus an idempotent **reconcile script** that creates missing mirror
rows, updates grants, removes orphans, and is also the initial backfill. Run it dry by default.

## The site question

A pgEnv is shared by several sites and the server learns which from a client build variable
(`VITE_DMS_PG_ENVS`), not from data. A mirror row lives in one app's table, so:

- The hook writes under the env row of the app the request names (`X-DMS-App` / `dms_app`, already sent).
  A create with no app named is mirrored by the reconcile run, not the hook.
- The reconcile script creates rows for every app that has an env row naming the pgEnv.
- **Env-level grants are per site already** (auth-grants-on-the-owner-row.md, 2026-11-05): a pgEnv's
  sources are judged under the `:dmsenv` row of the site the request names, and that row's `authPermissions`
  are that site's. Only the SOURCE-level grants (`data_manager.sources.auth_permissions`) are still one
  value for every site; they become per site once the dama column is retired. While both stores are
  maintained the hook writes the same source grants to every mirror, so nothing changes yet. Decide before
  Phase 3.
- Requests that name no app cannot reach a mirror. Since 2026-11-05 `dms_app` / `X-DMS-App` is the ONLY
  locator (`dms_pattern` is gone), so this is already the contract; tiles run under `mode: 'log'`. Under
  `enforce` every client must send it (it does since `permissions-dama-admin-client-auth-headers.md`).

## Phases

### Phase 1 — mirror and hooks — DONE 2026-11-05
- [x] `dama/mirror.js`: `mirrorSource(pgEnv, sourceRow, app)`, `mirrorView`, `mirrorGrants`, `unmirror*`.
      Writes through the DMS controller so `change_log` and sync see the rows.
- [x] Hooks in `createDamaSource`, `createDamaView`, `updateSource` (grants), `deleteDamaSource`,
      `deleteDamaView`. Best-effort inside the dama transaction's `afterCommit`; a failed mirror is logged
      and left to the reconcile run, never fails the dama write.
- [x] `dms-server/src/scripts/reconcile-pgenv-mirror.js --db --app --pg-env [--apply]`: env row (absorbs
      `ensure-pgenv-rows.js`), sources, views, grants, orphans. Dry run prints the diff.
- [x] Tests on the SQLite dama harness (`dama-sqlite-test`): create → mirror row with parent; grant write →
      mirrored; delete → removed; reconcile idempotent.
- [x] Run the reconcile on every site; compare `loadExternal`'s view (source → env row, grants) with the
      mirror's for every source. Zero diffs gates Phase 2.

### Phase 2 — the auth layer reads the mirror — DONE 2026-11-05
Done ahead of this task by auth-grants-on-the-owner-row.md: `snap.named`, `patternsOver`, the `patternId`
plumbing through the guards / `reader` / `canRead` / `readableSources`, `requestPatternRef` /
`parsePatternRef` / `patternRef` / the `X-DMS-Pattern` header, the client's `dms_pattern` tagging, the
datasets sweep and the `patterns:datasets` position. An external source is already judged under the
site's env row (`['ancestor:dmsenv', 'self']`); the mirror row's parent is that same env row, so the
rules do not change again.
- [x] `snapshotFor` resolves an external `{ env, sourceId | viewId, app }` through the new index.
- [x] Delete: `loadExternal`, `externalSnapshot`, the `external` flag; `strict` in `report.js`, `can()`,
      `assertSourceWrite`; the `auth_permissions` key in `grantsOf`; the external exception in
      `auth/utils/siteGrants.js`; the three grant scripts (`grant-public-read-sources.js`,
      `grant-groups-star-on-sources.js`, `migrate-source-auth-to-permissions.js`).
- [x] Rerun every auth suite; `test-source-auth.js` / `test-read-auth.js` external cases become mirror cases.

### Phase 3 — the stub per site over a canonical origin — DONE 2026-11-05

**Owner's decision.** The mirror stays an AUTH STUB per site (identity, parentage, grants) over a canonical
origin, which is `data_manager` for now. Not a full mirror, and not a catalog app per pgEnv: a catalog app
would have sites reference another app's rows, and apps stay isolated from each other (an unnamed rule the
owner wants kept). Per-site grants are not a requirement but are welcome; the stub gives them. Metadata,
column definitions, statistics, table locations and data rows keep coming from the pgEnv.

- [x] **The catalog lists the mirrors.** Add each mirror source to its site's env row `sources` list (the
      reconcile and the create hook append the ref; the delete hook removes it), so the datasets list reads
      ONE env for internal and external sources and the `isDms` split on the list goes. The public identity
      of an external source stays `(pgEnv, source_id)`, carried on the row; links by `source_id` keep working.
- [x] **Grants are edited on the mirror, per site.** The Access editor writes the mirror row's
      `auth_permissions` through the ordinary DMS edit path (judged by the source rule like any row); the
      `updateSource` hook stops copying `auth_permissions` from dama, and dama's column becomes a seed for a
      site's first reconcile only. Retire: the three `grant-*` scripts, `listExternalGrants` in the leave-site
      stripping (mirror rows are stripped like any row from then on), and the mirror-skip added there.
- [x] **The no-site fallback becomes a refusal.** A request naming no site is refused (`no site named`): with
      per-site grants the "first mirror site" answer would leak one site's grants to another. Every client
      sends `dms_app`; verify the signed download link and the tile routes still carry it before flipping.
- [x] SourcePage and the version list keep reading `uda[pgEnv]`; the `isDms` branches in `uda.controller.js`
      and `uda/utils.js` stay for data and metadata reads. Collapsing them is a later task, if ever.

## Decided

- Auth subset first; full metadata mirror is a follow-up with its own design (trigger + outbox).
- Dual maintenance until Phase 3 decides; the dama tables stay the source of truth for everything the
  hooks do not mirror.
- **2026-11-05, owner: no catalog app, no full mirror.** Apps stay isolated (no cross-app row references);
  `data_manager` stays the canonical origin for metadata and data; the per-site stub is the auth subject and,
  after Phase 3, the record for grants. A catalog app per pgEnv was considered (canonical ids, no fan-out,
  shared grants) and set aside for the isolation rule; dropping cross-site pgEnvs was set aside because
  shared pgEnvs are real.
- **Which sites mirror a pgEnv is data on the dama side**: `settings.mirror_apps` of the pgEnv, written by
  the reconcile (`--apply`). The hooks mirror into every app listed; nothing scans tables for apps.
- **A request naming no site** (an old client, a bare download link) is judged in the FIRST site that
  mirrors the pgEnv: the source's own grants are the same in every mirror, that site's env grants ride
  along. Naming the site (`dms_app`) stays the contract; the fallback keeps `log` mode useful. Owner to
  confirm or tighten before `enforce`.
- `strict` is gone: an external source with grants follows the mode like every row (`log` allows and
  logs). `grantsOf` keeps reading `auth_permissions` — it is the SOURCE kind's attribute key, on internal
  and mirror rows alike (the task's note that it was external-only was wrong).
- The three grant scripts (`grant-public-read-sources.js`, `grant-groups-star-on-sources.js`,
  `migrate-source-auth-to-permissions.js`) stay while dama is the record; their headers say to reconcile
  after. `auth/utils/siteGrants.js` lists external grants from dama and skips mirror rows when stripping
  (the pgEnv is the record), instead of the exception being deleted.

## Build log — 2026-11-05

- `dama/mirror.js`: `mirrorSource` / `mirrorView` / `unmirrorSource` / `unmirrorViews` (across
  `settings.mirror_apps`, best effort, `afterWrite` defers to the caller's `afterCommit`), `reconcile({ app,
  pgEnv, apply })` (env row create / adopt, sources, views, orphans, registration), `envRowOf`,
  `mirrorRows`. Reads never create a table; writes go through the DMS controller (change_log, sync).
- Hooks: `dama/upload/metadata.js` (`createDamaSource`, `createDamaView`), `routes/uda/uda.controller.js`
  (`updateSource` on a mirrored key, `updateView` on `version`, `createSourceView`), `dama/delete.js`.
- `scripts/reconcile-pgenv-mirror.js --db --app [--pg-env] [--apply] [--verify]` replaces
  `ensure-pgenv-rows.js` (deleted).
- `routes/auth/owners.js`: the snapshot indexes mirror rows by `(pgEnv, id)`; `snapshotFor({ env, sourceId |
  viewId, app })` reads the index (fallback above); `loadExternal`, `externalSnapshot`, the `external` flag
  deleted; `sourceOfView` answers a pgEnv's `source_id` for a mirror. `report.js`, `index.js`, the UDA routes:
  `strict` deleted.
- Tests: new `tests/test-pgenv-mirror.js` (10: reconcile dry / apply / clean / drift / orphans; every hook;
  after-commit; a registered app with no env row). `tests/mirror-sync.js` reconciles a suite's fixture after
  its direct-SQL dama inserts; read / source / uda / upload / schedule / datatype suites ported (fixtures now
  create rows through the controller, so its id allocator and the mirror's creates agree). All 15 auth
  suites green; `npm test` core green. Not run: the HTTP auth suite (Postgres container).
- **Phase 3 (same day).** Grants: `MIRRORED_SOURCE_KEYS` no longer includes `auth_permissions` (seeded on
  create, the mirror's own after); `mirror.grantsIn` / `setGrantsIn`; `uda.route.js writeSource` diverts the
  key to the site's mirror and the `sources.byId` get overlays it; the three `grant-*` scripts deleted;
  `listExternalGrants` and the `pgEnvs` plumbing (handlers, auth pages, siteConfig) deleted — mirror rows
  are stripped like any row when a user or group leaves a site. Catalog: `getSiteSources` lists the site's
  mirrors by query (not by refs on the env row: a pgEnv has thousands), with the pgEnv's hidden types /
  categories (`hiddenOf`); `buildEnvsForListing` drops a mirrored pgEnv from the external datasources and
  asks the internal env for `pgEnv` + `source_id`; `DatasetsList` links a mirror to the external source
  page. Fallback: `snapshotFor` refuses a request naming no site. Tests: uda-auth gains the per-site
  grants case (written to the mirror, read back, the column untouched, a new grantee reads, no site →
  refused); mirror test covers `grantsIn` / `setGrantsIn` and that a pgEnv grant change is not copied;
  read / source / upload / schedule / datatype fixtures name the site on every request.
- Rollout: for every site and every pgEnv it uses —
  `node src/scripts/reconcile-pgenv-mirror.js --db <config> --app <app> --pg-env <pgEnv>` (dry), then
  `--apply`, then `--verify`. Until a site is reconciled, its external sources have no mirror: under `log`
  reads and writes are allowed and logged (`has no mirror row … reconcile-pgenv-mirror.js`); under `enforce`
  they are refused. A dama-test db with hundreds of leftover sources makes every suite's reconcile slow-ish.

## Related

- [auth-layer-simplification.md](./auth-layer-simplification.md) — built; left the external branch in place.
- [format-declarations-server-side.md](./format-declarations-server-side.md) — companion: the env row's
  vocabulary and the source rule come from the `formats` table, not a stamp.
- [row-auth-uda-unify-api.md](./row-auth-uda-unify-api.md) Phase 2 — created the env row per pgEnv
  (`ensure-pgenv-rows.js`), the first half of this.

## Progress

- 2026-11-05: filed from the analysis in the auth-simplification session; Phases 1 and 2 built the same day.
  Phase 3 decided and built the same evening (stub per site over a canonical origin; the catalog lists the
  mirrors; grants edited on the mirror per site; a request naming no site is refused).

## Note (2026-11-11, ssangdod@albany.edu): `--no-register`

`reconcile-pgenv-mirror.js --no-register` (`reconcile({ register: false })`) skips registering the app in the
pgEnv's `settings.mirror_apps`, the one write the reconcile makes to the pgEnv. For a server reading another
server's pgEnvs (the tenant hub reads production's, read-only): registered there, the owning server's hooks would
mirror the app into the owning server's own DMS database. Such a mirror is kept current only by re-running the
reconcile. Used by the hub runbook (`planning/shared/tasks/completed/tenant-hub-server.md`, step 6c).

## Bug found 2026-11-11 (ssangdod@albany.edu): mirror views resolved to the wrong source where there is no `parent_id` column

- **Where:** any table without the `parent_id` column, which is production today (no `mitigat-ny-prod` /
  `npmrdsv5` schema has it; `row-auth-production-cutover.md` hasn't run). The controller drops the `parent_id`
  the reconcile sends, so the auth walk (`owners.parentOf`) falls back to the type path, and a view's type
  names its source by SLUG (`{source slug}|v{view_id}:view`). Source names repeat: `hazmit_dama` has 13,552
  sources and 834 distinct slugs, so the walk took the newest source of that name.
- **Measured on the 2026-11-11 garage backup** (production's own `mitigat-ny-prod` mirror, copied as the hub's
  `mny`): of 14,038 mirror views, **13,175 resolved to another source, 4,060 of them to one with different
  grants**. A view read was judged under the wrong source's grants (no effect while `DMS_AUTH_MODE=log`).
- **Fix (dms `routes/auth/owners.js` `parentOf`):** when no `parent_id` is stamped, a mirror view
  (`data.pgEnv` + `data.view_id` + `data.source_id`) goes to its source by the mirror's identity through the
  snapshot's existing `external` index. A stamped `parent_id` still wins. After it: 14,038 / 14,038 (and
  15,284 / 15,284 per hub tenant with npmrds2 added). Test: `test-pgenv-mirror.js`, "two sources with the
  same name …" (a table without the column; fails without the fix).
- **Not a fix:** running `migrate-row-auth.js --add-columns` later. Its type-path pass skips ambiguous names, so
  these rows stay without `parent_id`, and with the fix they don't need it.
- **Concrete case** (2026-11-11 backup; same rows on production since the 11-07 reconcile). Two `hazmit_dama`
  sources are both named "SHMP to LHMP Launch Map", so both mirrors are typed
  `hazmit_dama|shmp_to_lhmp_launch_map:source`:
  - row 2902677, `source_id` 12891: `{"users":{"656":["*"]},"groups":{"AVAIL":["*"],"public":[]}}` (not public)
  - row 2908021, `source_id` 2000: `{"groups":{"AVAIL":["*"],"public":["view-source"]}}` (public)

  View row 2929709 is `shmp_to_lhmp_launch_map|v13633:view` with `data.source_id` 12891, but the type path picks
  the newest row of that slug, 2908021 (source 2000). So under `enforce` an anonymous user could read view 13633
  of the non-public source 12891. Read-only check on production:

  ```sql
  SELECT id, type, data->>'source_id' AS source_id, data->'auth_permissions' AS grants
  FROM dms_mitigat_ny_prod.data_items
  WHERE type = 'shmp_to_lhmp_launch_map|v13633:view' OR type LIKE '%|shmp_to_lhmp_launch_map:source'
  ORDER BY id;
  ```
- **Ids are sound.** Production's mirror against production's `data_manager` (2026-11-11): 13,552 / 13,552
  sources and 14,038 / 14,038 views present, names equal, every view's `source_id` equal to the pgEnv's, no
  duplicates, nothing unmirrored. The stored `(pgEnv, source_id)` / `(pgEnv, view_id)` can be trusted; only
  the type path is wrong.
- **Each external source is listed twice on the list page, and that is kept on purpose (owner, 2026-11-11).**
  `getSiteSources` (uda/utils.js) lists the site's mirrors in its catalog (`app+…` env) beside the internal
  sources, and the client still lists each pgEnv's own sources (`uda[hazmit_dama].sources`) too. Not a bug.
- **The fix, measured on the 2026-11-11 backup of production:** with `parentOf` reading `(pgEnv, source_id)`,
  all 14,038 views resolve to their own source (before: 13,175 wrong, 4,060 with different grants), and all
  13,552 sources to their own pgEnv row.
