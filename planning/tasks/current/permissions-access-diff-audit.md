# Permissions move: access diff by auth level × source, before each switch-over

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** blocked:dependency · **Created by:** ssangdod@albany.edu · **Edited by:** —

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Depends on
[permissions-inventory.md](../completed/permissions-inventory.md) (the levels in use per project, the sources and patterns)
and on the vocabulary decisions in
[permissions-server-source-auth-core.md](./permissions-server-source-auth-core.md) and
[permissions-auth-server-permission-source.md](./permissions-auth-server-permission-source.md). It produces the
loss list that [permissions-grant-migration.md](./permissions-grant-migration.md) must close, and has to come back
clean before any area flips to permission-only and before
[permissions-remove-auth-levels.md](./permissions-remove-auth-levels.md) Phase 2.

## Objective

Show, before it happens, every place where someone loses access when levels stop counting and the dataset routes
start checking. Transition mode ("permission **or** level") hides losses until the switch-over, so they have to be
computed, not discovered in use.

Today's access is decided by **level**, not by user, so the comparison runs on **auth level × source × operation**.
Only where a level loses access do we expand to the groups and users behind it, and plan the fix.

## Scope

- **External (DAMA) datasets:** pgEnvs `hazmit_dama` and `npmrds2`, every source in each and the datasets patterns
  that point at them. Read-only on both (prod data).
- **Internal (DMS) datasets:** the DMS envs of the sites in the inventory.
- **Auth:** every project in the auth DB, including `avail_auth`.
- Test fixtures use `test_dama` or a scratch sqlite DB, never `hazmit_dama` / `npmrds2`.

## Method

A read-only script, `dms-server/src/scripts/permissions-access-diff.js` (shape of
`migrate-source-auth-to-permissions.js`; it reads the auth tables of every project, which the CLI can't).

1. **Operation table.** One row per operation the move touches: dataset operations (upload, publish, create
   source, create view, update source metadata, delete, downloads, schedules, index/PK, clear data, row edits,
   reads) and auth operations (list users, invite, membership, group CRUD, group adjust, platform operations).
   Each row has:
   - the **old rule**: level ≥ N in the project, login only, open, or (for the 7 routes that already check it)
     the source grant;
   - the **new rule**: which permission, on which row (source, datasets pattern, auth row, `AVAIL` membership);
   - the **owning task**, and whether the change is an **intended** loss (a hole that task closes on purpose).
2. **Old matrix.** Per project, the levels actually in use (from the inventory; expected 0, 1, 5, 10), plus two
   pseudo-levels: *logged in, no group in the project* and *anonymous*. Each level × source × operation →
   allowed or not under the old rule. Sources with the same effective grants (most inherit their pattern) collapse
   into one row, so the matrix stays per pattern plus the sources that override it.
3. **New matrix.** A level isn't a principal in the new model, so a level's new answer is computed per **group at
   that level**: the group's grants on the source ⊕ pattern ⊕ auth row, merged the way the new check merges them
   (strict: nothing configured = deny). The level row is **lost** if any of its groups loses the operation, and
   **gained** if any group gains one it didn't have.
4. **Diff.** Per project/site, each level × source × operation cell is one of: same, unintended loss, intended
   loss, gain.
5. **Expand the losses.** For each lost (group, source, operation): list the group's members, then drop members who
   still get it through another group or a direct user grant. What remains is the set of people who really lose
   it. Mark the ones who used the operation recently (inventory: `data_manager.tasks` / `views` `user_id`,
   `schedules.created_by`, `dms.change_log`), so the plan can start with them.

Gains are reported too: group-level grants from the migration can give more than levels did (for example
`auth-groups` to a group that could never touch `${project} Admin`).

## Remediation plan

For each unintended loss, the report proposes one fix, cheapest first, for the owner to approve:

- grant to the group at pattern level (when the whole level had it on every source of the pattern);
- grant to the group on the source (when it was one source);
- grant to the user (only when the group shouldn't get it);
- accept as intended (move it to the intended list with a reason).

Intended losses are listed with the owning task's reason (for example "any logged-in user could upload", or
`/signup/assign/group`), so the owner signs each one off instead of finding out from a 403.

Approved fixes become input to [permissions-grant-migration.md](./permissions-grant-migration.md); this task never
writes grants itself.

## Output

`scratchpad/permissions-access-diff/<date>/` (gitignored):
- `matrix.csv`: project, site, level, source or pattern, operation, old, new, result;
- `losses.csv`: the expanded group/user list, with last use;
- `remediation.md`: per site, the proposed fix per loss, the intended losses, and the gains;
- a short summary pasted into this doc after each run.

## When it runs

- [ ] **Baseline**, right after the inventory: new matrix from the grants as they stand. Shows what the migration
  must grant.
- [ ] **Against the migration dry run**: the planned grants overlaid. Unintended losses must be zero.
- [ ] **Before each switch-over** (each datasets route group starting to enforce, each auth area going
  permission-only): run again on current data.
- [ ] **Before level removal** (Phase 2 of the removal task): last run.

## Proposed changes

- [ ] Operation table as data (`permissions-access-diff.ops.js`), one row per operation, filled from the
  file:line inventories of the datasets and auth tasks; each task updates its rows when its rule changes.
- [ ] The script: `--project`, `--site`, `--overlay <grants.json>` (the migration dry-run output), `--out`.
- [ ] Reuse the pattern ⊕ source merge and the new fail-closed check from the core task, mirrored rather than
  imported (dms-server has no dependency on the dms client package).

## Testing checklist

- [ ] Fixture: a scratch sqlite auth DB with groups at 0, 5 and 10 and a datasets pattern with mixed source grants.
  Expected losses come out exactly (a level-5 group with no grants loses `invite`; a source with `{}` permissions
  loses every write for every level).
- [ ] A user in a losing level-10 group and a covering level-0 group with the grant doesn't appear in `losses.csv`.
- [ ] The overlay of the expected migration grants leaves zero unintended losses on the fixture.
- [ ] Baseline run on `hazmit_dama` and `npmrds2` plus the auth DB (read-only), reviewed with the owner.

## Results

_(not run)_
