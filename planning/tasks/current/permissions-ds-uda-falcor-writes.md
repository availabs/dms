# Datasets: permission checks on every UDA Falcor write (source, view, index, PK, clear, settings)

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** —

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Depends on
[permissions-server-source-auth-core.md](./permissions-server-source-auth-core.md). Server only. Row-level
`uda.data.*` writes are in [permissions-ds-section-data-writes.md](./permissions-ds-section-data-writes.md);
the generic `dms.data.*` writes (which also edit internal source/view rows) are defects B/E of
[auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md).

## Objective

Falcor `uda.*` set and call routes are reachable by anyone who can POST to `/graph`. Each must require a user and
a source permission, and none may let a caller write column names of its choosing.

## Routes (paths under `dms-server/src/routes/uda/`)

| route | does | check today | should need |
|---|---|---|---|
| `uda.tasks.route.js:271` call `uda.sources.update` | `updateSourceMetadata`: raw `UPDATE … SET <client keys>` (`uda.tasks.controller.js:233-258`), can write `auth_permissions` | **none** | `update-source`; `edit-source-permissions` if `auth_permissions` is in the payload; **key whitelist** |
| `uda.route.js:178` set `sources.byId[id][attr]` | `updateSource`, raw `SET k=$` with client keys (`uda.controller.js:446-451`) | perm (`update-source` / `edit-source-permissions` by a string-contains test on the payload, `:192-198`); no login check; fails open (core task) | same, decided per **key**, not by substring; login required; key whitelist |
| `uda.route.js:363` set `views.byId[id][attr]` | `updateView`, raw SET (`uda.controller.js:604-628`) | **none** | `update-source` on the view's source (`create-view` for version name?); key whitelist |
| `uda.route.js:549` call `sources.setIndex` | CREATE/DROP INDEX | **none** | `update-source` |
| `uda.route.js:572` call `sources.setPrimaryKey` | ALTER TABLE ADD/DROP PK | **none** | `update-source` |
| `uda.route.js:596` / `:625` `setAuthoritativeView` / `clearAuthoritativeView` | `metadata.authority` | login + `update-source` ✓ | keep; switch to the core helper |
| `uda.route.js:661` call `views.create` | new view + table cloned from a view | login + `update-source` | `create-view` (per vocabulary decision) |
| `uda.route.js:702` call `viewsById.clearData` | TRUNCATE a DMS internal split table | **none** | `delete-source` (or `edit-source-data`) |
| `uda.tasks.route.js:252` set `uda[env].settings` | env settings (hidden types/categories, default categories) | **none** | `edit-pattern` on the datasets pattern that owns the env |
| `uda.tasks.route.js:298`, `:318` call `sources.delete` / `hardDelete` | cascade delete | login; DAMA: `delete-source` on every touched source ✓; **DMS env: login only** (`:32`) | `delete-source` on DMS envs too (needs core task's DMS-env read) |
| `uda.tasks.route.js:340` call `views.delete` | view delete | login + `delete-source` ✓ | keep |

## Proposed changes

- [ ] A small guard for Falcor routes, `requireSource(this.user, env, sourceId, perms)`, returning a Falcor error
  (not `[]`) so the client can show it. Today errors are swallowed into `[]` (e.g. `:287`).
- [ ] Apply it to every row above.
- [ ] **Column whitelists** for `updateSource`, `updateSourceMetadata`, `updateView`: known DAMA columns only;
  reject anything else. Closes the identifier injection noted by the surveys.
- [ ] `uda.sources.update` and `sources.byId` set are two paths to the same write. Consider making `sources.update`
  call the guarded set path, so there's one check.
- [ ] Settings set: resolve the env's datasets pattern (core task) and check `edit-pattern`.
- [ ] Tests (`tests/test-uda-auth.js`): each route denied with no user, denied without the permission, allowed with
  it, on SQLite and Postgres; `auth_permissions` can't be written with `update-source` alone, through either path.

## Client callers to recheck

`Map/Layer2.jsx:244-271` (symbology via `sources.update`), `SettingsPage.jsx:107` (settings set),
`default/version.jsx:158` (version name via views set), `version.jsx:56-80` (clearData),
`gis_dataset/pages/metadata.jsx:57-61` (setIndex / setPrimaryKey). Their UI gates are in
[permissions-ds-client-gates.md](./permissions-ds-client-gates.md).

## Testing checklist

- [ ] Unit tests above.
- [ ] Live, scratch server: a user with `update-source` only can edit metadata, can't edit permissions; a user with
  nothing gets an error toast instead of a silent no-op.
