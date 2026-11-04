# Permissions move: grant everyone the permissions that match the access they have today

**Initiatives:** [dms_permissions_move](../../../../../planning/initiatives/dms_permissions_move.md) (primary), [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** blocked:dependency · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub; design question 5). Depends on
[permissions-inventory.md](../completed/permissions-inventory.md), the vocabulary decisions, and the loss list and approved
fixes from [permissions-access-diff-audit.md](./permissions-access-diff-audit.md). **Runs before** any task flips
from transition mode to permission-only, and before the datasets routes start enforcing.

## Decided (owner, 2026-11-03)

Levels keep counting under `log` (and `legacy`) only, on every auth row, with grants or without; under `enforce`
only permissions count (`auth/utils/permissions.js` `levelCounts`). Under `log` each pass that only a level
allowed is recorded in the access log (guard `auth`, reason `allowed by auth level only …`): that list is what
this migration must grant before `DMS_AUTH_ROW_MODE=enforce`.

## Progress

- **2026-11-03: auth half, dry run built and run on prod (read-only).** `dms-server/src/scripts/migrate-auth-grants.js
  --dms-db=<config> --auth-db=<config> [--app=] [--json=]` (a server script, not the CLI: the CLI can't read the
  auth DB's levels; `--apply` refuses until the owner has reviewed). Both sessions read-only with a refused write
  probe. Result on dms3 / avail_auth: 29 auth rows, 87 group grants proposed, on 6 sites:
  - mitigat-ny-prod: 65 county `HMP Admin` / `HMP Public` groups at level 5 → `auth-users` + `auth-groups`.
  - npmrdsv5: `NYSDOT Admin` (level 10) → `*`; 17 MPO groups at level 5 → `auth-users` + `auth-groups`.
  - asm, avail, dms-site, wcdb (all blank rows): `AVAIL` (level 10) → `*`.
  - **Access log cross-check is empty** (0 level-only lines on any site): the prod server doesn't run this branch,
    so nothing there records them yet. It proves nothing until the branch is deployed in `log` mode.
  - **Every row, with decisions: [permissions-grant-migration-auth-rows.md](./permissions-grant-migration-auth-rows.md)**
    (owner 2026-11-03: the conversion is per group, not by level; `*` on the auth row only for mitigat-ny-prod
    `AVAIL`/`DHSES` and npmrdsv5 `AVAIL`/`NYSDOT Admin`; county groups get grants on their county patterns only).
  - **2026-11-03: level rules that ignored `enforce` fixed** (uncommitted): ~14 auth handlers read levels
    directly; they now follow `DMS_AUTH_ROW_MODE` (logged under `log`, refused under `enforce`). Platform =
    `AVAIL` membership only. Details and tests in the rows file.
  - **2026-11-04: level-rule fix committed** (see the commit for this progress line). Self-contained suites green:
    `test-auth-level-rules` 13, `test-auth-groups` 23, `test-auth-platform` 14, `test-auth-permissions` 25
    (`test-auth.js` starts the server, so it wasn't rerun; it needs a fresh `cli-test.sqlite`).
  - **Answered by the owner 2026-11-03** (decisions in the rows file). The four questions below, from the dry run,
    no longer stand: county groups get **no** auth-row grants (only grants on their own county patterns), so
    1–3 don't arise; `*` goes only to `AVAIL` (asm, avail, dms-site, wcdb; mitigat-ny-prod and availabs already
    have it), `DHSES` (mitigat-ny-prod, already) and `NYSDOT Admin` (npmrdsv5), which settles 4. **Next:** owner
    signs off the 5 grants in the rows file, then build `--apply`; then the datasets half (14 npmrds2 sources with
    old levels and no grants; hazmit_dama's 716 unchecked against their grants; other pgEnvs not checked).
  - ~~Open, for the owner before any apply~~ (kept for the record):
    1. Granting `auth-groups` makes a group *protected* (`isProtectedGroup`), so only `*` holders could change it.
       On mitigat-ny-prod all 65 county groups would become protected and no county admin could manage any of
       them, their own included. Today level 5 lets them manage any group at level ≤ 5.
    2. The grants are site-wide: a county admin would manage every user and group on mitigat-ny-prod, and gain
       `/users/byProject` (level 10 today). The auth row can't scope a grant to one county.
    3. Level 10 → `*` gives more than level 10 did (the permission-only handlers, protected groups).
       `auth-users` + `auth-groups` is the exact equivalent.
    4. `AVAIL` → `*` on four sites contradicts "`AVAIL: ["*"]` only if the owner asks"; wcdb and avail were to
       get `wcdb Admin` / `avail Admin` instead (section above).

## Objective

A dry-run/apply script that writes grants so that nobody loses an operation when levels stop counting and the
dataset routes start checking.

## What it grants

**Auth (per site; the auth row's `authPermissions`, subdomain-aware):**
- level 10 group in the site's project → `*` (most are `${project} Admin`, already `*` by name)
- level 5–9 → `auth-users` + `auth-groups`
- level 1–4 → nothing today depends on these (verify in the inventory)
- groups flagged public today (`isPublicGroup`) → the new self-signup flag

**Datasets (per datasets pattern and source):**
- active uploaders/publishers from the inventory without the grant → `create-source` at pattern level, or
  `create-view` / `update-source` on the sources they've written. Prefer a group grant over per-user grants.
- sources with null/`{}` `auth_permissions` → leave inheriting the pattern; make sure the pattern grants what its
  users need (strict check: "unconfigured" no longer means open).
- envs missing the `auth_permissions` column → run the existing schema migration first
  (`dama-schema-drift-migrations.md`).
- the existing `dms-server/src/scripts/migrate-source-auth-to-permissions.js` (numeric `statistics.auth` → names,
  `:31-38`) is the precedent; reuse its shape.

**Pages with editable sections:** no grants needed here. The owner chose (b) on 2026-10-27: the section's own
edit right decides, and a section with no grants stays open. Tracked outside this move in
[section-row-write-auth.md](./section-row-write-auth.md).

## Required: wcdb and avail auth rows (owner 2026-10-24)

Both auth rows grant nothing (prod check in [task 13](./permissions-auth-server-permission-source.md), "Prod
check"). Under the lenient rule any signed-in user of those projects can manage users and groups once tasks 14–16
are live. **Do this before or at the release, never after.** The owner adds the groups once every task is done, so
no `auth_level` is involved:
1. Look up today's admins of projects `wcdb` and `avail` (read-only); the owner confirms the list.
2. Create groups `wcdb Admin` / `avail Admin`, link each to its project (membership needs the link, no level),
   add the confirmed admins.
3. Auth rows, whole value replaced, then a fresh read to verify:
   wcdb `1471742` `{"undefined Admin":["*"]}` → `{"groups":{"wcdb Admin":["*"],"public":[]},"users":{}}`;
   avail `1449669` (unset) → `{"groups":{"avail Admin":["*"],"public":[]},"users":{}}`.
   The `${app} Admin` name also gets the built-in pass-everything rule. `AVAIL: ["*"]` only if the owner asks.
4. A stray `undefined Admin` group in the auth DB: owner's call.
5. Re-run the five-site auth-row check (all restricted).

## Proposed changes

- [ ] Script in the dms CLI (`dms permissions migrate --dry-run|--apply`) so every site can run it, writing through
  the normal write path (not raw SQL), with a backup of each row it changes in `scratchpad/<site>/`.
- [ ] Never removes or narrows an existing grant; only adds.
- [ ] Dry-run output: per site, the rows and grants it would add, also written as the `--overlay` file the access
  diff reads.

## Testing checklist

- [ ] Dry run on every site, reviewed by the owner; the access diff with it as overlay shows zero unintended losses.
- [ ] After apply: each site's Access tab on the auth row and datasets patterns shows the new grants; the inventory's
  users can still do each operation with levels switched off (transition mode set to permission-only on a test server).
