# Restoring what a delete removed: a restore tool, and the backups it needs

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** blocked:decision · **Later** (owner, 2026-11-17: for the future) · **Created by:** ssangdod@albany.edu · **Edited by:** —

Split out of [safe-delete-removes-rows.md](./safe-delete-removes-rows.md) (2026-11-16). Deletes are real
now: a page takes its child pages, a pattern its pages and unshared data environment, a tenant its whole
schema, and the child sweep (`DMS_CHILD_SWEEP_MODE=delete`, the default since 2026-11-16) removes
sections a page drops. Every delete above writes a backup, but nothing reads one back. Today a restore is
done by hand from gzipped JSON or COPY files, on the server, by someone who knows the format.

## Objective

An operator can list the backups on a server, see exactly what one would put back and what's in the way,
and restore it, as one transaction where the database allows it. A restored row comes back with its id,
its place in its owner's list and its files, and sync clients and open pages see it without a reload.

## What exists today (2026-11-16)

| Delete | Backup | Where | What's in it | What's missing |
|---|---|---|---|---|
| Pattern (`routes/dms/ownerDelete.js`) | one `.json.gz` | `DMS_DELETE_BACKUP_DIR`, default `dms-server/var/delete-backups` | the plan, every deleted row (pattern, owned rows, env, sources, views), every split table's rows | **stored files** (internal-source uploads): the delete removes them, the backup doesn't copy them. The site rows' ref lists (only the plan's site ids). |
| Theme (`ownerDelete.js`) | one `.json.gz` | same | the plan, the theme row | — |
| Tenant (`routes/tenants/delete.js`) | a folder: `manifest.json` + one `.copy.gz` per table + `files/` | `DMS_TENANT_BACKUP_DIR`, default `dms-server/var/tenant-backups` | the schema's tables as COPY text, the shared rows, the auth rows in the manifest, the stored files | — (the manifest says "restore by hand") |
| Page subtree, section, plain `dms.data.delete`, the child sweep | **none** | — | `dms.change_log` keeps every `C`/`U` with the row's data (not for split `:data` rows), so the last state can be rebuilt from it (`reference_dms_changelog_page_restore_technique`) | a backup of any kind; split data rows |

On mercury, `var/` is the `dms-template-var` Docker volume (`deploy.sh`, `CONTAINER_VAR_PATH`), so backups
survive a redeploy. Nothing copies them off the machine, nothing prunes them, and nothing checks that one
can be read back.

## How it would look

### The tool: a server script first, a route later

`dms-server/src/scripts/restore-delete.js`, run on the server where the backups are (on mercury:
`docker exec` into the container), in the shape of `register-formats.js`: **a dry run unless `--apply`**.

```
node src/scripts/restore-delete.js --list [--app <app>]          backups on this server: kind, app, when, by whom, counts
node src/scripts/restore-delete.js <backup>                      the plan: what comes back, what's in the way
node src/scripts/restore-delete.js <backup> --apply              restore it
node src/scripts/restore-delete.js <backup> --only <id,...>      part of one (one page out of a pattern)
```

A script, not an HTTP route, to start with: the backups are files on the server, a restore is an operator
action, and a route needs its own auth rule (who may restore what) and a plan/apply pair under the
destructive-route rule. The admin dialog can link to a route later, once the script's plan has been used
on real backups.

The catch: the script runs outside the server process, so the running server's caches (`_tagsCache`,
`_changeHistoryCache`, `_childRefsCache`, the owners snapshot, the domains store) and its WebSocket
clients don't hear about it. Either the script talks to the running server (a local-only
`POST /admin/restore/notify` that clears caches and broadcasts the `C` entries), or a restore is followed
by a restart. **Decision needed** (P0).

### The plan: what's in the way

A restore is refused, with the reason named, when putting a row back would break something that happened
since the delete:

- **The id is taken.** Per-app sequences don't reuse ids, so this means the backup is for another
  database or the row was already restored. Refuse; never overwrite.
- **The owner is gone.** A page needs its pattern (by type path), a section its page, a pattern its site.
  Restore the owner first (the plan says which backup holds it), or refuse.
- **The name was reused.** A new pattern or source took the instance name since. The restored rows'
  types would mix with the new one's (the same reason `ownerDelete` refuses a same-named pattern).
  Refuse; renaming on restore is a later option.
- **A split table exists** under the same name. Refuse.
- **A tenant's subdomain was taken** by a new tenant. Refuse.

### The apply: one transaction per database

DMS rows (pattern / theme / page subtree / section):
1. Insert every row with its original id, `app`, `type`, `data` and timestamps. Insert, never upsert.
2. Put each id back in its owner's list (`patterns` / `dms_envs` / `theme_refs` on the site rows,
   `sources` / `views`, a page's `sections` / `draft_sections`), at its old position when the backup has
   it. The pattern backup has to record the site rows' lists for this (P2).
3. Recreate split tables and copy their rows.
4. Append one `C` change_log entry per row, so IndexedDB clients and rooms pick them up.
5. After the commit: put stored files back, clear caches, broadcast.

A tenant restore is schema-level, in this order: `CREATE SCHEMA` and the tables from the manifest's
columns, `COPY FROM` each file, the shared rows, the auth project, groups and memberships (one auth
transaction), the files, then the hub's tenant row and its ref in the hub's `tenants` list, then reload
the domains store.

### Rows with no backup: from change_log

For the sweep and the plain deletes, `--from-changelog <app> <id>` rebuilds the row's last state from its
latest `C`/`U` entry before the `D`. The plan says how old that state is. Not for split data rows,
because change_log doesn't keep their data.

### Devops

- **Off-box copies.** A backup on the same volume as the database it backs up is lost with the machine.
  Where do they go (another server, object storage), and on what trigger (after each delete, or nightly)?
- **Retention.** How long, by count or by age, and what prunes. A tenant backup can be large.
- **Integrity.** Write the backup, then read it back and check counts before deleting anything. The
  pattern backup checks nothing today. Also a checksum in the manifest.
- **Who may run it.** Shell access to the server today. A route needs a rule.
- **Restore drill.** A scheduled restore of a recent backup into a scratch database (a preview stack's
  copy), so we know restores work before we need one.
- **Preview stacks and local dev** write backups too (`var/` in their checkouts). They're excluded from
  the off-box copy.

## Plan

**P0: decisions (owner)**
- [ ] A script, or a route as well? If a script, how does the running server hear about the restore:
      a notify route, or a restart?
- [ ] Off-box target, retention and the drill schedule (devops).
- [ ] When a name was reused: refuse only, or offer a rename on restore?

**P1: read-only**
- [ ] `--list` and the plan for every backup kind; no writes. Tests: a plan for each refusal above.

**P2: complete the backups** (`ownerDelete.js`)
- [ ] The pattern delete copies the stored files it removes into the backup (as the tenant delete does,
      under `files/`), and turns the backup into a folder: `manifest.json` + rows + `files/`.
- [ ] It records each site row's ref lists before the delete, so a restore can put ids back in place.
- [ ] It reads each backup back after writing it (counts, gunzip) before deleting anything.
- [ ] A page subtree delete (`dms.data.delete` with child pages) writes a backup the same way. The
      sweep doesn't (it runs on every save); its rows come back from change_log.

**P3: restore DMS rows**
- [ ] Pattern, theme, page subtree. Round-trip tests on SQLite and Postgres: delete, restore, then the
      rows, refs, split tables and files match what was there; change_log has one `C` per row.

**P4: restore a tenant**
- [ ] Schema, auth, files, hub row. Tested on the Postgres harness and a hub copy
      (`deploy/tenant_hub_copy.mjs`).

**P5: from change_log**
- [ ] `--from-changelog` for one row, or a page with its sections.

**P6: devops**
- [ ] Off-box copy, retention, the drill; `deploy/README.md` documents where backups live and how to
      restore.

## Files

- `packages/dms-server/src/scripts/restore-delete.js` (new)
- `packages/dms-server/src/routes/dms/ownerDelete.js` (backup completeness)
- `packages/dms-server/src/routes/tenants/delete.js` (manifest format, shared with the restore)
- `documentation/dms-server-env.md`, dms-template `deploy.sh` / `deploy/README.md`

## Testing checklist

- [ ] Each backup kind restores to the same rows, refs, split tables and files (SQLite + Postgres).
- [ ] Each refusal in "what's in the way" is a dry-run plan line, and `--apply` refuses it.
- [ ] A restore is all or nothing: a failure in the middle leaves the database as it was.
- [ ] A browser with sync on sees the restored rows without a reload.
- [ ] Prod: list and plan only, read-only, until the owner says otherwise.
