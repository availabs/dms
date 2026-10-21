# Internal publish: new columns never reach the source, and the upload page makes stray source rows

**Initiatives:** [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) (primary), [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Release:** commit — committed on master 2026-10-21, not pushed; client + dms-server deploy pending · **Created by:** ssangdod@albany.edu · **Edited by:** —

Found 2026-10-21 during [permissions-ds-upload-publish-routes.md](./permissions-ds-upload-publish-routes.md)'s live
check. Neither bug comes from that task.

## ▶ Next session (updated 2026-10-21, end of prod checks)

Nothing is left to build or check. Prod checks are done (below) and the owner closed the clean-up: columns were
intentional, **leave the 12 strays alone**. What's left is release only:
1. **Not pushed on its own.** The work is on local branch `permissions_move` (both repos, `origin/master` merged in
   2026-10-21). Owner: no push until every step of the permissions move is done and every feature touched is tested
   end to end; this fix ships with that branch.
2. Deploy client + dms-server. Once both are out, set Status to `done`, move this file to `tasks/completed/`, fix
   inbound links (`permissions-ds-upload-publish-routes.md`), add it to `completed.md`, and run
   `node planning/shared/scripts/refresh_initiatives.mjs` from the dms-template root.

After that, continue with the permissions hub, `auth-levels-to-permissions.md` "▶ Resume here": tasks 6–8
(downloads/PM tiles/`/files`; schedules + task status reads; pattern ops), then 9; 10 any time.

## Prod checks: done 2026-10-21 (read only, nothing changed)

Ran as read-only SQL on `dms3` (`psql` session with `default_transaction_read_only=on`; the CLI can't list across
apps or reach `dms.data_items`). Scratch script: session scratchpad `q.sh`.

**Bug 1 (legacy-table collisions): none.** `dms.data_items` holds 6 rows, last `updated_at` 2026-02-05, so no row
was written after 2026-02-24. The lost config writes matched nothing and harmed nothing.

**Bug 2 (stray source rows): 12, all in `mitigat-ny-prod`**, type `datasets|form-manager|source`, data only
`{config}`, `created_by` 656, 2026-07-07 → 2026-09-17. No other app of the 120 per-app schemas has a config-only
row of any type created since 2026-06-17. No row's `sources` array references any of them. Each matches one real
source (`test_meta_forms_env|<slug>:source`): the stray holds all of that source's attributes plus the columns the
upload added, which are still missing on the source.

| Stray | Created | Source | Columns missing on the source |
|---|---|---|---|
| 2261502 | 07-07 | 1473468 Participation | `geo_id_juris` |
| 2261653 | 07-07 | 1473295 Roles | `hmp_process_participation_what_meetings_they_were_in`, `required_stakeholder_list_but_this_wont_be_jurisdictional_ppl` |
| 2370569 | 08-07 | 1068273 Capabilities_Catalogue | `adequacy`, `interest_need`, `included_in_last_shmp_update_dhses_use_only`, `training_audience`, `trainings` |
| 2385588 | 08-14 | 1029065 Actions_Revised | `action_status_details_2`, `did_you_submit_this_action_for_grand_funding`, `hazard_name_if_other` |
| 2481418 | 09-08 | 1473295 Roles | `id` |
| 2481428 | 09-08 | 1473468 Participation | `id` |
| 2481430 | 09-08 | 1473470 Hazards_of_Concern | `id` |
| 2481433 | 09-08 | 1029065 Actions_Revised | `did_you_submit_this_action_for_grand_funding`, `local_priority` |
| 2481995 | 09-08 | 1068273 Capabilities_Catalogue | `id`, `included_in_last_shmp_update_dhses_use_only`, `social_vulnerability_benefits`, `training_audience`, `trainings` |
| 2514968 | 09-15 | 1068273 Capabilities_Catalogue | `audience`, `audience_size`, `buildings`, `duration`, `format`, `id`, `trainings` |
| 2514995 | 09-15 | 1068273 Capabilities_Catalogue | `audience`, `audience_size`, `buildings`, `duration`, `format`, `id` |
| 2708151 | 09-17 | 953754 DHSES_County_Database | `id` |

Do the uploaded rows hold values in those columns? (Counted non-empty `data->>col` in each source's split tables
`data_items__s<src>_v<view>_<slug>`.)
- **Real data hidden by the missing columns: 3.** `hazard_name_if_other`: 68 of 19,889 rows (Actions_Revised view
  1074456). `buildings`: 92 and `social_vulnerability_benefits`: 20, of 7,981 rows (Capabilities_Catalogue view 1172519).
- `id`: values in most of these sources' views. That's a sheet column named `id`, probably not one to add as an
  attribute (it shadows the row id).
- All the other missing columns: no values in any row.
- Aside, not from this bug: `data_items__s1068273_vundefined_capabilities_catalogue` has 33 rows (written with an
  undefined view id); the Actions_Revised and Hazards_of_Concern `vundefined` tables are empty.

**Owner, 2026-10-21: the missing columns were intentional.** Nothing to add to the sources, and the 12 strays
stay (owner: leave them alone).

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
- [x] Clean-up: none. 12 stray rows on `mitigat-ny-prod` found (see "Prod checks"); owner, 2026-10-21: the missing
  columns were intentional and the strays stay.

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
