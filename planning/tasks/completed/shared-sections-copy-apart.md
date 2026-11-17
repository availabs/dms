# Give every page its own copy of the sections it shares

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** done · **Created by:** ssangdod@albany.edu · **Edited by:** —

Split out of [safe-delete-removes-rows.md](../current/safe-delete-removes-rows.md) (2026-11-17). A data change on
prod; the code fix that stops new sharing is [pattern-duplicate-shares-sections.md](../current/pattern-duplicate-shares-sections.md).

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
- [~] Page `history` rows (4 shared as single refs): **nothing to do** (checked 2026-11-17). All 4 are named by pages of `shmpcopy` (no pattern row, out of scope), and none of the 4 rows exists any more.
- [x] Other prod apps (audited 2026-11-17 on `prod_check_1117`): none has shared sections or cross-pattern refs. Only mitigat-ny-prod (322 shared ids in 60 live patterns as of 11-17) and npmrdsv5 (1 shared, 27 cross-pattern) need the command.
- [x] **Prod mitigat-ny-prod: APPLIED 2026-11-17** (owner's word, after the dry run). Dry run: 3,397 pages read, nothing unreadable, 323 copies on 63 pages in 60 patterns (52 patterns × 6: the County Template set; Sullivan 3 pages/3, Schenectady Draft V2 2/2, Admin, Playground, Chemung2025, Suffolk template, Delaware Draft, Westchester 1 each). Apply: 9 min, exit 0; room sync 61 `no_room`, 2 `repaired`. Backup and output: dms-template `scratchpad/mitigat-ny-prod-prod/unshare-sections-{backup,apply}-2026-11-17.json` (the apply output maps each page's old → new ids). Check: a fresh dry run plans 0; 5 random copies have the original's content, the page's pattern and `parent_id`, the page lists the copy and not the original, the original still exists.
- [x] **Prod npmrdsv5: APPLIED 2026-11-17** (owner's word, after the dry run; an admin run reads all 424 pages, so it found more than the earlier anonymous one): 28 copies on 3 pages: "Map 21" (npmrds_sub, 2173915) 16 copies of `freightatlas2` sections, "Multi point detour point picking process" (sandbox2, 2218099) 11 of `sandbox`, "Congestion Management Process (CMP)" (npmrds_docs, 675545) 1 shared with "Discussions". 15 s; no rooms. Backup, output and check in dms-template `scratchpad/npmrdsv5-prod/`.
- [x] **Full check of both apps** (`scratchpad/mitigat-ny-prod-prod/verify-unshare.mjs`, read-only): every copy (323 + 28) exists, is in its page's pattern with `parent_id` = the page, has the original's content and is listed by that page only; every original still exists and is listed by at most one page; every entry of both lists of every edited page (7,996 + 100) matches the backup except the repointed ones (same position, the copy's id, the page's pattern in the ref, other fields kept); 0 rows listed by 2+ pages site-wide; rooms `in_sync` or none.

## Files

- `packages/dms/cli/src/commands/site.js`, `bin/dms.js`, `docs/README.md`, `test/run.js`
