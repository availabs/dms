# Format declarations server-side: the `formats` table, filled at pattern registration

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Release:** review — Phases 1–3 built 2026-11-06, nothing committed; Phase 4 (the deletions) waits on every site's declarations being registered; Phase 5 (the table moves into the app schema) built 2026-11-07 · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

dms-server reads a row kind's auth rules, permission vocabulary and `childRefs` from the row that was
stamped with them at create time (`stampPatternRow` / `stampSiteRow` in `patterns/registry.js`), because
it cannot import the client package. A later change to a format never reaches an existing row, which is why
`emit-auth-vocabulary.mjs` + `stamp-auth-rules.js` exist ([auth-rules-stamp-backfill.md](./auth-rules-stamp-backfill.md)).

**Owner, 2026-11-05:** the declarations move to the server. Registering a pattern type puts the type's
declarations in the `formats` table (`dms.formats`, exists in both schemas, holds no rows today), and the
auth layer reads them from there. Rows stop carrying a copy; the manifest and the stamp script are deleted.

**Owner, 2026-11-06:** no client may set or update the table — not a browser, not the dms CLI. The rows are
registered by a server-side script (`dms-server/src/scripts/register-formats.js`), a step of a deploy. The
route and client push first built that day were removed the same day; the one HTTP route is a read.

## What crosses, and what does not

A format object is not plain data: `page.format.js` imports React and a section component and carries
functions (`defaultSort`). What the server needs is the serializable subset the registry already derives at
`registerPatternTypes`:

| Key | Derived by | Read on the server by |
|---|---|---|
| `authVocabulary` (`self` / `descendants` lists with `fields`, `when`, `publicRead`) | `deriveAuthVocabulary.js` | `routes/auth/vocabulary.js`, `owners.js mapsFor` |
| `authRules` (per row kind) | `deriveAuthRules.js` | `owners.js ruleFor`, `judge.js` |
| `childRefs` | the type definition | `routes/dms/dms.controller.js childRefsForType`, `parentId.js` |
| `attributes` (key, type, `format`, `isArray`) | the format | nothing yet; stored so `dms.format` can serve it |

One row per **type**, not per app: `formats(app, type)` holds `app = <pattern type name>`, `type = <row kind>`
(`datasets+source`, `page+page`, `admin+site`). The same keys the client's `format: 'datasets+view'` attribute
references already.

## Design

### The route

`POST /dms/formats` (REST, beside the Falcor `dms.format` route) with `{ app, type, attributes, authVocabulary,
authRules, childRefs }[]`. Upsert on `(app, type)`. Gated: the caller holds site `*` on the app named by
`X-DMS-App`, or `${app} Admin`. An ordinary visitor's boot never writes. Idempotent: a payload equal to the stored
row is a no-op, so the client can send on every admin session without churn.

### The client

`registerPatternTypes` keeps deriving. A new `publishDeclarations(falcor | fetch)` sends every registered type's
subset. Called from the admin pattern's site config when an admin user loads the site (the same trust the
Pattern Editor's permissions tab already has), and from the dms CLI (`dms formats push`) for deploys without an
admin visit. `stampPatternRow` / `stampSiteRow` stop stamping `authRules`, `authVocabulary` and `childRefs`
once every server reads the table (keep them one release for old servers).

### The server

- `owners.js ruleFor(snap, row)`: the type of the nearest pattern ancestor (or `admin` for site-level kinds)
  → `formats` row → `authRules[row.kind]`. `mapsFor` likewise. Rows that still carry a stamp are read only when
  the table has no row for the type (one release), then ignored.
- `dms.controller.js childRefsForType`: same lookup.
- Cache per process with the same 30s TTL as the snapshot; the route clears it on write.
- `settings`-style read: `GET /dms/formats?app=` for the client's own use later (a build could skip bundling
  the derivation; not this task).

### Deletions when done

- `packages/dms/scripts/emit-auth-vocabulary.mjs`, `dms-server/src/scripts/stamp-auth-rules.js`.
- `routes/auth/rules.js` (the built-in copy), the `read` fill in `ruleFor`, `owners.js undeclaredPublicRead`
  — the three transitional pieces [auth-layer-simplification.md](./auth-layer-simplification.md) left.
- The fingerprint half of `authRules.sync.test.js` (a change to the rules no longer needs a backfill; the
  copy-sync half with `rules.js` goes with `rules.js`).
- `stampPatternRow` / `stampSiteRow` once no supported server reads the stamp.

## Phases

### Phase 1 — table and route — DONE 2026-11-06
- [x] Migration: `formats` gains `auth_vocabulary`, `auth_rules`, `child_refs` (jsonb / TEXT) in both create
      scripts and both `migrate_dms_core` files; drift baseline regenerated in the same change.
- [x] `routes/auth/formats.js`: `formatsFor(app)` (per-site index, 30 s TTL), `upsertFormats` (idempotent,
      canonical compare, the payload is the whole set so a left-out key is removed, malformed payloads refused
      before any write; called by the script only), `listFormats`, `GET /dms/formats` (open, names the site;
      no write route). `scripts/register-formats.js --db --app [--file formats.json | --extra <format.js>…]
      [--apply]`: dry run prints each key to write or remove and the columns that differ; without `--file` it
      runs the client package's emitter from the sibling checkout. `tests/test-formats.js` (11 cases) in
      `npm test`, including the script dry / apply / re-apply / prune and the emitter path.

### Phase 2 — the client package emits — DONE 2026-11-06 (reshaped the same day: no client push)
- [x] `patterns/declarations.js`: `declarationsOf(entries)` → rows; `plainData` drops functions, React
      elements, component-only objects and GETTERS (admin.format's `pattern_type.options` is read off the
      live registry, so the browser's registry and the emitter would otherwise disagree).
- [x] `scripts/emit-formats.mjs` (reworked from `emit-auth-vocabulary.mjs`, same esbuild stubbing; prints
      the rows; `--extra` for a host app's types) is what the server's script registers. `registry.js
      declarations()` builds the same rows in the browser only so `declarations.test.js` (replaces
      `authRules.sync.test.js`) can prove the emitter prints exactly what the registry derives; it also checks
      the stamp and the `rules.js` copy. `dms formats diff | list` in the CLI are read-only
      (`cli/src/commands/formats.js`; docs in `cli/docs/README.md` "Formats").
- [x] ~~`publishDeclarations` from the admin pattern, `POST /dms/formats`, `dms formats push`~~ — built,
      then removed the same day on the owner's rule above.

### Phase 3 — server reads the table — DONE 2026-11-06
- [x] `owners.js`: the snapshot carries `snap.formats`; `ruleFor` reads `formats.rules[kind]` → the stamp on
      the nearest ancestor → `rules.js`; `mapsFor` reads `vocabularyAt` (a pattern row → `<type>+pattern`,
      else the row's kind) → the stamp. `dms.controller.js childRefsForType`: the type's `child_refs` → the
      stamp. `dms.format` Falcor route splits its key on the first `+` (`<site>+<format key>`).
- [x] Verification: `dms formats diff formats.json` (read-only, exit 1 on a difference) against a site's
      stored rows, and the script's own dry run. `test-formats.js` runs the script dry (nothing written),
      `--apply` (written), `--apply` again (nothing), a pruning file, and without `--file` (the emitter path,
      all 17 built-in keys land).
- [ ] **Owner:** register once per site, on the server:
      `node packages/dms-server/src/scripts/register-formats.js --db <config> --app <app> [--extra …]`, dry,
      then `--apply`; `dms formats diff` clean on each. A deploy step for `deploy.sh` is the natural home
      (not added here: the host app's `--extra` list is the owner's).

### Phase 4 — delete — NOT STARTED (after every site has pushed)
- [ ] `routes/auth/rules.js` and `ruleFor`'s built-in fallback; the "identical to rules.js" half of
      `declarations.test.js`.
- [ ] The stamp: `stampPatternRow` / `stampSiteRow`, the stamp fallbacks in `ruleFor` / `vocabularyAt` /
      `childRefsForType`, `vocabulary.js declared()`'s `auth` / `data` reads (keep `fieldMaps` etc.),
      `migrate-row-auth.js` pass 1. Server test fixtures that stamp rows then push a declaration instead
      (`test-data-auth.js` "stamped rules", `test-read-auth.js` env vocabulary).
- [x] `emit-auth-vocabulary.mjs` → reworked as `emit-formats.mjs`; `stamp-auth-rules.js` deleted;
      the fingerprint test deleted; `auth-rules-stamp-backfill.md` dropped as superseded (registering IS
      the backfill).

### Phase 5 — the table moves into the app schema — DONE 2026-11-07

**Owner, 2026-11-07:** a `formats` row is per site, and under per-app split mode a site IS a schema
(`dms_<app>` on Postgres, a `__<app>` table prefix on SQLite). A shared `dms.formats` keyed by `app` repeats
the schema in a column and is the one DMS table every site writes into. It moves beside `data_items`:
`dms_<app>.formats` / `formats__<app>`, resolved and created the way `data_items` is. Build it BEFORE the
first registration (Phase 3's owner step): `dms3` holds zero rows today on every app, so there is nothing
to move now and something to move later.

#### Approach

- **Resolution, not a second mechanism.** `db/table-resolver.js` already maps an app to its schema
  (`resolveSchema`) and creates it (`ensureSchema`); `resolveTable` does the `data_items` case. Add the
  formats case to the same file: per-app Postgres → `{ schema: dms_<app>, table: 'formats' }`, per-app
  SQLite → `formats__<app>`, legacy split mode → the shared `dms.formats` / `formats`, exactly as
  `data_items` falls back. One `ensureFormatsTable(db, app)` beside `ensureTable`, cached the same way, runs
  the DDL below on first use; `ensureTable`'s rule that the shared table is init's job and the per-app one
  is created on demand applies unchanged.
- **The DDL is the shared table's, verbatim, `app` column included.** `data_items` keeps its `app` column
  in every per-app schema (5 MB of it on `mitigat-ny-prod`) and the copy script, the wire shape and
  `UNIQUE(app, type)` all read it; the table is self-describing when dumped or copied across. `id` stays
  an identity / AUTOINCREMENT column of its own — formats never share `dms_id_seq`, and nothing joins on a
  format id. Both dialects' DDL live in `buildCreateTableSQL`'s sibling so the create scripts stay the
  legacy-mode source and the per-app one is code, as for `data_items`.
- **Readers, all of them.** Three code paths read the table and one script copies it:
  - `routes/auth/formats.js`: `table(db)` becomes `await ensureFormatsTable(db, app)` returning the fully
    qualified name; `formatsFor` / `listFormats` / `upsertFormats` are already per app, so the SQL is
    unchanged apart from the name. The cache key is already the app.
  - `routes/dms/dms.controller.js getFormat`: receives `app+type` keys; group them by app, one query per
    app's table, concatenate. (`dms.route.js` already splits the key on the first `+`.)
  - `scripts/copy-db.js`: today copies `formats` as one global table and — a defect found while planning
    this — carries only `attributes`, not `auth_vocabulary` / `auth_rules` / `child_refs`. Discover
    `formats` per app schema the way the split tables are discovered, and copy all four columns. A
    cross-dialect copy (Postgres `dms_<app>.formats` ⇄ SQLite `formats__<app>`) follows from the resolver.
  - `scripts/register-formats.js`: no change; it already takes `--app` and goes through `upsertFormats`.
- **Legacy split mode keeps the shared table**, so no existing database changes shape and the create
  scripts, `migrate_dms_core` and the drift baseline are untouched. The per-app table is not in the drift
  test's view (it is created by code, like `data_items`), so the Phase 1 migration stays as the legacy-mode
  copy of the three columns.
- **Delete, don't keep.** Once this lands, `dms.formats` holds rows only on a legacy-mode database; `dms3`
  has none. No fallback read from the shared table in per-app mode: a site's declarations are in its
  schema or nowhere, which is the same answer `data_items` gives.
- **Tests.** `test-formats.js` runs against `cli-test` (SQLite, per-app), so every case exercises the
  per-app table once the resolver change lands; add one case that two apps' registrations land in two
  tables and that a legacy-mode config (`splitMode: 'legacy'`) still reads the shared one. `test-copy-db`
  (or the copy script's own test) gains the four-column round trip.

#### Steps
- [x] `table-resolver.js`: `resolveFormatsTable(app, dbType, splitMode)`, `buildFormatsTableSQL` (both
      dialects, the shared table's DDL verbatim) and `ensureFormatsTable` (cached like the data_items tables;
      legacy mode returns the shared table without DDL).
- [x] `routes/auth/formats.js` (`table(db, app)` → ensure + resolve; split mode from the db config, as the
      controller reads it) and `dms.controller.js getFormat` (keys grouped by site, one query per site's
      table) read through it.
- [x] `copy-db.js`: all four columns on the read, both writers and the per-row insert. Per-app discovery
      NOT done — found while porting that the script is legacy-mode throughout (`fqn` is `dms.<table>`,
      split tables are discovered in `dms` only), so a per-app database's `data_items` is not copied
      either; the formats table follows whatever port gives copy-db per-app mode. Noted in its header and
      `scripts/README.md`. (`test-db-copy.js`'s split-table case fails before and after this change —
      pre-existing.)
- [x] Tests: `test-formats.js` gains "a site's rows live in its own table": resolution for both modes, the
      push landed in `formats__<app>` and nothing in the shared table, a second site's registration makes
      a second table and leaves the first alone, `getFormat` with keys of two sites reads both tables.
      `test-db-copy.js` round-trips the three declaration columns. `npm test` green (12 formats cases),
      read/data/source/uda/upload-auth, parent-stamp, child-sweep, site-grants, pgenv-mirror green.
      Not run: the formats suite on a Postgres container (`dms_<app>.formats` DDL is the create script's
      with `GENERATED ALWAYS AS IDENTITY`, exercised only by eye).
- [x] Docs: `routes/auth/formats.js` header, `register-formats.js` header, `dms.sql` table comment,
      `dms-server/CLAUDE.md` split-mode line, `CLAUDE.md` "Formats are rows…", `dms-server-env.md`,
      `scripts/README.md`.
- [ ] Then Phase 3's owner step (register per site) runs against the per-app tables.

## Decisions (2026-11-06)

- **One row per SITE and format key, not one per type.** `app` is the site (one bundle, one set of
  declarations); two sites on one server may run different library versions (`npm run deploy -- <site>
  --dms <ref>`) and a global row would have them fight. `type` is the format's own key, which is what the
  client's `dms-format` attributes already name — `datasets+source`, `dms-site+page`, `admin+dmsenv` — not
  `<pattern type>+<kind>` as first proposed (a page's format is `dms-site+page`). A pattern TYPE's own
  declarations (its vocabulary, its childRefs) sit on `<type>+pattern`: "pattern rows of this type".
  No new table and no change to the unique key.
- **Rules are per kind, merged across the site's rows.** A format's `rules` map lands on its own row;
  the server merges every row's map by kind (first wins, a disagreement is warned). `rulesOn: 'site'`
  no longer decides where a rule is READ — only where the one-release stamp goes, and which formats
  carry their own vocabulary.
- **Vocabulary: a pattern row declares for its subtree; a site-level container for its own.** As the
  stamp did: `<type>+pattern` holds the type's `{ self, descendants, publicRead? }`; a format of a
  `rulesOn: 'site'` type that registers children (site, dmsenv, and so source) holds
  `deriveDmsEnvVocabulary(format)`. Nothing else carries one.
- **Who writes: a server-side script, nobody else (owner, 2026-11-06).** The first build gated a
  `POST /dms/formats` on `${app} Admin` / site `*` / AVAIL and had the admin pattern push on load; the
  owner's rule is that no client sets or updates format data, so the route, the registry's push, the
  admin hook and the CLI's `push` were removed. `register-formats.js` runs where the server runs, with
  the db config, like the other scripts. A deploy-time secret was the task's alternative; moot.
- **Precedence while the stamp lives:** table → stamp → built-in. Tests that stamp a custom rule or
  vocabulary on a fixture row still pass because their sites push nothing.
- **The table lives in the app schema (owner, 2026-11-07).** Per site is per schema under per-app split
  mode; see Phase 5. Decided after the size analysis of `dms3` showed the table empty on every app, so the
  move costs no data migration if it lands before the first registration.
- **A registration is the whole set:** a stored key the rows leave out is removed. The emitter prints
  everything the package declares; a hand-made `--file` must too.

## Open decisions

- **Per-app override.** Now that rows are per site, a site that wants its own rules for a built-in type
  can be given them by pushing a different file — nothing in the server distinguishes "the registry's"
  from "the emitter's". Since only the script writes, an owner's edited `--file` is a working override
  until the next registration from the emitter overwrites it. Not needed today.

## Progress

- 2026-11-07: the owner asked whether the table belongs in the app schema; yes — Phase 5 written up
  (resolver-based, same DDL, legacy mode keeps the shared table, copy-db's missing columns fixed on the way)
  and built the same day. Found on the way: `copy-db.js` is legacy-mode only (left as is, noted).
- 2026-11-06: Phases 1–3 built (see the phases). Suites: `npm test` (server core, now with `test-formats.js`)
  green; the 19 auth / row-model suites green; client `vitest run src/patterns src/utils` 61 passed, eslint
  clean on the touched files. Not run: the HTTP auth suite (Postgres container).
- 2026-11-06 (later): the owner ruled that no client writes the table; the write route, the registry's
  `publishDeclarations`, the admin hook and `dms formats push` were removed and
  `scripts/register-formats.js` added (tested dry / apply / re-apply / prune / emitter path). Suites rerun
  green.

- 2026-11-05 (later): auth-grants-on-the-owner-row.md changed the rules (owners are ancestors only; the site
  domain holds the auth verbs; no type carries `publicRead`), so the fingerprint moved to `bce6ede7c2b64026`
  and the stamp backfill is triggered again. Nothing here changes: the route stores whatever the registry
  derives, and `siteCan(app, user, ['*'])` reads the site row directly now, which is the gate proposed below.
- 2026-11-05: filed after the owner chose this over re-stamping rows
  ([pgenv-mirror-into-dms.md](./pgenv-mirror-into-dms.md) is the companion task).
