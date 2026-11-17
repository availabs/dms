# Give every page its own copy of the sections it shares

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** blocked:decision · **Release:** commit; prod apply on the owner's word · **Created by:** ssangdod@albany.edu · **Edited by:** —

Split out of [safe-delete-removes-rows.md](./safe-delete-removes-rows.md) (2026-11-17). A data change on
prod; the code fix that stops new sharing is [pattern-duplicate-shares-sections.md](./pattern-duplicate-shares-sections.md).

## Why

When two pages list one section row, editing the section on one page changes the other. Authors
don't expect that. The sweep's listed-elsewhere check keeps deletes safe either way (it stays), so
this is about editing, not deleting.

## Scope (owner, 2026-11-17: only patterns the site lists)

From the local prod copy (`prod_check_1111`, 2026-11-11 data, read-only):

- **mitigat-ny-prod:** 60 patterns in `prod:site`'s `patterns`, 327 shared section ids. The County Template
  (`mitigateny_county_template`, 1300890) and 51 county patterns copied from it share the same 6 draft
  sections: 5 between Lightning and Wind, 1 between Tornado and Wind. The others: `mitigateny_sullivan` (3),
  `mitigateny_county_template_v1_copy` (Schenectady Draft V2, 3), `…_v3_copy_2` (Westchester, 2),
  `…_v2_copy` (Delaware Draft, 2), `…_suffolk_copy` (2), `mitigateny_chemung2025` (1), `mitigateny_admin` (1),
  `mitigateny_playground` (1). Full list: the query in the safe-delete task's audit entry.
- **npmrdsv5:** `npmrds_docs` (`/docs_legacy`), 1 id.
- **Page `history` rows:** 4 on mitigat-ny-prod are each named by 2–3 pages as a single `{id, ref}`. Check
  which patterns they're in before including them.
- Out of scope: the 15 instances with pages but no pattern row (not in the site).
- **Other apps on prod are not audited yet.** The local copies hold only these two apps (`prod_check_1111`,
  and `hub_work`'s `mny` / `tny`). Run the same read-only listing for each before this task's plan is final.

## How (BUILT 2026-11-17)

**A CLI command, not a server script** (changed from the first plan): `dms site unshare-sections`
(`packages/dms/cli/src/commands/site.js unshareSections`). Writing through the running server keeps
change_log entries, broadcasts, the parent stamp and the sweep's listed-elsewhere check, and only the
CLI can sync a page's live-edit room afterwards (`afterDraftSectionsWrite`, Bug 20).

- [x] Dry run unless `--apply`. Reads every page of every pattern in the site's `patterns`; a row listed
      by 2+ pages stays with the lowest-id page of its own pattern, every other page gets a copy (same
      `data`, `trackingId` included since page filters key on it; old `parent` dropped; `parent_id` =
      the page) and its entries are repointed in place, in both lists when the page lists the row in
      both. `--pattern` limits the edits to one pattern's pages.
- [x] Another pattern's section (**decided, owner 2026-11-17: copy it**): the page always gets its own
      copy in its own pattern.
- [x] Backup first (`--backup`, default `./dms-unshare-sections-<app>-<time>.json`: each changed page's
      two lists), then per page: create the copies, one edit, room sync if `draft_sections` changed.
- [x] **Refuses `--apply` when the user can't read every page** (`unreadable` in the output). Found in the
      trial: an anonymous run silently skipped 3 patterns whose rows came back `no-access`.
- [x] CLI test (Phase 2b in `test/run.js`, 39/39): a shared section and another pattern's section, dry
      run writes nothing, copies in the right pattern with the right ref and parent, keeper keeps the
      originals, a re-run finds nothing.
- [x] **Trial on a clone of the prod copy** (`unshare_trial` in the local container, made from
      `prod_check_1111` with `CREATE DATABASE … TEMPLATE`; the prod copy itself untouched), signed in as a
      `mitigat-ny-prod Admin`:
      - mitigat-ny-prod dry run: 3,351 pages read, **328 copies on 64 pages in 60 patterns** (the audit's
        60 live patterns; 328 = 327 shared ids + one more for Sullivan's row shared by 3 pages), 0 from
        another pattern. npmrdsv5 (anonymous, so partial): 12 copies on 2 pages, 11 of them `sandbox2`
        borrowing `sandbox` rows.
      - mitigat-ny-prod `--apply`: 65 s. Then: a re-run plans 0; the audit query finds 0 shared rows in
        live patterns; 328/328 copies have the original's data (only `parent`, `parent_id`, `id`
        differ), are in the page's pattern and parented to it; sections 368,265 → 368,593, change_log
        328 `I` + 64 `U` and no `D` (no original deleted); 2 pages had stored rooms, both synced.
- [ ] Page `history` rows (4 shared as single refs): not handled; check which patterns they're in.
- [ ] Other prod apps: run the dry run on each (as an admin) once a copy of them is available.
- [ ] **Prod:** dry-run output to the owner, then `--apply` on the owner's word, per app.

## Files

- `packages/dms/cli/src/commands/site.js`, `bin/dms.js`, `docs/README.md`, `test/run.js`
