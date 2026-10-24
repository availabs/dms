# Permissions move: grant everyone the permissions that match the access they have today

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** blocked:dependency · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub; design question 5). Depends on
[permissions-inventory.md](../completed/permissions-inventory.md), the vocabulary decisions, and the loss list and approved
fixes from [permissions-access-diff-audit.md](./permissions-access-diff-audit.md). **Runs before** any task flips
from transition mode to permission-only, and before the datasets routes start enforcing.

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

**Pages with editable sections:** per the decision in
[permissions-ds-section-data-writes.md](./permissions-ds-section-data-writes.md).

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
