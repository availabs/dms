# A new app is created auth-complete, and the database refuses what the auth layer assumes away

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** doing · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

The row-auth work added columns, format declarations, grants and mirror rows, and every one of them reached
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
| The pgEnv env row and mirror stubs | `reconcile-pgenv-mirror.js`, per site per pgEnv | None; covered by [pgenv-config-on-the-site-row.md](./pgenv-config-on-the-site-row.md) |
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
| B10 (mirror identity) | Partial unique index on `(data->>'pgEnv', data->>'source_id')` for `:source` rows that carry `pgEnv`, same for views | One stub per pgEnv source per site | Per-app tables make "per site" free |
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
   the application's own paths (create site, page edit, source upload, mirror reconcile, child sweep,
   copy-db) still pass with every constraint on.

## Open decisions

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
- [ ] `audit-db-invariants.js`; counts for B1–B12 on `rowauth-test` and the hub db; record here.

### Phase 2 — the new-app path — A1, A1b and the column step BUILT 2026-11-10 (nothing committed); A2–A4 not started
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
- [ ] A2: `ensureTable` calls the setup step on first create (the script and its function exist; the
      wiring, and which constraints a new app gets, wait on Phase 3's picks).
- [ ] A3: formats at creation and at boot, per the decision; `deploy.sh` / the site deploy writes the file.
- [ ] A4: defaults in one place; the create-each-path-under-enforce test.

### Phase 3 — constraints
- [ ] The ones the owner picked, in `setupApp` and the create scripts.
- [ ] The migration for existing apps, zero-violation ones only; the report for the rest.
- [ ] Refusal tests on both dialects; the application suites green with constraints on.

### Phase 4 — docs
- [ ] `dms-server/CLAUDE.md`, `scripts/README.md`, `dms-server-env.md`, and a "setting up a new app" note
      that replaces the per-script checklist.

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
