# Internal publish: new columns never reach the source, and the upload page makes stray source rows

**Initiatives:** [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) (primary), [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Release:** commit — committed on master 2026-10-21, not pushed; client + dms-server deploy pending · **Created by:** ssangdod@albany.edu · **Edited by:** —

Found 2026-10-21 during [permissions-ds-upload-publish-routes.md](./permissions-ds-upload-publish-routes.md)'s live
check. Neither bug comes from that task.

## Objective

Uploading a spreadsheet into an internal source (`internal_source/:id/upload`) should append the sheet's new
columns to the source's `config.attributes`. Today it never does, on any per-app database (prod `dms3` is
per-app), and the upload page inserts a stray source row on each upload that adds columns.

## Bug 1 (server): the publish's config write updates the wrong table

`dama/upload/routes.js`, publish handler stage 5:
`controller.setDataById(resolvedSourceId, { config }, { id: user_id })`, with no `app`. Without `app`,
`setDataById` targets `tableName('data_items')`, the legacy shared table, not `data_items__<app>` (SQLite) /
`dms_<app>.data_items` (Postgres). The UPDATE matches no row, returns `[]`, raises nothing, and the handler logs
`saved config: +N new attrs` anyway.

- Reproduced on a fresh per-app app (scratchpad `bug1/repro.js`): publish 200, rows created, log says saved,
  source row unchanged (same attributes, same `updated_at`). Control (`bug1/control.js`): the same call with
  `app` updates 1 row; without it, 0.
- **Since 2026-02-24** (`6d117fec`, Alex Muro): the commit that added per-app mode and `setDataById`'s `app`
  argument also wrote this call without it. It has worked only on legacy-mode databases.
- Open question (not checked, prod is off limits without the owner): on Postgres, `tableName('data_items')` is
  `dms.data_items`. If `dms3` still holds legacy rows there, an id collision would have merged a `config` into an
  unrelated legacy row.

## Bug 2 (client): `parent.source_id` is undefined for internal sources

`patterns/datasets/components/upload.jsx`:
- `updateMetaData` → `apiUpdate({ data: { id: parent.source_id, config } })`. `id` undefined → `dmsDataEditor`
  takes the **create** path: a new row of type `<pattern>|source` holding a copy of the config (live: row 98,
  `data|form-manager|source`).
- `publish({ sourceId: parent?.source_id })` → `sourceId` undefined → the server falls back to finding the source
  by slug (`findSourceIdByDocType`, newest row with that slug).

`parent` is SourcePage's `source`. Since **2026-06-17** (`24cb39d6`, Eric Conklin, inside "backups added to
dms-server") SourcePage skips `getSourceData` when the route preloaded `item`, so for an internal source `source`
is the DMS row (`id`, no `source_id`). `getSourceData` used to add `source_id`; the Feb fix
([fix-upload-updatemetadata.md](../completed/fix-upload-updatemetadata.md), `9444dd76`) relied on it.

## Fix

- [x] Server: pass `app` (`setDataById(resolvedSourceId, { config }, { id: user_id }, app)`).
- [x] Client: one id, `parent?.source_id ?? parent?.id`, for both `updateMetaData` and the publish `sourceId`.
- [ ] Clean-up (owner decision): stray `<pattern>|source` rows made since 2026-06-17 on real sites. Not listed in
  any pattern/dmsEnv `sources`, so invisible in the UI; find them by type and the config they carry.

## Testing checklist

- [x] Regression test `tests/test-dms-publish-config.js` (3): new columns land on the source row in the app's table
  (body `sourceId`); a repeat publish adds nothing; with no `sourceId` the source is found from the data type and its
  config still updates. **Fails 3/3 with the server fix reverted**, passes with it. SQLite ✓, Postgres ✓.
- [x] Still green: `test-upload-auth` 24 (SQLite + Postgres), `test-uda-auth` 24, `test-source-auth` 48,
  `test-upload-pipeline` 12.
- [x] Live (3458 current code on a fresh copy of 3457's DB, `enforce`; 5197; `flow-internal.mjs`): publish sends
  `sourceId=4` (`resolved source_id=4 via request`); **no** `sync/push I …|source` insert (before the fix: row 98,
  `data|form-manager|source`); the client's config edit arrives as `sync/push U … :source id=4`; source 4's
  attributes went from 6 to 8 (`name`, `value`), `updated_at` moved.

## Notes

- Two writers set the same config: the client (`updateMetaData`, local-first, lands after the publish) and the
  server (publish stage 5). Both compute existing + new by name / display name, so the result is the same; whichever
  lands last wins. Dropping the client write is possible later; kept so the fix stays minimal.
- Callers of `components/upload.jsx`: only the internal source upload page changes behaviour (its id was undefined).
  `internal_table` sourceCreate already passes both `id` and `source_id`; the page section `Upload` is a different
  module (`forms/components/upload`).
