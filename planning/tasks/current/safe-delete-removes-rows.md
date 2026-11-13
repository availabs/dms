# Delete means delete: every user-facing delete removes its rows, safely

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** —

**Project:** DMS library (`src/dms` submodule) · **Topic:** dms-server, patterns/page, patterns/admin, patterns/datasets, cli

## Objective

Many deletes in DMS don't remove the underlying rows. Some only drop a reference. Some delete a parent and
leave its children. Some delete a row but leave its files or its sync state behind. Make each one remove what
it owns, through **one server-side cascade** with the safety rails the tenant delete and DAMA delete already have:

- a read-only plan route;
- a backup;
- a transaction;
- change_log entries;
- a refusal when something else still depends on the row.

## Audit (2026-11-12, read-only code audit)

Paths are relative to `src/dms/packages/`. "Covered" means another task already owns that part. This task links
to that task and does not repeat its work.

| # | Surface | What's left behind | Severity | Covered |
|---|---|---|---|---|
| F1 | Page **Publish / Discard** (`patterns/page/pages/edit/editFunctions.jsx:187-197, 227-231`). Each one mints new section rows and drops the old ids. | the previous generation of section rows. mitigat-ny-prod has ~218k orphan sections | bloat | [row-auth-parentage.md](./row-auth-parentage.md) (the sweep) |
| F2 | Page editor **remove section** (`page/components/sections/sectionArray.jsx:412-445`) | the component row. Only the ref is removed | bloat | row-auth-parentage.md |
| F3 | **Delete page**: page editor menu (`pagesPane.jsx:180,291`), admin Pages tab (`admin/pages/patternEditor/pages/pagesEditor.jsx:909-916`), `dms page delete` | its sections and `page-edit` history; its **child pages**, which drop out of the nav but stay published at their URLs; its `yjs_states` row | ghost public pages, bloat | sections only (row-auth-parentage.md). **Child pages: none** |
| F4 | Admin **delete pattern** (`admin/pages/editSite.jsx:676-681`, `admin/components/patternList.jsx:466`). It only rewrites `site.patterns` | the pattern row, all its pages, sections, edits and templates. For datasets, also the dmsEnv, sources, views and split tables. No `childRefs` exists for site→pattern, so even `delete` sweep mode never reaches them | bloat, instance names stay taken | one-off clean-ups only ([retire-duplicate-admin-pattern.md](../../../../../planning/mitigateny/tasks/current/retire-duplicate-admin-pattern.md)). **Cascade: none** |
| F5 | Admin **remove theme** (`admin/pages/themes/list.jsx:212`) | the theme row. Patterns still name its `theme_id` | bloat, dangling refs | none |
| F6 | Datasets **Delete source** (`DeleteSource.jsx:113` → `dms-server/src/routes/uda/uda.tasks.controller.js:255-425` `deleteInternalSource`) | views not listed in `data.views`, with their split tables; the source's ref in **pattern** `data.sources`. It writes **no change_log**, so sync and WebSocket clients keep showing the source. The controller's `_sourceIdCache` is not cleared. The other path (`cascadeSourceDelete`, `dms.controller.js:652`) leaves `dms.tasks` rows | ghost datasets entries | path B only ([delete-cascade-source-view-orphans.md](./delete-cascade-source-view-orphans.md)) |
| F7 | Internal source/view delete, and tenant delete | the **uploaded file** (`dama/upload/file-upload-dms-route.js:251-274`), still downloadable at its `dl_url`. Only DAMA paths call `storage.remove` | **data leak** | explicitly out of scope in delete-cascade-source-view-orphans.md |
| F8 | Image/file removed from rich text or a Card cell | its `file_upload` source and stored file. 11,057 hidden upload sources exist on hazmit_dama | **data leak**, bloat | none |
| F9 | The parentage sweep (`dms-server/src/routes/dms/parentId.js:472-530`) when it deletes | **no change_log `D` entries** for the swept rows, so local-first clients keep them | ghost UI | none (gap in row-auth-parentage.md) |
| F10 | CLI `dms section delete` (`dms/cli/src/commands/section.js:262-293`) | With `--page`: the ref stays in published `sections`. Without `--page`: the row is deleted and both arrays still name it | broken published page | none |
| F11 | CLI `dms page delete` / `dms raw delete` | the same as F3. The CLI does exactly what the server does | — | via F3 |
| F12 | `deleteData` (`dms.controller.js:1630-1640`) | writes `D` change_log entries for **every id passed in**, even ids it didn't delete (e.g. a wrong table from the caller's `type`). Clients drop the row and it reappears later | ghost / resurrected rows (suspected impact) | none |
| F13 | Datasets **delete column** (`datasets/components/MetadataComp/index.jsx:122-127`, "can not be undone") | the column's values in every row's `data` (split table), or the real column on a DAMA table | — | **won't fix (owner, 2026-11-13): metadata-only is the intended behavior** |
| F14 | Any page or section delete | the `dms.yjs_states` row. Per-app id collisions can load stale state | stale collab state | [sync-rooms-cross-app-item-id-collision.md](./sync-rooms-cross-app-item-id-collision.md) |
| F15 | Tenant delete (`dms-server/src/routes/tenants/delete.js`) | `tasks`, `access_log` and `yjs_states` (deliberate), storage files (F7), DAMA pgEnv sources | leak via F7 | [tenant-subdomain-uniqueness.md](./tenant-subdomain-uniqueness.md) (partly) |
| F16 | Chat (`src/patterns/chat/messages.js:155-157`, `channels.js:355-358`) | A message delete is soft: `attachments` are kept, and the old body stays in change_log until compaction (readable via the unfiltered `/sync/delta`). A channel delete leaves its `member` rows | **data leak**, bloat | none (site-side pattern) |
| F17 | Delete of a change-tracked row or source (`changeHistory.js`) | prior values in the history dataset. A delete is not recorded at all *(suspected)* | retention | [change-history-growth.md](./change-history-growth.md) covers growth only |
| F18 | Delete user (`dms-server/src/auth/utils/queries.js:16-26`) / delete group | the user's id-keyed grants on DMS rows (no transaction); a group's `skipped` grants, and every grant on the "orphan" path. A new group with the same name may inherit them *(suspected)* | stale grants | partly [destructive-call-plan-routes.md](./destructive-call-plan-routes.md) |
| F19 | Map editor symbology delete (`src/patterns/mapeditor/.../SymbologySelector/index.jsx:16`) *(suspected)* | Map sections still name the deleted symbology id | dangling refs | none |

**Already sound:** templates; dataset row deletes (`dms.data.delete`, `uda.data.delete`); DAMA source/view
delete (`dms-server/src/dama/delete.js`); user menus; the QA "remove field" (labelled as hide); datasets
Archive. Memory note "/list remove only unlinks a tenant" is out of date: `tenantList.jsx:325-360` now calls
the real delete.

## Mechanisms to reuse

- **Parentage sweep:** `sweepRemovedChildren` / `sweepAllChildren` (`parentId.js:472, 507`), wired into
  `deleteData`, `setDataById` and `/sync/push`.
  - `DMS_CHILD_SWEEP_MODE` (`off|log|delete`) defaults to **`log`**.
  - Turning on `delete` needs three things: `migrate-row-auth.js --verify-parents` reporting zero shared children; children carrying `parent_id`; and `childRefs` for the owner. Only `page: {sections, draft_sections, history}` declares them today.
- **`cascadeDeletedRow`** (`dms.controller.js:736`): the source → views → split tables → ref cleanup, always on, with change_log entries.
- **Plan + backup + refuse:** the tenant delete (`routes/tenants/delete.js`), the DAMA delete plan (`dama/delete.js`), and the `/…/plan` routes from destructive-call-plan-routes.md. The owner's rule: a preview comes from its own read-only route, never from a flag on the destructive call.
- **Offline sweepers** for the backlog: `cleanup-db.js`, `delete-orphan-pages.js`, `cleanup-stale-dmsenv-refs.js`, `prune-unreachable-tables.js`.

## Plan

Library-first and capability-driven. The cascade reads **`childRefs` from the formats**. It never names a pattern
type (src/dms/CLAUDE.md, "DMS interprets data").

**Phase 0: decisions (owner, 2026-11-13). DONE**
- [x] **Hard delete.** No trash or soft delete. A backup file is still written before each cascade, as the tenant delete does.
- [x] **Child pages are deleted with their parent page**, recursively, with all their sections, history and drafts.
- [x] **Every delete warning shows everything that will be deleted.** The confirm dialog renders the read-only plan route's full list (rows by kind, split tables, files, child pages), not a generic sentence.
- [x] **Deleting a pattern removes everything it owns except its database.** Pages, sections, history, templates and the pattern row go. **Data linked through a pgEnv (DAMA sources, views and tables) is never deleted**: it may be shared, and we can't yet tell reliably. The plan lists it under "kept".
- [x] **F13: delete column only removes it from metadata.** That is the intended behavior; no purge.

- [x] **Internal dmsEnv (owner, 2026-11-13):** a datasets pattern's dmsEnv (its DMS sources, views and split tables) is deleted with the pattern **only if no other pattern points at it**. In that case the warning lists the dmsEnv and everything in it under "will be deleted". If any other pattern on any site in the app references it, it is **kept** and listed under "kept", naming the patterns that still use it. A pgEnv is never deleted either way.

**Phase 1: make the cascade trustworthy (server)**
- [ ] F12: write `D` change_log entries only for the ids actually deleted (the `doomed` snapshot). Resolve the table from the stored row, not the caller's `type`.
- [ ] F9: the sweep writes a `D` change_log entry (and broadcasts) for every row it deletes.
- [ ] F6: `deleteInternalSource` calls the controller's cascade (or `deleteData`). It finds views by type path as well as by `data.views`, clears pattern `data.sources` refs and `_sourceIdCache`, and writes change_log. Add the `dms.tasks` delete to `cascadeSourceDelete`.
- [ ] F7: the shared source/view cascade removes the storage folder (after commit, like the page hook). The tenant delete does the same for its app.
- [ ] Tests on the sqlite rig for each item. Never plain `npm test` in dms-server, because it hits prod.

**Phase 2: owners declare their children**
- [ ] `childRefs` for the site row (`theme_refs`; `patterns` and `dms_envs` only behind Phase 0's pattern decision) and for the pattern row (pages by type path, dmsEnv refs).
- [ ] F4 / F5: a `POST …/delete/plan` read-only route returns what goes: rows by kind, split tables, files, and dependents that block the delete. For a pattern, it also returns the **kept** list: pgEnv-linked sources and views, plus the dmsEnv when another pattern still references it, with those patterns named.
  - The reference check scans every pattern row in the app for the dmsEnv's id/ref in its dmsEnv refs. It is re-run inside the delete's transaction, and the delete is refused if the answer changed since the plan was shown.
  - An unshared dmsEnv goes through the existing source/view cascade (`cascadeDeletedRow`), which deletes its sources, views, split tables and files (F7). Its ref is removed from the site's `dms_envs`.
  - The admin dialog shows the whole plan (as Groups' remove does), then calls the real delete.
  - The pattern cascade never follows a ref into a pgEnv.
- [ ] F3: deleting a page deletes its child pages recursively (by `parent`), each with its sections, history and drafts. The page delete warning (page editor menu, admin Pages tab) lists every page and section count from the plan route. The CLI `dms page delete` prints the same plan, and requires `--yes` to apply it.
- [ ] Every delete dialog touched by this task shows the plan's full list. No delete button opens a generic warning.

**Phase 3: turn the sweep on, per app**
- [ ] Per app: run `migrate-row-auth.js --verify-parents` (read-only), back up, then set `DMS_CHILD_SWEEP_MODE=delete`. Start with a test app, then mitigat-ny-prod. Coordinate with row-auth-parentage.md, which owns that switch. This closes F1, F2, and F3's sections.
- [ ] Backlog cleanup of existing orphans with the offline sweepers (dry run first; prod writes only with the owner's say-so).

**Phase 4: the rest**
- [ ] F10: the CLI `section delete` removes the ref from both `sections` and `draft_sections` (and from every page that names the row when `--page` isn't given), then deletes.
- [ ] F8: a referenced-uploads GC: find `file_upload` sources no section or row references, plan, then delete them with their files.
- [ ] F16 (chat, site-side `src/patterns/chat`): clear attachments and files, delete member rows. F18: strip the user's grants across apps in a transaction; refuse a group delete while skipped grants remain. F19: check Map sections on symbology delete. F17: record deletes in change history.
- [ ] F14: delete `yjs_states` with the row, after or alongside sync-rooms-cross-app-item-id-collision.md.

Split out sub-tasks if any phase grows past a session or two. Phases 1 and 2 are the natural split.

## Testing checklist

- [ ] Each fixed surface: after a delete, no row of that kind or its children remains (sqlite rig + Postgres test DB), and change_log has exactly one `D` per deleted row.
- [ ] A sync client (IndexedDB) and a WebSocket room drop the deleted rows without a reload.
- [ ] A plan route is read-only: run it against a server without the route and get a 404, not a delete.
- [ ] A page delete removes its whole subtree of child pages; the warning listed exactly those pages.
- [ ] A pattern delete leaves every pgEnv-linked source/view/table untouched, and its warning listed them as kept.
- [ ] A dmsEnv shared with another pattern is kept, and the warning names the other pattern. An unshared dmsEnv is deleted with its sources, views, split tables and files, and the warning listed it.
- [ ] If another pattern starts referencing the dmsEnv between the plan and the delete, the delete is refused.
- [ ] A refused delete (dependents) leaves everything untouched.
- [ ] Uploaded files return 404 at their `dl_url` after their source is deleted.
- [ ] Backups are written before every cascade and can be restored.
- [ ] Prod checks are read-only audits only (PGOPTIONS `default_transaction_read_only=on`).
