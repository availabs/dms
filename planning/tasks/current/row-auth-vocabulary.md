# Row auth 3: patterns declare their verbs, the server interprets them

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** built · **Release:** commit — on `permissions_move`, uncommitted · **Created by:** amuro@albany.edu · **Edited by:** —

Part of [server-side-auth-general.md](./server-side-auth-general.md) (hub). Depends on [row-auth-resolver.md](./row-auth-resolver.md).
**Client work, plus one server read.**

## Objective

Let a pattern declare its own vocabulary and what each verb confers, so the server enforces
pattern-specific permissions **without knowing any pattern** — hub, "Where `implies` is applied".

## What changes

- **`authVocabulary` on the pattern row**, published by the client that registered the pattern:

  ```js
  authVocabulary: {
    self:        { 'edit-pattern': ['edit'], 'edit-pattern-permissions': ['grant'] },
    descendants: { 'view-page': ['read'], 'edit-page': ['edit'], 'create-page': ['create'],
                   'edit-page-permissions': ['grant'], 'publish-page': [] },
  }
  ```

- **`permissionDomain` reshaped** to `{ self: [...], descendants: [...] }` with an `implies` per
  entry. Scope is stated once per bucket, not tagged per entry.
- **Five client readers** must move with it: `ui/components/Permissions.jsx`,
  `patterns/page/pages/edit/editPane/permissionsPane.jsx`,
  `patterns/datasets/components/SourceAccessEditor.jsx`,
  `patterns/page/components/sections/sectionMenu.jsx`,
  `patterns/admin/pages/patternEditor/default/permissionsEditor.jsx`.
  ⚠ `SourceAccessEditor.jsx` is in the `permissions_move` stage-1 uncommitted set — **coordinate
  before touching it**.
- The resolver reads `authVocabulary` off the pattern row it **already loads and memoises**
  (`getPatternAuthPermissions`, `patternAuthCache`).

## Registration: `registerPatternTypes` declares it, the pattern row carries it

Owner, 2026-10-28: the vocabulary must be **extendable through `registerPatternTypes`**, and
`legacyVerbs.js` must go.

### The constraint that shapes everything

`registerPatternTypes` is a **client-side module registry** (`patterns/registry.js`, an in-memory
`patternTypes` object populated at import time). `dms-server` does not depend on `packages/dms` and
cannot read it. So the registry is where a type **declares** its vocabulary; the **pattern row** is
how that declaration reaches the server.

```
registerPatternTypes({ page: { … , authVocabulary } })     ← declaration, in code
          │  stamped onto the row when a pattern is created / reconciled
          ▼
pattern row data.authVocabulary                            ← transport, in data
          │  read from the row the resolver already loads and memoises
          ▼
rowAuth resolver                                           ← interpretation, no pattern knowledge
```

### 1. Declare

A new optional key on a registry definition, alongside `siteConfig`, `pageComponents`,
`defaultTheme`:

```js
registerPatternTypes({
  page: {
    siteConfig: [...],
    authVocabulary: {
      self:        { 'edit-pattern': ['edit'], 'edit-pattern-permissions': ['grant'] },
      descendants: { 'view-page': ['read'], 'edit-page': ['edit'],
                     'create-page': ['create'], 'edit-page-permissions': ['grant'],
                     'publish-page': [] },
    },
  },
})
```

`registerPatternTypes` should **validate** it the way it already validates `siteConfig`: every value
an array drawn from the five structural verbs, every key a non-empty string, no key in both buckets
with different meanings. A malformed vocabulary is a deploy-time error, not a silent runtime one.

### 2. Transport

**New patterns** — stamp it at create. `beforeCreate({ falcor, app, instance, row, siblings })`
already exists on the registry's `admin` metadata and already runs at both creation sites
(`patternList.jsx:251`, `editSite.jsx:397`), returning a replacement `row`. Either have the create
path read `getPatternType(type).authVocabulary` directly, or have each type's `beforeCreate` add it —
the former, so a type cannot forget.

**Existing patterns** — a reconcile, because every pattern row in every app predates this and
because a type's vocabulary changes whenever a verb is added in code. Three candidate homes:

| where | cost |
|---|---|
| admin UI on pattern load | a write on every load; needs `grant`; noisy |
| an explicit action in the Pattern Editor | visible and intentional, but manual per pattern |
| **`migrate-row-auth.js --sync-vocabulary`** | bulk, idempotent, reportable — **preferred** |

The migration pass is preferred for the same reason the parentage backfill is: it is one run, it can
report coverage, and it does not put a write in a render path.

### 3. Retire `legacyVerbs.js`

`legacyVerbs.js` is the only file in the server that names a pattern's verbs, which
`src/dms/CLAUDE.md` ("DMS Interprets Data") forbids. It exists because, measured on a migrated
clone, enforcing with no mapping allowed reads on exactly the **28 of 40** sampled rows that carried
*no grants at all* and refused every row where someone had configured access.

It can be deleted when **both** hold:

1. every registered pattern type declares an `authVocabulary`, and
2. every **live** pattern row in every app being enforced carries one.

(2) is a coverage number, and it gates deletion the way parent-resolution coverage gates an
`enforce` flip. `--sync-vocabulary` should report it per app.

**Until then it stays, and the resolver must prefer the row's `authVocabulary` over it** — so a
pattern that has declared its vocabulary is already free of the shim, and the shim only answers for
patterns that have not.

## Three rules (hub)

1. Writing `authVocabulary` requires **`grant` on the pattern row** — else a client declares
   `view-page → ['*']` and escalates.
2. The map applied to an inherited grant is the one belonging to the pattern **in the chain of the
   row being judged**, not the row the grant sits on.
3. An **undeclared verb confers nothing**. Same as a missing map. Fails closed.

## Done when

1. A pattern can add a verb and have the server enforce it with **no server change and no deploy**.
2. Removing `authVocabulary` leaves the row with no structural access rather than an error.
3. `registerPatternTypes` rejects a malformed vocabulary at registration.
4. `--sync-vocabulary` reports 100% coverage for an app, and **`legacyVerbs.js` is deleted**.

## Progress

- **`SourceAccessEditorChain.jsx`** (2026-10-28) — a copy of `SourceAccessEditor.jsx` that accepts
  the new `{ self, descendants }` `permissionDomain` alongside the old flat array, flattening the two
  buckets into one list for `UI.Permissions` and still writing a flat `{groups, users}` grant (flat
  means self + descendants, the common case). Kept as a **separate file** at the owner's direction:
  the original belongs to the in-flight `permissions_move` work, so the two models evolve without
  colliding. Both call sites switched (`dataTypes/default/admin.jsx`,
  `dataTypes/internal/pages/admin.jsx`); the original is untouched; `npm run build` passes.

## Built (2026-10-28)

### One shape, not two

The sketch above had `authVocabulary` as a verb→implies map and `permissionDomain` as a labelled
array. Built as **one** shape, because two declarations of the same thing drift:

```js
{ self:        [ { value: 'edit-pattern', label: 'Edit Pattern', implies: ['read', 'edit'] }, … ],
  descendants: [ { value: 'view-page',    label: 'View Page',    implies: ['read'] }, … ] }
```

The server reads `value` + `implies`; a client reads `value` + `label`. Shape, validator and the
flatten helper: `packages/dms/src/patterns/authVocabulary.js`.

### Scope turned out to be load-bearing, not decoration

A verb declared only under `self` confers **nothing** when it appears inside a `descendants` grant,
and vice versa. Without that, `edit-pattern` on a pattern would leak edit rights to every page under
it — which is the exact bug the scope axis was added to prevent. A **flat** grant (every legacy
grant in production) expands against the union, as flat has always meant both.

### `permissionDomain` was NOT reshaped — deliberately

The task listed reshaping it and moving five client readers. Doing that would have been wrong: a
page pattern has **three** row kinds with vocabularies (pattern, page, section), and the per-format
`permissionDomain` arrays are already at that granularity. Folding them into two buckets would have
offered `View Section` in the *pattern* Access editor. So:

- `authVocabulary` is the pattern-level declaration the **server** reads — deliberately wider than
  any one editor's list, because it must cover every grant written anywhere below the pattern.
- the per-format `permissionDomain` arrays stay as the **UI's** narrower, row-kind-specific lists.
- `tests/authVocabulary.test.js` walks each format tree and asserts **every `permissionDomain` value
  appears in its pattern's vocabulary**, so the two cannot drift into a grant the UI offers and the
  server reads as conferring nothing. That is the guarantee the reshape was meant to provide.

The five client readers were therefore left alone, which also sidesteps the ⚠ collision with the
other author's uncommitted `SourceAccessEditor.jsx`. `permissionOptionsFor`'s switch on pattern type
(`utils/adminPermissions.js`, listed as debt in `src/dms/CLAUDE.md`) is now *replaceable* by a
registry read, but replacing it is its own task — it changes what the Access editor offers.

### Transport, end to end

| | |
|---|---|
| declare | `registerPatternTypes({ page: { …, authVocabulary } })`, validated at registration |
| built-ins | `page` (3 self / 8 descendants), `datasets` (4/12), `auth` (2/7), `admin` (2/4) |
| new rows | stamped from the registry at both creation sites (`patternList.jsx`, `editSite.jsx`) — read from `getPatternType()` rather than left to each type's `beforeCreate`, so a type cannot forget |
| existing rows | `migrate-row-auth.js --sync-vocabulary <manifest.json>` |
| projection | `data->'authVocabulary' AS auth_vocabulary` (`json_extract` on sqlite) — a few entries beside the ~10KB of `data` the projection exists to avoid |
| interpret | `dms-server/src/routes/dms/authVocabulary.js` — knows no pattern, verb or type name |

**Where the migration gets the vocabulary.** The task did not say, and it is the one real gap in the
design: `migrate-row-auth.js` lives in `dms-server` and cannot read the client registry any more
than the server can. Solved with a manifest file, which keeps each half on its own side of the
dependency line:

```
packages/dms/scripts/emit-auth-vocabulary.mjs  >  vocab.json
migrate-row-auth.js --db … --app … --sync-vocabulary vocab.json [--apply]
```

A host app's own types go in with `--extra <file>`. The emitter loads each vocabulary file as a
`data:` URL because `@availabs/dms` is not `type: module`; that works only while a vocabulary module
is pure data, which `tests/authVocabulary.test.js` asserts.

Verified end to end on a disposable sqlite app (since removed): dry run → apply → **re-run reports
`already current: 2, to write: 0`**, and it names the type it could not cover
(`mapeditor ×1 ← declare authVocabulary on this type, or pass --extra`).

### Bug found while verifying: the sqlite capability probe never worked

`rowAuthCaps` issued a bare `PRAGMA table_info(...)`. The sqlite adapter dispatches on the
statement's first word — only `SELECT` and `WITH` go through `.all()` — so a `PRAGMA` ran via
`.run()` and came back **empty**, which the probe read as "no columns". **Every sqlite app was
reported unmigrated, forever**: the projection never engaged, so the heap protection it exists for
never applied, and a stamped vocabulary was only ever found through the `data` fallback. Fixed to
`SELECT name FROM pragma_table_info($1)`, matching how `runMigrationFile` already queries it.

The existing test could not have caught it — it mocked `sql.startsWith('PRAGMA')` and so asserted
the mock. Replaced with a **real sqlite round-trip** (create → probe → ALTER → probe → project),
plus a dialect pin on the mock.

### Rule 1 is not implemented here

"Writing `authVocabulary` requires `grant` on the pattern row" is a **write-path** rule, and the dms
write path still runs the other author's `judge()`. It belongs to
[row-auth-dms-writes.md](./row-auth-dms-writes.md) (task 5) with the rest of the write gate; adding
a second, separate check here would be the thing task 7 exists to undo. Until then the exposure is a
hand-crafted Falcor write — the general unguarded-write problem, not a new one.

### Tests

- `packages/dms/tests/authVocabulary.test.js` — **19**: validator rejection cases, the built-ins,
  purity of the vocabulary modules, and the `permissionDomain` ⊆ `authVocabulary` guarantee.
- `packages/dms-server/tests/test-auth-vocabulary.js` — **29**: `vocabularyOf` across all four
  encodings, `impliesMaps`, scope enforcement, the three hub rules end to end through `resolve`,
  and the real sqlite probe round-trip. Added to `npm test` and `test:row-auth`.
- Unchanged elsewhere: full `npm test` green, `test:row-auth-reads` 10/10, the other author's
  `test-data-auth` still 49/49, `npm run build` passes.

### Host-app types declared (2026-10-28)

`src/patterns/{mapeditor,qa,chat}/*.authVocabulary.js`, wired into each type's registry definition.
Verbs chosen from what real grants and routes actually use, not invented:

| type | evidence |
|---|---|
| `mapeditor` | no grants anywhere; governs 1,031 `{instance}\|symbology` rows, which have no vocabulary of their own |
| `qa` | every live grant is `*` (never expanded, so nothing changes); routes check `reqPermissions: ["view-page"]` |
| `chat` | the only verb any live grant uses is `view-page`; governs `\|channel`, `\|member` and per-channel `:data` rows |

`src/patterns/authVocabulary.test.js` (9 cases) asserts all three validate, confer only structural
verbs, stay import-free so the manifest emitter can load them, and — the one that matters — that
**every registered type declares one**, which is condition 1 for deleting the shim.

**Manifest now covers all seven types:**

```
node packages/dms/scripts/emit-auth-vocabulary.mjs \
  --extra ../../../patterns/mapeditor/mapeditor.authVocabulary.js \
  --extra ../../../patterns/qa/qa.authVocabulary.js \
  --extra ../../../patterns/chat/chat.authVocabulary.js
→ page, datasets, auth, admin, mapeditor, qa, chat
```

**Dry run against `mitigat-ny-prod`: 81 pattern rows, `type not in the manifest: 0`.** Every
pattern row in the app is now coverable. Not applied — that is a production write and wants its own
go-ahead.

The dead `forms` type was removed from the app first (row 736402 `prod|test_meta_forms:pattern`
deleted with its entry on site row 566430; dmsEnv 1676363 and its 64 sources deliberately kept, as
the live Datasets and QA patterns share that env). Saved at
`scratchpad/mitigat-ny-prod/forms-removal/`.

### The vocabulary moved into the `auth` column (owner, 2026-10-28)

It was first built on `data.authVocabulary` with a `data->'authVocabulary' AS auth_vocabulary`
extract in the projection. Moved, at the owner's call, to **`auth.vocabulary`** — which turns out to
be the shape the codebase already had for grants, not a new one:

```
client create  →  data.authVocabulary     the only thing a client can write
migration      →  auth.vocabulary          what the resolver prefers
resolver       →  auth.vocabulary ?? data.authVocabulary
```

Exactly how `data.authPermissions` → the `auth` column → `authOf` already works. The separate
projection column is gone: `auth` is already selected, so the vocabulary rides along free.

Two details that decide the shape:

- **Read from the RAW `auth` object, before subdomain resolution.** `resolveAuthPermissions` treats
  `{'*': …}` as the subdomain-keyed format and returns the picked branch, so a sibling key would be
  dropped. `vocabularyOf` takes the row, not the resolved object, so it sits outside the pick.
- **`rawAuthOf` strips `vocabulary`** before resolving, or a chain could be judged against a
  principal literally named "vocabulary". Checked: `isUnstated` inspects only `groups`, `users` and
  `otherwise`, so a pattern that declares a vocabulary but grants nothing stays **unstated** and
  does not start clamping its descendants.

### Two bugs the move surfaced, both found by running it twice

Neither was visible on a single run — both made the pass silently non-idempotent.

1. **Pass 1 wiped the vocabulary.** `UPDATE SET auth = data->'authPermissions'` replaces the whole
   column, so a backfill run after a vocabulary sync destroyed it. Now carried across with
   `jsonb_set(data->'authPermissions', '{vocabulary}', auth->'vocabulary')` when one is present, so
   the passes are order-independent.
2. **`jsonb` does not preserve object key order.** It sorts by key length then bytewise, so a stored
   `{label, value, implies}` never string-matched the manifest's `{value, label, implies}` and every
   run rewrote every row while reporting `already current: 0`. Comparison is now canonical
   (recursively key-sorted). Verified: two consecutive `--apply` runs both report
   **`already current: 81, to write: 0`**.

### Applied to the clone — and only the clone (2026-10-28)

Owner's instruction: **do not migrate production.** State now:

| | rows | `auth` | `parent_id` | `auth.vocabulary` |
|---|---|---|---|---|
| `dms_mitigat_ny_prod` | 321,091 | no | no | 0 |
| `dms_rowauth_test` | 33,895 | yes | yes | **81** |

**`vocabulary coverage 81/81 (100.0%)`** on the clone — the first app to reach it. The `forms` row
was deleted there too, so the clone matches the production decision.

Production remains unmigrated by choice. Its dry run shows 81 pattern rows, 0 unknown types, so it
is ready whenever that call is made.

### What still gates deleting `legacyVerbs.js`

Both conditions from "Retire `legacyVerbs.js`" now have an answer, and one is not met:

1. every registered pattern type declares — **MET** (2026-10-28), and guarded by a test.
2. every live pattern row in every enforced app carries one — **MET on `rowauth-test` (81/81)**.
   `mitigat-ny-prod` is deliberately unmigrated; its dry run shows 81/81 coverable, 0 unknown types.
   Other hosted apps are unmeasured. The shim stays until an app that is actually ENFORCED reports
   100% — today that is none.

The resolver already **prefers** a row's vocabulary over the shim, so a pattern that has declared is
free of it today. The shim only answers for patterns that have not.
