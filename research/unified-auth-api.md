# A unified auth API: verbs in the rows, one merge function

**Status:** superseded on 2026-11-04 by the build in
[auth-layer-simplification.md](../planning/tasks/current/auth-layer-simplification.md) — the judge
stayed kind auth's interpreter and the "one walk" became its owner lookup (`routes/auth/owners.js`);
the structural-verb merge described below was not built · **Written by:** amuro@albany.edu (with Claude) · **Date:** 2026-11-03
**Context:** [row-auth-uda-unify-api.md](../planning/tasks/current/row-auth-uda-unify-api.md) (Slices A–P),
[server-side-auth-general.md](../planning/tasks/current/server-side-auth-general.md) (hub)

---

## The ask

> *"a unified auth api where the verbs always live in the rows and dms, uda, sync and auth could use
> a simple merge function over the data to judge any verb."*

Most of the machinery for this already exists. What is missing is not a judge — it is **three kinds
of knowledge that still live in code instead of in rows**, and **one surface that asks by id rather
than by row**. This proposal names those four things, the data they become, and the order to do
them in.

## Where we actually are

| | |
|---|---|
| ✅ one chain walk | `rowAuth/rowAuth.js` `createResolver` — `parent_id`, type path as fallback |
| ✅ one merge | `rowAuth/mergeAuth.js` `mergeAuthChain` → `{groups, users, otherwise}` |
| ✅ one judgment | `can(merged, user, verb)` — five structural verbs, `*`, the clamp, rule 5 |
| ✅ vocabulary as data | `permissionDomain` → `authVocabulary` → stamped on pattern + `:dmsenv` rows |
| ✅ two flags, not eight | `DMS_AUTH_IMPL`, `DMS_AUTH_MODE` (`routes/auth/settings.js`) |
| ✅ sources resolve like any row | internal and external both, via `createResolver` (Slices M, O) |
| ❌ **field→verb rules** | in kind auth's `authRules.js` as `byKey` / `when` / `onlyKeys`; row auth has only `GRANT_KEYS` |
| ❌ **auth-row levels** | `auth_level` integers are a second authority beside grants |
| ❌ **UDA asks by id** | `(env, sourceId)` before fetching, so it cannot hand over a row |
| ❌ **site grants on a sibling** | kind auth reads them off the admin pattern row, which is not an ancestor |

The judge is done. The remaining work is **moving knowledge into rows** and **changing how one
surface asks**.

---

## 1. Permission domains

### The shape, unchanged

A format declares what its rows' verbs mean. One entry, two readers — the client renders `label`,
the server reads `implies`:

```js
permissionDomain: {
  self:        [ { value, label, implies: [structural…] }, … ],
  descendants: [ { value, label, implies: [structural…] }, … ],
}
```

`self` governs the row itself; `descendants` governs everything beneath it. A verb in neither bucket
does not exist. A flat grant (no scope keys) expands against the union, because flat has always
meant both.

The five structural verbs are the whole server vocabulary: **`read` `create` `edit` `delete`
`grant`**. Everything else is a name a pattern invented, and a name confers only what its format
says it confers.

### The one addition: a verb may govern named FIELDS

This is the missing piece, and it is what kind auth has that row auth does not.

```js
{ value: 'publish-page',          implies: ['read', 'edit'], fields: ['sections', 'section_groups', 'dataSources'] },
{ value: 'edit-page-permissions', implies: ['read', 'edit', 'grant'], fields: ['authPermissions'] },
{ value: 'edit-page-params',      implies: ['read', 'edit'], fields: ['filters'] },
{ value: 'edit-page',             implies: ['read', 'edit', 'delete'] },   // the default for any other field
```

Read as: *an edit that touches `sections` requires `publish-page`; an edit that touches anything
unclaimed requires the kind's default edit verb.*

This single key replaces, as data, everything `authRules.js` expresses in code:

| `authRules.js` today | becomes |
|---|---|
| `byKey: { authPermissions: ['edit-page-permissions'] }` | `fields: ['authPermissions']` on that verb |
| `when: [{ keyIn: ['sections', …], perms: ['publish-page'] }]` | `fields: [...]` on `publish-page` |
| `onlyKeys: [{ keys: ['views'], perms: [...] }]` | `fields: ['views'], onlyWhenAlone: true` |
| `noChange: [...]` | derived: the union of every verb that governs any field |
| `GRANT_KEYS` hardcoded in `rowAuthGate.js` | `fields: ['authPermissions','auth','auth_permissions']` on the grant verb |

**One predicate survives**, and it is worth stating rather than hiding: `published: 'draft'` is not
a publish. That is a rule about a VALUE, not a field name.

```js
{ value: 'publish-page', implies: ['read','edit'],
  fields: ['sections', 'section_groups', 'dataSources'],
  when:   [{ field: 'published', notValue: 'draft' }] }
```

Everything else is a list of names. If a second predicate form is ever needed, that is the signal
that something belongs in a pattern's own code and not in its format.

### Who declares what

| row kind | declares | lives on |
|---|---|---|
| site | site-wide verbs (`create-pattern`, `manage-themes`, `manage-tenants`) | the `:site` row |
| pattern | its own `self` verbs + its children's `descendants` verbs | the `:pattern` row |
| dmsEnv | the source/view vocabulary, internal and external alike | the `:dmsenv` row |
| auth pattern | `auth-users`, `auth-groups`, `view-as` | the auth `:pattern` row |

**Resolution is "nearest declaring ancestor"** (`mapsForChain`), already implemented. A row with no
declaration anywhere in its chain confers nothing structural, and its verbs are matched by name.

---

## 2. Data layout

### Every row, one shape

```
data_items
  id             bigint
  app, type      the namespace and the kind/parent path
  parent_id      bigint   → the row above; the walk follows this
  auth           jsonb    → ALL of it, below
  data           jsonb    → the row's content. NOT auth.
```

```jsonc
auth: {
  // GRANTS — what principals may do
  "self":        { "groups": { "Editors": ["edit-page"] }, "users": { "7": ["*"] } },
  "descendants": { "groups": { "public": ["view-page"] } },
  // or flat, meaning both:
  "groups": { … }, "users": { … }, "otherwise": [ … ],

  // DECLARATIONS — what verbs mean here, and what owns what
  "vocabulary": { "self": [ … ], "descendants": [ … ], "publicRead": true },
  "childRefs":  { "page": { "sections": "component" } },

  // NARROWING — a row saying "my own grantees only"
  "view": false
}
```

Three rules that already hold and should be stated as invariants:

1. **The `auth` column is the system of record.** `data.authPermissions` is a read fallback for
   unmigrated rows and nothing writes it.
2. **A column naming no principal is an ABSENCE, not a statement.** A column holding only
   `vocabulary` falls through; an explicit `{groups:{},users:{}}` is a decision and does not.
3. **`*` is expanded at resolve time, never on save** — that is how the clamp narrows a child's
   `['*']` under a parent that allowed only `['read']`.

### External sources

```
data_manager.sources
  source_id, auth_permissions jsonb         same grant shape
```

They have no `parent_id`, because it would point into another database. The loader supplies it: the
pgEnv's `:dmsenv` row is the parent, found by name (`rowAuth/sourceAncestry.js`). **From the
resolver's point of view there is no difference** — this landed in Slice O.

### What goes away

- **`auth_level` integers.** Today `canOrLevel(user, perm, minLevel, scope, authLevel)` lets a
  LEVEL pass what grants would refuse — a second authority with its own ladder. Migration: for each
  app, read the levels, write the equivalent grants onto the auth pattern row, then delete
  `levelCounts` / `canOrLevel`. Measurable the same way the grant sweep was: nobody loses a verdict.
- **`READ_PERMISSIONS`.** A hand-maintained list of "which verbs include reading", which the file
  itself documents as wrong (`download-source` confers no row access yet appears in it). Replaced
  by asking the structural `read`.
- **`patternAP` / pattern lending.** Already gone (Slice K).

---

## 3. The auth API

**Five exports. Everything else is a route's business.**

```js
// 1. THE WALK — ancestry, cached, breadth-first. One batched query per depth.
resolve(rows, { app, subdomain, load }) → Map(id → merged)

// 2. THE MERGE FUNCTION'S JUDGMENT — no I/O, no mode, no logging. Pure.
can(merged, user, verb) → boolean

// 3. THE ONE A ROUTE CALLS — resolve + can + mode + the would-deny line.
authorize({ row, verb, fields, user, app, subdomain, load }) → { allow, reason }

// 4. WHAT AN EDIT ACTUALLY CHANGES — so `fields` above means something.
planEdit(row, patch, { replace }) → { keys, write }

// 5. THE SENTINEL — an edit that changes nothing is not an update.
NO_CHANGE
```

### How `authorize` composes

```
authorize({ row, verb: 'edit', fields: planEdit(row, patch).keys, user, app })
   │
   ├── resolve([row])                    → the chain, merged
   ├── verbsFor(fields, maps)            → which verbs those fields require, per the vocabulary
   ├── can(merged, user, v) for each     → the judgment
   └── mode                              → `enforce` refuses; `log` allows and writes the line
```

`fields` is optional. Omit it and the question is the plain one: *may this user do this verb to this
row?* Supply it and the vocabulary decides which verbs the edit actually needs — which is the
field-level rule, read from data.

### What the API deliberately does NOT export

| not exported | why |
|---|---|
| `requireX` / `assertX` guards | answering an HTTP or Falcor request is transport, not auth |
| `trimGrants` / `dropSecrets` | reply shaping — moved to `routes/uda/sourceRedaction.js` |
| `requestUserId` and friends | who is asking is a different question (`routes/auth/requestUser.js`) |
| per-surface mode readers | one `authMode()` in `routes/auth/settings.js` |
| anything named `source*` | a source is a row |

### Where the two providers go

Kind auth stays — it is not being deleted. But under this design the difference collapses to **what
a caller asks for**, not to a second machine:

- expansion is ADDITIVE, so a merged chain holds both `view-source` and the `read` it implies;
- `can(merged, user, 'read')` is row auth's question; `can(merged, user, 'view-source')` is kind
  auth's;
- both read the same rows through the same walk and the same merge.

`DMS_AUTH_IMPL` then selects a default asking style rather than a parallel implementation, and the
differentials keep measuring the real remaining gaps: strict defaults, and site grants that live on
a sibling row.

---

## 4. The routes, and how each consumes it

Every surface converges on the same two calls: `authorize(...)` for a decision, `planEdit(...)` when
it is an edit.

| surface | route | today | under this design |
|---|---|---|---|
| **DMS** | `dms.data.get` | `readBlocked({row, kind, …})` | `authorize({ row, verb: 'read', user, app })` |
| | `dms.data[key].length` | `listingBlocked(controller, …)` | `authorize({ row: patternRow, verb: 'read' })` |
| | `dms.data.create` | `assertDataWrite(…, 'create', …)` | `authorize({ row: parentRow, verb: 'create' })` |
| | `dms.data.edit` | `assertDataWrite(…, 'edit', …)` | `authorize({ row, verb: 'edit', fields: planEdit(row, patch).keys })` |
| | `dms.data.delete` | `assertDataWrite(…, 'delete', …)` | `authorize({ row, verb: 'delete' })` |
| **UDA** | `uda[env].sources.byId` | `allowSourceRead({ env, sourceId, … })` | `authorize({ row: await sourceRow(env, id), verb: 'read' })` |
| | catalog listing | `filterReadableSources({ sourceIds })` | `resolve(rows)` once, then `can(…, 'read')` per row |
| | `uda.sources.update` | `requireSourcePermission(req, res, id, ['update-source'])` | `authorize({ row, verb: 'edit', fields })` + a transport guard |
| | `uda.data.create/edit` | `authorizeRowWrite(…)` | `authorize({ row: sourceRow, verb: 'edit', fields: ['data'] })` |
| **sync** | push `I` / `U` / `D` | `assertDataWrite(…)` | `authorize({ row, verb, fields })` — unchanged in shape |
| | `/sync/delta` | — | `resolve(rows)` once, filter by `can(…, 'read')` |
| **auth** | `auth.users.*` | `canOrLevel(user, 'auth-users', 3, scope, level)` | `authorize({ row: authPatternRow, verb: 'auth-users' })` |
| | `auth.groups.*` | `canOrLevel(user, 'auth-groups', …)` | `authorize({ row: authPatternRow, verb: 'auth-groups' })` |
| **DAMA** | `/dama-admin/:pgEnv/publish` | `authorizePublish(req, res, sourceId)` | `authorize({ row, verb: 'create' \| 'edit' })` |
| | downloads `sign` | `isUserAuthedForSource(…, ['download-source'])` | `authorize({ row, verb: 'download-source' })` — a capability, no row access |

**The transports stay in the routes.** An Express route answers 401/403; a Falcor route throws; a
batch read answers `null` per path. None of that is auth's business — today four spellings of one
question exist (`requireSourcePermission`, `requirePatternPermission`, `assertSourcePermission`,
`assertPatternPermission`) purely because the subject differs. Give them rows and they are one
helper per transport.

---

## 5. The shortest path

Four phases. **Each is independently measurable, and none requires the next.**

### Phase 1 — field rules into the vocabulary *(unblocks everything else)*

1. Add `fields` (and the one `when` predicate) to `permissionDomain` entries in the formats;
   `deriveAuthVocabulary` carries them through; `--sync-vocabulary` stamps them.
2. `verbsFor(fields, maps)` answers "which verbs does this edit need" from the declaration.
3. `authorize` takes `fields`.
4. Delete `GRANT_KEYS` and `authRules.js`'s `byKey` / `when` / `onlyKeys`.

**Proof:** `test-data-auth.js` is kind auth's contract suite and already pins six attribute clauses
(Slice H). It must stay green with the rules read from data instead of code, and the write
differential's `field` reason should disappear — that is the entry recording row auth's inability to
express exactly this.

### Phase 2 — UDA asks by row

1. One loader: `sourceRow(env, sourceId)` → a row, internal or external (the adapter exists).
2. Route call sites fetch, then authorize. The catalog listing resolves once and judges many — which
   is what `resolve` is built for.
3. `sourceReads.js` collapses into the snapshot cache; `sourceGuards.js` collapses to one transport
   helper each for Express and Falcor.

**Cost to measure first:** five `uda.route.js` call sites currently gate BEFORE fetching
(`await canRead(...) ? await fetch() : null`). Fetching first changes the query pattern on every
read path. Measure the catalog listing — the warm snapshot answers a 71-source listing in ~1 ms
today.

**Proof:** the verdict dump used in Slices K and M — every `(source × principal × verb)` before and
after, expecting zero lost.

### Phase 3 — auth-row levels become grants

1. Per app, read `auth_level` and write the equivalent grants onto the auth pattern row.
2. Delete `levelCounts` / `canOrLevel`; `src/auth/utils/permissions.js` becomes a caller of
   `authorize`.

**Proof:** a read-only pass in the shape of `sweep-source-grants.js --verify` — for every user and
every auth verb, the level answer and the grant answer agree before anything is deleted.

### Phase 4 — site grants onto the site row

The last pinned divergence that is a DATA problem rather than a design one: kind auth reads
site-wide grants off the admin pattern row, which is a sibling of a tenant or dmsenv row, not an
ancestor. Row auth walks parentage and refuses what kind auth allows — fails closed, five pinned
cases (`sibling-grants`).

Write those grants onto the `:site` row, where parentage can reach them, and the divergence goes.

### What this does NOT require

- deleting kind auth (it stays — it becomes an asking style, not a machine);
- a new column, a new table, or a cross-database reference;
- a new flag. Two is the budget, and this spends none of it.

---

## Where it ends up

```
routes/auth/
    settings.js       DMS_AUTH_IMPL, DMS_AUTH_MODE, NO_CHANGE
    index.js          resolve · can · authorize · planEdit · NO_CHANGE
    resolve.js        the walk + the per-env cache
    merge.js          mergeAuthChain · can · isUnstated
    vocabulary.js     permissionDomain → implies/fields maps
    requestUser.js    who is asking (not auth)
```

Every route imports `routes/auth` and nothing else. Every row — page, pattern, site, theme, tenant,
dmsEnv, source (internal or external), view, data, component, auth user, auth group — is judged by
the same walk, the same merge, and the same `can`.

**One question, asked everywhere:** *given a row and the grants it carries, may this user do this
verb to it?*
