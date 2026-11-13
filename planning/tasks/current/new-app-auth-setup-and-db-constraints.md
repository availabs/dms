# A new app is created auth-complete, and the database refuses what the auth layer assumes away

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** doing · **Created by:** amuro@albany.edu · **Edited by:** —

## Current state — 2026-11-13 (read this first)

Both repos are on `master`. `tenant-domains` is merged into `master` in the library; `master` equals
`origin/master`. The B7 work below is in the working tree only.

| Piece | State | Where it lives |
|---|---|---|
| A1 (`parent_id` kept in `data`) | Built, tested, **committed** (`878ecc2e`, 2026-11-12) | "Built — 2026-11-10" |
| A1b (`auth` column retired) | Built, tested, **committed** (`878ecc2e`) | "Built — 2026-11-10" |
| `setup-app.js` column step (move and drop the two retired columns) | Built, **committed** (`878ecc2e`). Not run with `--apply` on any real database. The hub has neither column, so nothing to do there | "Built — 2026-11-10" |
| Phase 1 audit script (`audit-db-invariants.js`) | Built, **uncommitted** (new file). Run read-only on the hub db; not run on `rowauth-test` | "Audit — hub db" |
| B7 (shapes): grants stored as JSON, the three CHECK constraints | Built, tested on both dialects, **uncommitted** (17 files). Hub: dry run only | "Built — 2026-11-12 (B7)" |
| A2 (one server-side set-up step) | Partly: `setupApp` and the script exist; a new app's table is created with B7's checks. Not wired: uniqueness guards and formats at first create | Phase 2 |
| A3 (format rows at creation) | Not started; decision open | Open decisions |
| A4 (auth defaults in one place) | Not started; its audit of the create paths is not run | Phase 1, Phase 2 |
| B1 (unique containers), B4 (no self parent), B5 (app matches schema), B8 (type grammar) | Measured on the hub. None picked, none built beyond the existing opt-in guard flag | "Audit — hub db", Open decisions |
| B9 (formats are server-written), B12 (change_log append-only) | Not started. Both need a non-superuser request role first | Open decisions |
| B10 (one env row per pgEnv) | Restated after the mirror was removed; folds into B1's `dmsenv` index | Part B table |
| B11 (auth tables) | Nothing to add on the hub: the foreign keys exist, no orphans | "Audit — hub db" |
| Phase 4 (docs) | `scripts/README.md` has the audit script and the new `setup-app.js` steps. The rest not started | Phase 4 |

**Waiting on the owner**
1. Commit the B7 work (17 modified files and `src/scripts/audit-db-invariants.js` in the library).
2. Hub rollout of B7, in this order per app (`hub`, `mny`, `tny`, `fusion`): deploy the server code to
   every server that writes to the `hub` database; `setup-app.js --db hub-dms --app <app> --apply` (the
   rewrite of stored strings); then the same with `--add-shape-checks`. Checks before the deploy make an
   old server's permission saves fail.
3. A browser check of saving permissions on a page, a section, a pattern, an env row and a source.
4. The picks under "Open decisions".

**Not verified**
- Nothing in this task has been written to a real database. Every hub and `dms-mercury-3` run was read-only
  or a dry run.
- No browser check of any permission editor after the writer change.
- The client's full vitest run has 15 failures in 7 files that do not import the changed files; it was not
  compared against a clean checkout.
- `rowauth-test` (`dms-mercury-3`) has not been audited, and the `dms` schema's `asm` app on the hub (6
  rows) was skipped.

## Objective

The row-auth work added columns, format declarations, grants and mirror rows (the mirror was removed on
2026-11-12; a pgEnv's one env row per site remains), and every one of them reached
the existing apps by a script run per app. **Nothing runs those steps for a new app**, so an app created
today starts in the unmigrated state the server is built to tolerate, and stays there until someone
remembers the scripts.

**Owner, 2026-11-10:**
1. Creating a new app must leave it auth-complete by default: the columns, the format rows, and the auth
   defaults and values the enforcement system expects.
2. Decide what to add to the SQL that creates DMS databases and schemas so the restrictions the auth logic
   relies on are enforced by the database, and a future change that would break them fails.

## Part A — what a new app is missing today (measured 2026-11-10)

| What the auth layer wants | How existing apps got it | A new app today |
|---|---|---|
| Parentage (`parent_id`) | A `parent_id` column, added and filled by `migrate-row-auth.js --apply` | **Discarded.** `createData` strips `parent_id` from the payload and writes it only when the column exists, so on a new app the value is lost. Decided 2026-11-10: no column; it is kept in `data.parent_id` (A1) |
| The `auth` column | same script | **Absent**, and not needed: every grant a new app writes lands in `data.authPermissions`, which is read first. Decided 2026-11-10: the column is retired everywhere (A1b) |
| The uniqueness guards (one row per `(app, type)` for pattern, source, view, dmsenv, site) | `migrate-row-auth.js --add-uniqueness-guard` | **Absent** |
| `formats` rows (rules, vocabulary, `childRefs`) | `register-formats.js --app … --apply`, by hand, per site; not in `deploy.sh` | The table is made on first use (`ensureFormatsTable`) and is **empty**; the server falls back to the stamps and `routes/auth/rules.js`, both of which Phase 4 of [format-declarations-server-side.md](./format-declarations-server-side.md) deletes |
| Site and pattern rows carry their rules | `stampSiteRow` / `stampPatternRow` in the client (`createSite.jsx`, `tenantProvisioning.js`) | Present, but only on the two client paths that call them, and they are the mechanism being retired |
| Default grants | `createCorePatterns`: the auth pattern and each template pattern get `{ groups: { "<app> Admin": ["*"], public: [] } }`; the admin pattern is created with none | **To audit** (below): the site row, the env rows and the admin pattern |
| The pgEnv env row (the mirror stubs were removed 2026-11-12) | `attach-pgenv.js`, per site per pgEnv (was `reconcile-pgenv-mirror.js`) | None; covered by [pgenv-config-on-the-site-row.md](./pgenv-config-on-the-site-row.md) |
| `parent_id` on the rows the create flow writes | the client sends it for every `dms-format` child; the mirror sends it for every stub | Sent, then discarded (first row of this table) |

Where a new app comes from, so each path is covered: the admin pattern's create-site page
(`patterns/admin/pages/createSite.jsx`, after `/init/setup`), tenant provisioning
(`utils/tenantProvisioning.js`), the CLI, `copy-db.js` / `migrate-site.js` into a fresh database, and any
first write for an unseen app (`ensureTable`).

### Design

**Decided (owner, 2026-11-10): no `parent_id` column and no `auth` column.** `parent_id` is kept as a
key in `data`, written at create; the `auth` column is retired. What the code does today, which is why
both are cheap to change:

- `parent_id` has one reader in the auth layer (`routes/auth/owners.js parentOf`, line ~206: "the
  reference wins when present"), and that loader already selects `data`. Outside auth it is used by the
  create-path validation and `stampChildren` (`routes/dms/parentId.js`), the child sweep on delete, and
  `dama/mirror.js`, which already passes it in the create payload.
- The `auth` column is a read fallback. `owners.js grantsOf` reads `data.authPermissions` first and the
  column only when `data` names no one; `vocabulary.js declared()` and the childRefs lookup
  (`dms.controller.js` line ~188) read a migrated vocabulary from it. No request path writes it; only
  scripts do (`migrate-row-auth.js` pass 2, `convert-grant-vocabulary.js`, `audit-auth-levels.js`,
  `backfill-view-pattern.js`).

**A1. `parent_id` lives in `data`.**

- **Create.** `dms.controller.js createData` (lines ~1544–1600): `takeParentId` still lifts the claim
  out of the payload; `validateParentId` runs whatever the schema (no `rowAuthCaps` check); a claim that
  passes is written back as `data.parent_id` (a number); a claim that fails is dropped with the existing
  warning. The four INSERT variants that append a `parent_id` column collapse to the plain insert.
- **Edit must not change it.** Today the column is out of a client's reach. In `data` it is not: an
  edit could set `parent_id` to any row, and because `parentOf` follows it to a container, a row could
  place itself under another pattern and be judged by that pattern's grants. `setDataById` therefore
  treats `parent_id` as a protected key: removed from every incoming patch (`stripParentId`).
  The edit merges (`jsonMerge`), so the stored value survives. `dms.data.massedit` (`setMassData`) refuses the column name `parent_id`.
  Re-parenting stays what it is today: the server's `stampChildren`, when a parent's save names the
  child.
- **The client stops echoing it.** `dms/src/api/index.js` (the strip list at line ~537) and
  `updateDMSAttrs.js` add `parent_id` to the keys removed from a child before it is saved, and keep
  sending the claim on create.
- **Readers.** `owners.js wrap` reads `data.parent_id`; `loadApp` drops the column from its select.
  `parentId.js`: `stampChildren` becomes a JSON set on the child's `data`
  (`jsonb_set(data, '{parent_id}', …)` / `json_set` on SQLite) with the same "only when different"
  guard; `sweepRemovedChildren` and `sweepAllChildren` compare `data->>'parent_id'` (the
  `jsonExtract` helper in `db/query-utils.js`). Both sweeps are already bounded by an id list or by
  type, so no index is added.
- **Deleted.** The `parentId` half of `routes/dms/rowAuthCaps.js`; the `ADD COLUMN parent_id` and its
  index in `migrate-row-auth.js` (its passes 3 and 4 write `data.parent_id` instead, for apps that
  still need the backfill).
- **Existing columns.** Where the column exists and is filled (`rowauth-test`; check the hub database),
  a one-time `UPDATE … SET data = jsonb_set(data, '{parent_id}', to_jsonb(parent_id)) WHERE parent_id
  IS NOT NULL`, verified by count, then `DROP COLUMN`. Part of `setup-app.js` (A2).
- **Tests.** `test-parent-id.js`, `test-parent-stamp.js`, `test-child-sweep.js` ported to the `data`
  key and run on a table with no extra columns; new cases: an edit carrying `parent_id` leaves the
  stored value unchanged; a full-row save from a client that omits the key does not erase it; a new
  per-app table (no migration) gets `data.parent_id` on a section create and on a mirror stub.

**A1b. The `auth` column is retired.**

- **Move what only the column holds**, per app, in `setup-app.js`, dry run first:
  - grants on a row whose `data` names no one (the site row after `sweep-site-grants.js`) →
    `data.authPermissions`; a row where the column and `data` both hold grants and differ is reported
    and not touched;
  - `view` (a source narrowing itself to its own grantees) → `data.authPermissions.view`, which
    `grantsOf` already reads as the fallback (`dv`);
  - `vocabulary` and `childRefs` → nothing to move once the app's formats are registered (A3); the
    script refuses to drop the column for an app whose `formats` table lacks the kind.
- **Readers.** `owners.js`: `wrap` drops `auth`, `grantsOf` reads `data` only, `loadApp` drops the
  column. `vocabulary.js declared()` drops its `row.auth` read. `dms.controller.js`: the
  `caps.auth ? 'auth, data, type' : 'data, type'` select (line ~188), `hasAuthColumns` (line ~786) and
  the `authColumns` projections go.
- **The projection that replaces it.** `rowAuthCaps.js authColumns` exists so bulk auth loads never
  select whole `data` rows (about 10 KB each on production). Its replacement is a fixed select list
  built from JSON extraction: `id, type, data->'authPermissions', data->'auth_permissions',
  data->>'parent_id'`, plus the mirror keys the snapshot indexes (`pgEnv`, `source_id`, `view_id`,
  `dmsEnvId`, `pattern_type`). One helper in `owners.js`, used by `loadApp` and the controller's auth
  loaders. `rowAuthCaps.js` is then deleted.
- **Scripts.** `migrate-row-auth.js` loses pass 2 and the `ADD COLUMN auth`; `convert-grant-vocabulary.js`
  and `audit-auth-levels.js` lose their `col: 'auth'` branch; `backfill-view-pattern.js` writes `data`.
- **Tests.** Every auth suite on tables with no `auth` column (the fixtures that create it stop);
  one case per moved item above; the "column and data disagree" report.

**A2. One server-side "set up app" step.** A function, `setupApp(db, app, { formats })`, idempotent, that
does everything the scripts do for a new app, in order:
1. ensure the schema, sequence, `data_items` (no `parent_id`, no `auth` column) and `formats` table;
   on an existing app, move and drop those two columns (A1, A1b);
2. add the uniqueness guards (nothing to conflict in an empty table);
3. register the format declarations (`upsertFormats`), from the emitter's output;
4. add Part B's constraints.

Called from: `ensureTable` when it creates a per-app `data_items` for the first time (so no path can skip
it), and from a script (`setup-app.js --db --app [--apply]`) that reports what an existing app is missing,
which makes it the per-app checklist the cutover task needs too.

**A3. Format rows at creation, without a client write.** The owner's rule (2026-11-06) is that no client
writes `formats`. The server cannot import the client package, so it needs the emitter's output at
runtime. Options:
- (a) the deploy writes `formats.json` next to the build (`emit-formats.mjs`, with the host app's
  `--extra` list) and the server reads it at `setupApp` time and at boot;
- (b) the server runs the emitter from the sibling checkout, as the script does now.

Recommended: (a), plus **register at server boot for every app the server has** when the file's hash
differs from what is stored. That also closes the standing owner step in the formats task ("register once
per site") and makes a rules change reach every site on deploy. Two sites on different library versions
(`deploy -- <site> --dms <ref>`) need a file per site build; the site's `site.json` can name it.

**A4. Auth defaults, audited then fixed in one place.** Before changing anything, list what each
create path writes and what `enforce` then allows, on a fresh SQLite app:
- the site row: who holds `*`? (`stampSiteRow` adds rules only);
- the admin pattern: created with no `authPermissions` by design ("keeps the defaults"); confirm the
  default is what the rules give `<app> Admin` through the site row;
- env rows created by `provisionTemplatePatterns` (`{ name: 'default', sources: [] }`, no grants);
- the group name: `<app> Admin` from `/init/setup` vs `PROJECT_NAME` (the wcdb `undefined Admin` bug);
- whether public read of a new site's published pages works under `enforce` with no further step.

Then move the defaults out of the client: the server applies them when it sees the create of a site row
or a pattern row with no grants (one function, read from the format declaration), so the create-site page,
tenant provisioning and the CLI cannot differ. The end-to-end test is: create an app through each path on
an empty database with all three modes at `enforce`, then log in as the new admin, edit a page, and read it
anonymously.

## Part B — restrictions the database should enforce

The aim is that a write which bypasses the application (a script, psql, a future code path) cannot create
a state the auth layer misjudges. Candidates, each with the invariant it protects. **Each needs the
existing data measured before it is added**; a constraint that existing rows violate is added `NOT VALID`
(Postgres) or deferred until the data is cleaned, as the uniqueness guard already does.

| # | Constraint | Protects | Notes |
|---|---|---|---|
| B1 (unique containers) | Partial unique index on `(app, type)` for `:pattern`, `:source`, `:view`, `:dmsenv`, `:site` | A name resolves to one owner, so grants attach to one row | Built as an opt-in flag in `migrate-row-auth.js`; make it default for new tables. Three prod duplicates block it on `mitigat-ny-prod` |
| B2 (parent exists) | ~~`parent_id` foreign key~~ | — | Dropped 2026-11-10: `parent_id` is a key in `data`, so no foreign key is possible. The create path validates it; `setup-app.js --verify` reports a `data.parent_id` that names no row |
| B3 (parent required) | ~~`CHECK (parent_id IS NOT NULL …)`~~ | — | Dropped: `parent_id` is optional by design; the type path is the fallback |
| B4 (no self parent) | `CHECK ((data->>'parent_id') IS DISTINCT FROM id::text)` | The chain walk terminates | Cheap; cycles longer than one are already cut by the walk's `seen` set (`owners.js ancestors`) |
| B5 (app matches the schema) | `CHECK (app = '<app>')` on a per-app table | A row in `dms_<app>` belongs to that app, so a cross-app reference cannot be planted | Per-app mode only; the DDL knows the app |
| B6 (parent in the same app) | Follows from B5 in per-app mode: a `data.parent_id` can only resolve to a row in the same table | Apps stay isolated | The validator already requires the same app |
| B7 (grant shape) | `CHECK (jsonb_typeof(data) = 'object')`; `CHECK` that `data->'authPermissions'` is absent or an object, not a JSON string (pass 2 of the old migration met 8,503 string-encoded grants); `CHECK` that `data->'parent_id'` is absent or a number | The resolver never meets a string where it expects grants or an id | SQLite: `json_valid` + `json_type`. Existing string-encoded grants are converted first |
| B8 (type shape) | `CHECK` that `type` matches the type-system grammar (`{parent}|{instance}:{kind}` or a legacy bare type) | Kind and parent are derivable from every row | Needs the full list of legacy bare types first; may be too strict to be worth it |
| B9 (formats are server-written) | A separate database role for the app's request path with no `INSERT/UPDATE/DELETE` on `formats`; the script uses the owner role | "No client writes formats" stops being a code convention | Needs two connections per db config; biggest operational change here |
| B10 (one env row per pgEnv) | ~~Partial unique index on `(data->>'pgEnv', data->>'source_id')` for mirror stubs~~. Restated 2026-11-12: the mirror rows are gone ([pgenv-auth-without-mirror-rows.md](./pgenv-auth-without-mirror-rows.md)). What is left is one `:dmsenv` row per pgEnv per app: a partial unique index on `(data->>'pgEnv')` for `:dmsenv` rows | A site's pgEnv resolves to one env row, so its grants sit in one place | B1's `dmsenv` index covers the same row by type; this one covers two env rows with different names naming one pgEnv. Hub audit: no duplicates |
| B11 (auth tables) | Foreign keys and uniqueness in `auth_tables.sql` (`groups_in_projects`, `users_in_groups` to their parents) | A grant cannot name a group link that does not exist | Read `auth_tables.sql` and `migrate_auth_core.sql` first; some may exist |
| B12 (change_log is append-only) | Revoke `UPDATE/DELETE` on `change_log` from the request role, or a trigger | The audit trail the initiative's outcome names | Shares the role split with B9; `change-history-growth.md` and the reclaim script need an exception |

Postgres row-level security was considered as the strict end of this: it would move the judge into the
database. Not proposed: the judge reads formats, mirrors and the request's site, and duplicating it in
policies gives two implementations to keep equal.

### Approach

1. **Measure.** One read-only script (`audit-db-invariants.js --db --app`) that counts violations of every
   candidate on a real app; run on the `rowauth-test` clone and the hub database.
2. **Owner picks** from the table with the counts beside each row.
3. **Add to the create path** (A2's `setupApp` and the create scripts) so new apps get them all, and to a
   migration that adds each to an existing app only when its count is zero, reporting the rest.
4. **Tests:** for each constraint, a direct-SQL write that violates it is refused, on both dialects, and
   the application's own paths (create site, page edit, source upload, pgEnv attach, child sweep,
   copy-db) still pass with every constraint on.

## Open decisions

State on 2026-11-13: B7 (shapes) is the only constraint picked. Recommendations given to the owner on
2026-11-12, none answered yet:

- **Which other constraints.** Recommended: B4 (no self parent), zero violations everywhere, and B1 (unique
  containers) for `dmsenv` and `site`, clean on all four hub apps. Hold B1 for `pattern`, `source` and
  `view` until the duplicates are resolved (hub 1 pattern; `mny` 2 sources, 4 views; `tny` 5 patterns). Hold
  B5 (app matches schema) until the 138 `dms-site` rows in `dms_tny` are moved or deleted. Hold B8 (type
  grammar): 3 bare-type rows on `tny`, and the legacy list is not complete. Drop B11 (auth tables): already
  in place.

- **A3:** `formats.json` shipped with the build and registered at boot (recommended), or the emitter run
  from the checkout.
- **A4:** defaults applied by the server on create (recommended), or left in the client behind one shared
  helper.
- ~~`parent_id` and `auth` columns~~ — settled 2026-11-10: no columns. `parent_id` is a protected key in
  `data`; the `auth` column is retired.
- **B9 / B12:** is a second database role acceptable operationally?
- Whether Part B becomes its own task once the audit numbers exist. It is kept here for now because the
  create path (A2) is where both parts land.

## Phases

### Phase 1 — audit (no writes)
- [ ] A4's audit of each create path on a fresh SQLite app under `enforce`; record the table of findings here.
- [x] `audit-db-invariants.js` (read-only; Postgres and SQLite) written, and run on the hub db
      (`hub-dms`, apps `hub`, `mny`, `tny`, `fusion`; `hub-auth`) 2026-11-12: see "Audit — hub db" below.
- [ ] The same audit on `rowauth-test` (`dms-mercury-3`). Not run.

### Phase 2 — the new-app path — A1, A1b and the column step built 2026-11-10, committed `878ecc2e`; A2 partly (B7's checks at table creation); A3, A4 not started
- [x] A1 (`parent_id` in `data`): create writes `data.parent_id` on any schema; edit, mass-edit and
      `/sync/push` protect the key; the client strips it before saving a child; `owners.js`,
      `stampChildren` and both sweeps read and write the `data` key; tests ported and new cases added.
- [x] A1b (`auth` column retired): `grantsOf`, `declared()` and the controller read `data` only;
      `rowAuthCaps.js` deleted; scripts updated. No projection helper was needed (see "Built").
- [x] `setup-app.js` column step: dry run reports; `--apply` moves, verifies, drops both columns;
      stored `data.parent_id` values are checked; the uniqueness guard is opt-in. Tested on SQLite and
      on the Postgres container.
- [ ] **Owner:** run `setup-app.js` (dry, then `--apply`) on `rowauth-test`, then on each app whose table
      has the columns. Not run on any real database in this session.
- [ ] A2: `ensureTable` calls the setup step on first create. Done so far (2026-11-12, uncommitted): the
      server's main-table paths create the table with B7's three checks. Left: the uniqueness guards and
      the format rows at first create, which wait on Phase 3's picks and A3.
- [ ] A3: formats at creation and at boot, per the decision; `deploy.sh` / the site deploy writes the file.
- [ ] A4: defaults in one place; the create-each-path-under-enforce test.

### Phase 3 — constraints
- [x] B7 (shapes), picked 2026-11-12: built, see "Built — 2026-11-12 (B7)". New apps get the three checks
      at table creation; existing Postgres apps through `setup-app.js --add-shape-checks`.
- [ ] **Owner:** commit the B7 work (uncommitted on 2026-11-13).
- [ ] **Owner:** deploy, then `setup-app.js --apply`, then `--add-shape-checks`, per app on the hub (order
      in "Built — 2026-11-12 (B7)").
- [ ] Browser check of the permission editors (page, section, pattern, env row, source) after the writer
      change. Not done.
- [ ] The other constraints the owner picks, in `setupApp` and the create scripts.
- [ ] The migration for existing apps, zero-violation ones only; the report for the rest.
- [ ] Refusal tests on both dialects; the application suites green with constraints on. Done for B7
      (`test-setup-app`); to repeat for each constraint added.

### Phase 4 — docs
- [x] `scripts/README.md`: `audit-db-invariants.js` and `setup-app.js` steps 3 (values stored as text) and
      5 (shape checks), 2026-11-12.
- [ ] `dms-server/CLAUDE.md`, `dms-server-env.md`, and a "setting up a new app" note that replaces the
      per-script checklist.

## Audit — hub db, 2026-11-12 (Phase 1, read-only)

`node src/scripts/audit-db-invariants.js --db hub-dms --app hub --app mny --app tny --app fusion --auth-db hub-auth`
and `setup-app.js` dry runs on the same four apps. Nothing was written. The `dms` schema's `asm` app (6
rows) was not audited.

| | `hub` (17 rows) | `mny` (337,130) | `tny` (28,339) | `fusion` (5) |
|---|---|---|---|---|
| Retired columns (`parent_id`, `auth`) | none | none | none | none |
| B1 (unique containers): duplicated types | pattern 1 | source 2, view 4 (16 extra rows) | pattern 5 (11 extra rows) | 0 |
| Rows carrying `data.parent_id` | 4 | 1 | 2 | 0 |
| B2 (parent exists): dangling | 0 | 0 | 0 | 0 |
| B4 (no self parent) | 0 | 0 | 0 | 0 |
| B5 (app matches schema): other apps' rows | 0 | 0 | `dms-site` 138 (`npmrds_docs` components) | 0 |
| B7 (shapes): `data` not an object | 0 | 0 | 0 | 0 |
| B7: grants stored as a JSON string | 2 of 2 | 81,777 (object 206, null 1,488) | 13 (object 114, null 63) | 2 of 2 |
| B7: `data.parent_id` not a number | 4 (strings) | 0 | 0 | 0 |
| B8 (type grammar): bare types | 0 | 0 | 3 rows (`mapeditor`, `map_editor_test`, a uuid) | 0 |
| B10 (one env row per pgEnv) | none attached | `hazmit_dama`, `npmrds2`; no duplicates | same two; no duplicates | none attached |
| Mirror rows left | 0 | 0 | 0 | 0 |
| `formats` rows | 0 | 0 | 0 | 0 |

- **No column step to run on the hub.** No app has `parent_id` or `auth`; `setup-app.js --apply` would
  write nothing there. Every stored `data.parent_id` passes the create-time check.
- **Existing constraints:** each `data_items` has its primary key and two non-unique indexes
  (`ix_data_items`, `ix_data_items_type_trgm`). No uniqueness guard, no checks.
- **B7's grant check does not fit what is written today.** A string is the common stored form, not a
  leftover: the hub's own site row and auth pattern (made by provisioning this month) hold
  `authPermissions` as a JSON string, as do 79,537 `mny` components with the same value
  (`{"users":{},"groups":{"LHMP Template Editor":["*"]}}`). The check needs the write path to store an
  object first (server-side, on create and edit), then a conversion of the stored strings. `mny` also has
  330 pages whose `authPermissions` is the empty string.
- **B7's `parent_id` check:** the hub's 4 rows hold the id as a string (`pages|component`,
  `pages|page-edit`, `availabs|…`). Which path wrote them is not traced; `createData` is meant to write a
  number.
- **Parentage is almost entirely the type path.** 7 rows of 365,000 carry `data.parent_id`.
- **B5 on `tny`:** 138 rows of app `dms-site` sit in `dms_tny.data_items`. A `CHECK (app = 'tny')`
  cannot be added until they are moved or deleted.
- **B1:** the duplicates above block the guard for that kind on that app; `dmsenv` and `site` are clean
  everywhere, `source` and `view` on all but `mny`, `pattern` on `mny` and `fusion`.
- **B9 / B12 (roles):** the server connects as `postgres`, a superuser. No privilege can be revoked from
  a superuser, so both need a new non-superuser role for the request path before they mean anything.
  `change_log` is one table per database (`dms.change_log`), not per app.
- **B11 (auth tables), `hub_auth`:** the four foreign keys already exist (`groups_in_projects` and
  `users_in_groups` to their parents, cascade on update and delete); no orphan links. Nothing to add.
- **No app has `formats` rows**, so every rule and vocabulary read on the hub falls back to the stamp in
  `data`, then the built-in copy (A3).

### B7 follow-up: how values reach `data` (traced 2026-11-12)

Owner's question: is everything written into `data` a JSON string? Traced, and measured on a 10% sample
of `dms_mny` and `dms_tny`:

- **The `data` column itself is always a JSON object** (all 365,000 audited rows). The client sends the row
  as an object (`api/index.js`: `falcor.call(["dms","data","edit"], [app, id, row, type])`), and the server
  merges it into the JSON column.
- **Each key holds whatever its writer sent; the server neither parses nor stringifies nested values.**
  Most keys are real JSON (`element`, `sections`, `draft_sections`, `section_groups`, `history`, `theme`,
  `dataSources`, `helpText`).
- **A few writers stringify first, so their key holds JSON inside a string:**
  - `authPermissions`: `ui/components/Permissions.jsx` `onChange(JSON.stringify(newAuth))` (the section and
    page permission editor) and `utils/tenantProvisioning.js` (lines 155, 331). The pattern editor's
    `permissionsEditor.jsx` sends an object, which is why both forms exist (`mny` sample: 8,153 strings,
    17 objects).
  - `parent` (`mny`: 16,901 strings, 16,304 objects), `stateJson`, `layoutJson`, some `filters`.
- Readers already accept both (`routes/auth/grants.js resolveAuthPermissions` → `parseJson`; the client's
  load path parses string values).

**Owner, 2026-11-12 (first):** do the checking elsewhere, no database check on grant shape.
**Owner, 2026-11-12 (later, supersedes):** change the writers to send JSON, convert the stored strings, and
go ahead with B7. Built the same day; see "Built — 2026-11-12 (B7)".

## Built — 2026-11-10 (A1, A1b, the column step)

**Server**
- `routes/dms/parentId.js`: `data.parent_id` is the store. New `withParentId`, `stripParentId`,
  `PARENT_ID_SQL`; `stampChildren` merges `{ parent_id }` into the child's `data` (only when it
  differs); `sweepRemovedChildren` / `sweepAllChildren` compare `data->>'parent_id'`.
- `routes/dms/dms.controller.js`: `claimParentId` (validate a create's claim, on any schema, before the
  transaction) and `withoutParentId`, both exported; `createData` uses the first, `setDataById` and
  `updateDataById` the second; `setMassData` refuses the key; the four INSERT variants are one.
  `childStampPlan` / `childRefsForType` no longer probe columns.
- `routes/dms/dms.route.js` (`dms.data.edit`) and `routes/sync/sync.js` (`/sync/push`): the key is
  removed from an edit BEFORE the guard judges it; a pushed create's claim is checked; an `I` onto an
  existing id (which replaces `data`) carries the stored value over.
- `routes/auth/owners.js`, `vocabulary.js`: `data` only. `routes/dms/rowAuthCaps.js` deleted.
- Scripts: new `setup-app.js`; `migrate-row-auth.js` refuses to run (header explains);
  `audit-auth-levels.js`, `backfill-view-pattern.js`, `sweep-site-grants.js` read and write `data`.
- Client: `api/index.js` and `api/updateDMSAttrs.js` drop a stored `parent_id` from a child before
  re-claiming it. Docs: `CLAUDE.md` (library), `scripts/README.md`, `dms-server-env.md`,
  `pattern-registry.md`.

**Found on the way**
- **Edits merge** (`jsonMerge`), so a stored `parent_id` survives an edit that does not mention it. The
  one replacing write is `/sync/push` `I` onto an existing id, handled above.
- **`data.parent_id` was already being written, unchecked.** The client sends `parent_id` on every
  dirty child save; creates through Falcor stripped it, but Falcor EDITS and every `/sync/push` merged
  it into `data` as sent, where nothing read it. Now that the auth walk reads the key, those old values
  matter: `setup-app.js` step 2 holds every stored value to the create-time check and `--apply`
  removes the ones that fail. **Run it on each app before relying on `enforce`.**
- **The bulk auth loaders were dead code.** `authProjection`, `hasAuthColumns`, `patternRowForPages`,
  `authRowsByIds`, `authContainers` had no caller; deleted. `owners.js loadApp` is the one loader and
  selects container rows only, so the JSON-extraction projection A1b planned was not needed.
- **A patch with no `parent_id` must pass through untouched.** Parsing a JSON-string payload to look
  for the key lost ids past double precision (`test-data-auth.js` caught it); `stripParentId` returns
  the original value when the key is absent.
- **Column grants that `data` overrides were never read**, so a disagreement between the column and
  `data` does not block the drop; `setup-app.js` lists those rows as dead. The one blocking case is a
  `view` flag over grants stored per subdomain or as a JSON string.
- **`emit-formats.mjs` was broken on `master`** (a format imports `TenantList` from a stubbed module),
  so `register-formats.js` without `--file` failed. One name added to `STUB_NAMES`; A3 depends on it.

**Not done, and why**
- **The parentage backfill is not ported.** `migrate-row-auth.js` passes 3–4 (fill parents from the
  declared arrays, duplicate a row two owners name, delete a row no owner names) and `--verify-parents`
  wrote and read the column. A row now gets `data.parent_id` when created with a claim or when its
  parent is next saved. Owner to decide whether a bulk backfill is wanted; `DMS_CHILD_SWEEP_MODE=delete`
  was gated on `--verify-parents`, which no tool reports any more.
- A2's `ensureTable` wiring, A3, A4, Part B's audit and constraints.

**Tests** (2026-11-10): `npm test` green (now includes `test-setup-app.js`, and `test-formats.js` again);
read / data / source / uda-auth / upload / schedule / datatype auth, site-grants, pgenv-mirror, sync
(107), access-log green; client `vitest run src/patterns src/utils src/api` 61 passed.
`test-setup-app`, `test-parent-stamp`, `test-child-sweep` also green on the Postgres container.
Failing before and after this change (same failures against the committed versions of the files
touched): `test-pattern-stub` (3), `test-uda` (2), `test-migrate-site`, `test-db-copy` (1).
`test-auth.js` (the HTTP auth suite) fails in `users by project`; it exercises `src/auth/`, which this
change did not touch, and was not compared against a baseline.

## Built — 2026-11-12 (B7: grants stored as JSON, the shape checks)

Not committed as of 2026-11-13 (working tree on `master`). Nothing written to any real database: the hub
runs below are dry runs.

**The rule, in the database** (`db/table-resolver.js shapeChecks`): three CHECK constraints on an app's
main `data_items` table.

| Constraint | Postgres expression |
|---|---|
| `data_is_object` | `jsonb_typeof(data) = 'object'` |
| `grant_shape` | `COALESCE(jsonb_typeof(data->'authPermissions'), 'null') IN ('object', 'null')`, and the same for `auth_permissions` |
| `parent_id_shape` | `COALESCE(jsonb_typeof(data->'parent_id'), 'null') IN ('number', 'null')` |

SQLite has the same three with `json_type`. A write that breaks one fails with a constraint error, whoever
makes it (the server, a script, psql).

- **A new app's table is created with them**, on both dialects: the server's main-table paths call
  `ensureTable(…, { checks: true })` (controller `mainTable` / `ensureForWrite` / `ensureForRead` /
  `setDataById`, `sync.js mainTable`, `uda/utils.js dmsMainTable`). This is the first piece of A2.
- **Dataset-row tables carry none** (their columns are the dataset's own), and **tables a script creates
  to copy rows into carry none** (`copy-db.js`, `migrate-site.js`, `migrate-to-per-app.js`: the rows may
  predate the stored shape). `setup-app.js` adds them afterwards.
- **An existing Postgres table** gets them from `setup-app.js --apply --add-shape-checks`, each only when no
  row violates it (`ADD CONSTRAINT … NOT VALID`, then `VALIDATE`). SQLite cannot add a constraint to an
  existing table; the script says so.

**The server stores grants as an object on every write** (`routes/auth/grants.js normaliseGrants`,
`storedGrants`): a JSON string of an object is parsed; a value that names no grants (`''`, an array, text
that is not JSON) becomes null, which is how it was read. Applied in `createData`, `setDataById`,
`updateDataById`, `/sync/push` (create and edit) and the DMS branch of `updateSource` / `updateView`. An old
client bundle that still sends a string is therefore stored correctly and never meets the check.
`dms.data.massedit` refuses the two grant keys on a main table (it writes its value as text).

**The writers send an object:** `ui/components/Permissions.jsx` (`onChange(newAuth)`),
`utils/tenantProvisioning.js` (both patterns). The six callers of `Permissions` already took either form.

**SQLite merge fix, found on the way** (`db/query-utils.js jsonMerge`): `json_patch` merges an object into
the stored one and keeps members the patch leaves out; Postgres' `||` replaces the key. With grants sent as
an object, a grantee removed in the editor would have stayed on SQLite (the pattern editor already had this
bug there; the string form hid it for pages and sections). A grant key the patch carries as an object is
now dropped from the stored value first, so it lands whole on both dialects. `auth/utils/siteGrants.js`
no longer hands SQLite a merge patch.

**`setup-app.js` step 3 (values stored as text)**, dry run by default: rewrites stored grant strings as the
object they hold, one UPDATE per distinct value; non-grants become null; a `parent_id` of digits becomes the
number. No `change_log` entry and no `updated_at` change: readers see the same grants. Step 5 is the checks.

**Dry run on the hub db, 2026-11-12** (`--add-shape-checks`, no `--apply`):

| | `hub` | `mny` | `tny` | `fusion` |
|---|---|---|---|---|
| Grant strings to rewrite | 2 | 81,778 (30 distinct values; 330 empty strings become null) | 13 | 2 |
| `parent_id` strings | 4 | 0 | 0 | 0 |
| `data_is_object` | clean | clean | clean | clean |

**Order on a real database. The checks must come last:**
1. Deploy this server code to every server that writes to the database (it stores objects whatever a
   client sends).
2. `setup-app.js --db … --app … --apply` per app (the rewrite; safe before or after step 1, since readers
   take both forms, but an old server can write new strings after it).
3. `setup-app.js --db … --app … --apply --add-shape-checks` per app. Before step 1 this would make an old
   server's permission saves fail.

**Tests.** `test-setup-app` 37 (SQLite and the Postgres container): the rewrite, null cases, idempotence,
checks added on Postgres, a new app's table refusing a string grant, a string `parent_id` and a non-object
`data` written past the server, and a create and an edit that send a string storing the object. Also green
on both: `test-site-grants` 8, `test-data-auth` 66, `test-sync` 107, `test-parent-stamp` 17,
`test-child-sweep` 21, `test-workflow`. SQLite: `npm test` exit 0; read-auth 30, source-auth 27, uda-auth
29, datatype-auth 8, upload-auth 37, schedule-auth 12, access-log 14, pgenv-auth 21, snapshot-reload 6.
Unchanged failures, not from this work: `test-uda` 2, `test-migrate-site`, `test-db-copy` 1,
`test-pattern-stub` 3. Client: `adminPatternRow.test.js` updated and passing; the full vitest run has 15
failures in 7 files, none of which import the files changed here (not compared against a clean checkout).

**Not done.**
- Not applied to the hub or any real database.
- Not checked in a browser: saving permissions on a page, a section, a pattern, an env row and a source.
- `copy-db` / `migrate-site` into a fresh database leave the target without checks until `setup-app.js`
  runs there.
- Host-app writers (`src/patterns/qa`, `src/patterns/chat` in dms-template) pass grants through from a
  pattern row; they were read, not changed, and the server normalises whatever they send.

## Related

- [pgenv-config-on-the-site-row.md](./pgenv-config-on-the-site-row.md) — companion; attaching a pgEnv is
  the other half of "a new app is complete".
- [format-declarations-server-side.md](./format-declarations-server-side.md) — the owner's per-site
  registration step, and Phase 4's deletions, both wait on A3.
- [row-auth-schema.md](./row-auth-schema.md) — the columns, the probes, the uniqueness guard.
- [row-auth-production-cutover.md](./row-auth-production-cutover.md) — existing apps; `setup-app.js`'s
  report is its per-app checklist.
- [split-mode-per-app-default.md](./split-mode-per-app-default.md) — per-app tables are what make B5/B6 cheap.
- [tenant-signup-production-readiness.md](./tenant-signup-production-readiness.md) — tenant creation is
  one of the create paths.

## Progress

- 2026-11-10: filed with the measured gap table. Nothing built.
- 2026-11-10 (later): owner recalled both columns being dropped; checked the code. `parent_id` is in use,
  `auth` is a read fallback no request path writes. Gap table, A1, B2 and B7 corrected.
- 2026-11-10 (later still): owner: `parent_id` is a row-auth leftover kind auth does not need. Confirmed it
  is one read in `routes/auth` with narrow reach; recorded retire-vs-keep as the gating decision, A1 on hold.
- 2026-11-10 (end of session): the retire branch became its own task,
  [children-by-type-path.md](./children-by-type-path.md) (type path as the only parentage, on its own
  branch, by migration). That task is now set aside (see the decision below); this task
  no longer waits on it.
- 2026-11-10 (decision): owner: no `parent_id` column, keep create writing `data.parent_id`; retire the
  `auth` column too. A1 rewritten (with edit-path protection, which the column gave for free), A1b added,
  B2 / B3 dropped, B4 / B6 / B7 restated, phases updated. [children-by-type-path.md](./children-by-type-path.md)
  is set aside for now; nothing here depends on it.
- 2026-11-10 (built): A1, A1b and the `setup-app.js` column step implemented and tested on both dialects;
  see "Built". Status → doing. Not committed; `setup-app.js` not yet run on a real database.
- 2026-11-12: picked up on the hub db (`hub-dms`). `audit-db-invariants.js` written (Phase 1's audit
  script); it and the `setup-app.js` dry runs were run read-only on `hub`, `mny`, `tny`, `fusion`. Findings
  in "Audit — hub db". Nothing written to the hub. A2–A4 and the constraint picks wait on the owner.
- 2026-11-12: traced the write path for B7 (see "B7 follow-up"). `data` is always an object; nested keys
  hold what the writer sent, and `authPermissions` is a string from `Permissions.jsx` and tenant
  provisioning, an object from the pattern editor. Owner: no database check on grant shape.
- 2026-11-12 (later): owner reversed the B7 decision: writers send JSON, stored strings are converted, the
  checks go in. Built and tested on both dialects; dry-run on the hub only. See "Built — 2026-11-12 (B7)".
- 2026-11-13: doc brought up to date. Added "Current state" at the top. A1, A1b and the column step are
  committed (`878ecc2e`, on `master`, which now includes `tenant-domains`); the B7 work and the audit script
  are still uncommitted. B10 restated for the mirror's removal. Open decisions carry the recommendations
  given on 2026-11-12. No code change today.
