# Datasets: permission checks on every UDA Falcor write (source, view, index, PK, clear, settings)

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** built · **Release:** commit — committed on master 2026-10-21, not pushed; deploy pending · **Created by:** ssangdod@albany.edu · **Edited by:** —

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Depends on
[permissions-server-source-auth-core.md](./permissions-server-source-auth-core.md). Row-level
`uda.data.*` writes are in [section-row-write-auth.md](./section-row-write-auth.md);
the generic `dms.data.*` writes (which also edit internal source/view rows) are defects B/E of
[auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md).

## Objective

Falcor `uda.*` set and call routes are reachable by anyone who can POST to `/graph`. Each must require a user and
a source permission, and none may let a caller write column names of its choosing.

## What was built (2026-10-21)

### How the pattern travels on Falcor
A Falcor request can't carry `?dms_pattern=`: one falcor client serves every pattern and batches requests. So
**calls take the datasets pattern as their last argument** (`{ app, id }` = `DatasetsContext.datasetsPattern`, also
`{ app, patternId }` or `'app/id'`; `sourceAuth.parsePatternRef`). **Sets can't take arguments**, so every client
set was moved to a call: `uda.sources.update`, `uda.views.update` (new), `uda.settings.update` (new). The sets stay
for old clients and other callers, guarded the same way but with no pattern, so on an external source only its own
grants count there.

### Routes (all in `dms-server/src/routes/uda/`)

| route | gate | mode note |
|---|---|---|
| set `sources.byId` / call `sources.update` (moved to `uda.route.js`; one write, `updateSource`) | login; `update-source` for any key, plus `edit-source-permissions` when `auth_permissions` is present (per **key**, trimmed, not substring) | today's rule as before |
| set `views.byId` / call `views.update` | login; `update-source` on the view's source (`sourceIdForView`) | `wasOpen` |
| call `sources.setIndex` / `sources.setPrimaryKey` (+ `pattern` arg) | login; `update-source` | `wasOpen` |
| call `setAuthoritativeView` / `clearAuthoritativeView` (+ `pattern` arg) | login; `update-source` (core helper now) | unchanged |
| call `views.create` (+ `pattern` arg) | login; `create-view` **or** `update-source` (no current grantee loses it) | unchanged rule |
| call `viewsById.clearData` (+ `pattern` arg) | login; `edit-source-data` or `delete-source` on the view's source | `wasOpen` |
| set `uda[env].settings` / call `settings.update` (`[env, value, pattern]`) | login; `edit-pattern` on the named datasets pattern (DMS env: pattern must be of the env's app) | pattern rule: legacy/log allow |
| call `sources.delete` / `hardDelete` / `views.delete` (`opts.pattern`) | login; `delete-source` on every touched source. **DMS envs now call `authorize` too** (`softDeleteSource` skipped it) | `enforce` checks DMS envs |

- `wasOpen` (new option on `isUserAuthedForSource`): the route checked nothing before, so in `legacy` / `log`
  today's rule is "allow" and the strict rule only logs would-denies (as `isUserAuthedForPattern` already did).
  `enforce` decides.
- Login is required unconditionally (not mode-gated), as for deletes since 2026-10-02.
- Guards **throw** (`assertSourcePermission` / `assertPatternPermission` in `sourceAuth.js`): the client's call
  rejects. Messages: `Sign in to do this`, `Not authorized: needs <perm> on source|pattern <x>`.
  `sources.update` used to swallow everything into `[]`.
- **Column whitelists** (`uda.controller.js` `WRITABLE_SOURCE_COLUMNS` / `WRITABLE_VIEW_COLUMNS`) on DaMa
  `updateSource` / `updateView`: anything else → `Not writable on a source|view: …`. Server-owned: ids, `user_id`,
  timestamps, and a view's `table_schema` / `table_name` / `data_table` (writable, they'd point a view at any
  table) and `source_id`. DMS internal writes merge into `data` JSON (no SQL identifiers), so no whitelist there.
- `updateSourceMetadata` (the old `sources.update` body: raw SET of client keys, and it bypassed the
  `metadata.authority` protection) is deleted.

### Resolver fix (core task's `readInternalSource`)
Clients name an internal source's env by its type or slug, never its pattern: `app+<source row type>` /
`app+internal_table` for writes, `app+<slug>` for clearData. The core resolver looked the owning patterns up from the
env's instance, so under `enforce` every internal write would have been denied. It now finds the **datasets patterns
of the env's app that list the source** (own `sources` or linked dmsEnv) and unions their grants. A source in no
datasets pattern is still denied. `test-source-auth.js` still passes (48).

### Data-loss bug fixed along the way (pre-existing)
`clearViewData` also clears an "invalid-entry" table. That type (`<slug>|<view>:data-invalid-entry`) isn't a split
type, so it resolves to the app's **main** table. The guard compared with `'data_items'` only, which is the main
table's name in legacy mode and on per-app Postgres, but on **per-app SQLite** it is `data_items__<app>`: Clear Data
there ran `DELETE FROM data_items__<app>` and emptied the whole site. (Found when the new test's fixtures vanished.)
Now both clears refuse the main table by comparing with `dmsMainTable(...)`. Prod (Postgres) was never hit.
Before this task the route needed no login at all.

### Client
- `DatasetsContext.datasetsPattern = { app, id: pattern.id }` (siteConfig.jsx).
- `updateSourceData` / `updateVersionData` (default/utils.js) → `sources.update` / `views.update` calls with
  `pattern`; callers pass it: overview (5), admin toggle editable, gis metadata (+ setIndex / setPrimaryKey args),
  SourceAccessEditor, version rename, ClearDataBtn.
- SettingsPage → `settings.update`. Gotcha: `falcor.call()` returns a ModelResponse, **no `.finally`**.
- `api/index.js`: `udaUpdateSourceMetadata` (→ call), `udaSet/ClearAuthoritativeView`, `udaDeleteView`,
  `udaDeleteSource` take `pattern`; AuthorityControl, DeleteVersionButton, DeleteSourceBtn, DeleteSource pass it.
- `Map/Layer2.jsx` saves `{ symbology }` through `sources.update`: never worked (no such column; the old route
  swallowed the SQL error). Now refused "Not writable"; added a `.catch` + comment. Symbology needs a real home.
- Not changed: mapeditor `useZoomToFit.js` (root repo) still sets `views.byId[..].metadata`; no pattern there, works
  under `wasOpen` in `legacy` / `log`.

## Tests

- [x] `tests/test-uda-auth.js` (new, 23): every route above with anon / no grant / grant; `auth_permissions` through
  both source paths (incl. a padded key); whitelist (unknown, server-owned, injected keys; view table/source);
  pattern grants only via a call naming the pattern; internal sources via `app+internal_table` and `app+slug`;
  log lets `wasOpen` routes through and logs; settings with/without/foreign pattern; DMS-env delete refused under
  enforce; **clearData leaves the main table intact**. Restores env settings it writes. SQLite ✓, Postgres ✓.
  Run: `DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-uda-auth.js` (Postgres: add
  `DMS_TEST_DB=dms-postgres-test DMS_DB_ENV=dms-postgres-test DAMA_TEST_DB=dama-postgres-test` + the temporary
  dama-postgres-test config, see the hub).
- [x] Updated: `test-uda.js` (two refusal regexes; 141 ✓ SQLite), `test-tasks.js` (router includes `uda.route.js`,
  signed-in user, source grants the user; 22 ✓). `test-source-auth` 48 ✓, `test-delete-cascade` 16 ✓.
- Postgres `test-uda.js`: 1 failure (`sourcesAll … should be one longer than sources`), **same at HEAD** (worktree
  bisect): leftover hidden sources in the persistent PG test DB, not this change.
- [x] Live (3458 current code + 5197, admin `v6test Admin`, `flow-udawrites.mjs` in the verify kit):
  version rename → `views.update` with the pattern, 200 + echoed row; internal source 4 interval →
  `sources.update` on `v6test+riverbend|…:source`, persisted; settings toggle → `settings.update`, 200, restored;
  no would-deny lines. External source 2 interval → **refused** before open item 1 was fixed (old code refused
  too); not re-run live after the fix, unit-tested.
- [ ] Live with a non-admin user (update-source only / nothing): not run, no such user seeded in v6test; covered
  by unit tests. Error toast instead of silent no-op belongs to [permissions-ds-client-gates.md](./permissions-ds-client-gates.md)
  (callers like overview's `onChange` don't catch; a refusal shows as an unhandled rejection).

## Open items

1. ~~`legacy` / `log` refuse app admins and pattern grantees on external sources with no own grants~~ — **done
   2026-10-21 (owner):** `isUserAuthedForSource` runs the strict decision first; `legacy` / `log` allow
   `strict || legacyAllows` (would-denies logged when only today's rule allows). Test: "legacy / log allow whatever
   the strict rule allows" in `test-uda-auth.js` (24 ✓ SQLite + Postgres).
2. Layer2 symbology: decide where it lives (`metadata.symbology`?), then fix the caller.
3. Switch the remaining client sets (mapeditor `useZoomToFit`) to `views.update` if the mapeditor gains a pattern
   to name.
