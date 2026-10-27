# General server-side auth for DMS records: an `auth` column and one resolver

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [tes_chat_pattern](../../../../../planning/initiatives/tes_chat_pattern.md) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

**Supersedes the per-kind plan** in [`server-side-auth.md`](../completed/server-side-auth.md)'s
"Phase 3 — Sources and views", which was deferred in 2026-05 and never started. Phases 1 and 2 of
that task are **built and in production**; this doc does not re-do them, it generalises what they
established so the next row kind costs nothing.

## Why now

Chat is the third kind of row to want this and the first that cannot ship without it: a private
channel would be private in the UI and open to anyone who asked `/graph` for its type
([chat-pattern-implementation.md §7](../../../../../planning/tessera/tasks/current/chat-pattern-implementation.md)).
Sources and views have wanted it since 2026-05. Rather than add a third and fourth special case,
make the mechanism general.

## What exists today (read before proposing anything)

| Piece | Where | State |
|---|---|---|
| `isUserAuthed`, `resolveAuthPermissions` (subdomain-aware) | `routes/dms/auth.js` | built |
| Pattern + page gates on `byId` | `dms.route.js` `dataByIdResponse` | built |
| Pattern-level gate on page listing routes | `dms.route.js` length / byIndex / options.* | built |
| Per-page row filtering in `options.byIndex` | fetches `data` per row to read `authPermissions` | built |
| `no-access` sentinel + client redirect | `dms.route.js`, `page/pages/view.jsx` | built |
| CSRF `X-Requested-With` guard | `src/index.js` | **commented out** |
| Sources / views | — | **not built** |
| Split-table rows (`:data` — dataset rows, chat messages) | — | **no gate at all** |
| `/sync/bootstrap`, `/sync/delta` | `routes/sync/sync.js` | **no per-row auth** (`DMS_SYNC_AUTH` gates the endpoint, not the rows) |
| WebSocket broadcast | `routes/sync/ws.js` `notifyChange` | **no auth** — every subscriber to an app gets every change on it |

## The four things that stop the current model generalising

1. **Auth lives inside `data`.** Checking a row means reading its `data` — which is why per-page
   filtering had to fetch `data` for every row in a listing. It cannot be indexed, and an editor
   that replaces `data` wholesale can drop it.
2. **Every kind needs its own gate and its own ancestor SQL.** Pages look up their pattern
   (`type LIKE '%|' || parent || ':pattern'`); sources would look up a dmsEnv; views a source; chat
   a channel. Each one is a new branch in `dms.route.js` and a new query in the controller. That is
   precisely why Phase 3 never happened.
3. **`length` lies.** Unauthorised listings return 0 wholesale rather than the authorised count, so
   a filtered list and its count disagree.
4. **The sync paths bypass all of it.** Bootstrap, delta and the WebSocket were built for a world
   where reading the app meant you could read the app.

## Proposal

### 1. An `auth` column on every data table

```sql
ALTER TABLE dms.data_items ADD COLUMN IF NOT EXISTS auth jsonb;
```

- **Shape unchanged**: `{ groups: { admin: ['*'], editors: ['view-page'] }, users: { 42: ['*'] } }`,
  and the subdomain-wrapped `{ "*": { … } }` form. `resolveAuthPermissions` already reads both, so
  no rewrite of the semantics — this moves *where it lives*, not *what it says*.
- **`NULL` means inherit** from the row's parent in the type path (§2). A row only carries `auth`
  when it says something different from its parent — which is how `authPermissions` is used today.
- **Why a column rather than a key in `data`:** it can be selected without fetching `data` (the
  listing-route problem), it can be indexed, it survives a wholesale `data` replacement, and
  **split tables get it for free** — `buildCreateTableSQL` mirrors `data_items` exactly, so dataset
  rows and chat messages gain the same gate with no extra work.
- **Migration**: `sql/dms/migrate_dms_core.sql` (idempotent, runs on every init — the established
  home for exactly this), plus a backfill `UPDATE … SET auth = data->'authPermissions' WHERE auth IS
  NULL AND data ? 'authPermissions'`. Read-side keeps the `data.authPermissions` fallback for one
  release so a stale server and a migrated database agree.

### 2. One resolver, driven by the type path

The type string is already the hierarchy — `{parent}|{instance}:{kind}`, with `parseRowType` in
`db/type-utils.js` to split it. So ancestry needs no per-kind knowledge:

```
chat_riverbend|4210:data   →  chat_riverbend:source  →  riverbend|chat:pattern  →  riverbend:site
songs|1066384:data         →  songs:source          →  …
flood_plan|page            →  riverbend|flood_plan:pattern                      →  riverbend:site
```

`effectiveAuth(app, type, id)`:
1. the row's own `auth`, if not null;
2. otherwise walk up the type path, taking the first ancestor with a non-null `auth`;
3. merge child over parent **per key**, which is what the page/pattern merge does today,
   generalised;
4. memoise per `(app, type, subdomain)` for the life of a request — a listing of 500 rows resolves
   its ancestors once, not 500 times.

**This is the whole point of the change**: one function replaces the per-kind branches, and a new
row kind (chat's channels, whatever comes next) inherits a working gate the day it exists.

### 3. One choke point, and `length` that tells the truth

A single `authPredicate({ user, subdomain })` used by **every** read path:

- `dms.route.js` — `byId`, `length`, `byIndex`, `options.length`, `opts.byIndex`
- `routes/uda/*` — the dataset read paths (this is Phase 3's original scope, now free)
- `routes/sync/sync.js` — `/sync/bootstrap` and `/sync/delta`
- `routes/sync/ws.js` — `notifyChange` must filter per subscriber, not per app

Where the ancestor walk resolves to a small set of types, the predicate belongs **in the WHERE
clause**, so `length` returns the authorised count and listings and counts stop disagreeing. Where it
cannot, post-filter — but then `length` must be computed the same way.

### 4. Writes, not just reads

Today CALL routes skip auth entirely (`user === undefined` → skip, by design, because they return
freshly written rows): **any caller who can reach `/graph` can write any row**. The same resolver
gates create / edit / delete with the `edit` verb, which a blank row denies. Behind a flag,
default off, because turning it on without auditing a site's grants takes editing away from
everyone on it.

## Decided (owner, 2026-10-26)

### Two base permissions on the server: `read` and `edit`

The server's vocabulary is **two verbs**, not the client's open-ended set. Everything the client
says maps onto them:

| Client grant | Server verb |
|---|---|
| `view-page` | `read` |
| `edit-pattern`, `edit-pattern-permissions`, `delete-pattern` | `edit` |
| `*` | both |

Why this matters more than it looks: today a gate has to know which verb a kind cares about
(`reqPermissions: ['view-page']` is hardcoded per route), which is another per-kind rule. With two
verbs, a read path asks for `read` and a write path asks for `edit`, whatever the row is. The
mapping lives in one place and the existing stored grants keep working untouched.

### A blank row: **allow read, deny edit**

A row with no `auth` and no ancestor carrying one is **readable by anyone and editable by no one**.

- Reads keep working exactly as they do today, so nothing breaks on the day the column lands.
- Writes become deny-by-default — the safe direction, and the one that closes the hole where CALL
  routes skip auth entirely today.
- **Consequence to plan for:** a site whose rows carry no grants at all would lose the ability to
  edit the moment the write gate is enforced. That is precisely why the write gate ships **behind a
  flag, default off** (below), and why a site's grants get audited before it is turned on. With the
  flag off, writes behave as they do now.

### First cut: reads

Phases A–C. The column, the resolver, and every read path — `dms.route.js`, the `uda` routes,
`/sync/bootstrap`, `/sync/delta` and the WebSocket. That is what chat, datasets and sources are
actually blocked on. Writes follow in Phase D behind the flag.

## Parent/child inheritance — what the data can support today (2026-10-26)

The owner's goal: a group that can edit a pattern can edit its pages; whoever can edit a page can
edit its sections. Inheritance down the row tree, as a DX property. So: **is there a row tree?**

### Parentage is stored four different ways today

Read off real rows on `availabs` (site `dev2`), not from the docs:

| Edge | How it is stored | Queryable? |
|---|---|---|
| any row → its **pattern / source instance** | the `type` path: `pages\|page`, `pages\|component`, `songs\|1066384:data` | **yes** — it is in the type column, no I/O |
| **page → parent page** | `data.parent` = `"282"` — a bare id, as a string | no — inside `data` |
| **section → page** | `data.parent` = `"{\"id\":\"5\",\"ref\":\"availabs+pages\|page\"}"` — a **stringified JSON object** | no — inside `data`, and a different shape from the line above |
| **site → patterns**, **dmsEnv → sources**, **source → views** | a ref array on the **parent** (`data.patterns`, `data.sources`, `data.views`) | no — and it points the wrong way |
| dataset row / chat message → **view** | the view's **id**, inside the type string (`{source}\|{viewId}:data`) | yes, as text |

Three of those live in `data` (so a check means fetching `data`), two use different encodings for the
same idea, and one is an upside-down edge the server already has to hand-maintain on delete
(`removeIdFromRefArrays` in `dms.controller.js`).

### What that means for the inheritance we want

- **Pattern → page and pattern → section works today, from the type alone.** A page's type carries
  its pattern instance; so does a section's. The owner's own example — *a group that can edit a
  pattern can edit every page in it* — needs **no migration at all**: it falls out of the type-path
  resolver in §2.
- **Page → section and page → sub-page do not.** Every section of a pattern shares one type
  (`pages|component`), so the type cannot say *which page*. That edge exists only in `data.parent`,
  in two shapes, both strings, unindexed. Finer-grained inheritance — "whoever can edit this page
  can edit its sections" — is not reachable without a real edge.
- **Site → pattern** requires reading the site's array, i.e. asking the parent about its children,
  which is the wrong direction for a walk upward.

### Proposal: add `parent_id` next to `auth`, in the same migration

```sql
ALTER TABLE dms.data_items ADD COLUMN IF NOT EXISTS parent_id bigint;
CREATE INDEX IF NOT EXISTS ix_data_items_parent ON dms.data_items (app, parent_id);
```

**`parent_id` alone is sufficient — no `parent_type` needed.** The id sequence is **per app**
(`getSequenceName`), so an id is unique across that app's main table *and* its split tables. A single
bigint names exactly one row.

- **Backfill** from the four encodings above: parse `data.parent` (both shapes), and invert the three
  ref arrays. The information already exists — nothing has to be invented, it just has to be moved
  somewhere a query can reach.
- **Keep the type-path walk as the fallback.** A row with `parent_id IS NULL` resolves by type, as
  §2 describes. The two compose: the column gives row-level precision where it has been backfilled,
  the type path covers everything else. **Inheritance therefore works everywhere from day one, and
  the backfill can be incremental rather than big-bang** — which also means the millions of dataset
  rows can be left alone, since their type already carries the view id.
- **The server sets it on write**, in the controller, derived from `data.parent` — so no client has
  to change and the two cannot drift apart by anyone forgetting.
- Ancestry becomes one recursive CTE with a depth cap (the tree is ~4 deep), not a per-kind query.

### The alternative considered: encode the page id in the section's type

Owner's suggestion (2026-10-26), and a good one on its face: rather than a column, make the edge
queryable **in the type**, the way dataset rows already do it — `{source}|{viewId}:data` puts a row
**id** in the instance slot. Sections would become `{pattern}|{pageId}:component`, and
page → section inheritance would need no new column at all.

**Why it is more expensive than it looks — and it is not the type grammar's fault.** The dms-format
machinery derives a child type **once per pattern, before any page exists**:

```js
// dms-manager/_utils.jsx — initializePatternFormat(baseFormat, app, instanceName)
format.type = `${instanceName}|${format.type}`      // → 'pages|component'
format.attributes = updateAttributes(format.attributes, app, instanceName)
```

and `page.format.js` declares the children statically:

```js
{ key: 'sections',       type: 'dms-format', isArray: true, format: 'dms-site+component' },
{ key: 'draft_sections', type: 'dms-format', isArray: true, format: 'dms-site+component' },
```

So "the type of a page's sections" is computed at route-build time, per pattern. Making it per-page
means the format can no longer be initialised per pattern: the page id has to be threaded into
format construction and through every `dms-format` consumer — the ref resolver, the section editor,
the CLI's `section create`, and the stored `{id, ref}` entries in every existing page's `sections`
and `draft_sections` arrays, which carry the old type.

That is why `:data` gets away with it: **dataset rows are not dms-format children**. Nothing declares
them in a format; they are addressed by type directly. Sections are declared, and that declaration
is the constraint.

**So: `parent_id` for now.** It needs no type change, so nothing that constructs or matches
`{instance}|component` moves; the backfill reads `data.parent` once and the server derives it on
write thereafter; and it covers kinds whose type cannot carry a parent. It also does not foreclose
the type idea — if sections are ever re-typed, `parent_id` stays correct and simply becomes
redundant for that kind.

### Pros

- **One uniform ancestry query** for auth, and no per-kind rules ever again — the thing that stopped
  Phase 3 in 2026-05.
- **The DX the owner asked for**, including the row-level half that is impossible today.
- **Indexed children**: "the sections of this page" becomes `WHERE parent_id = $1` instead of a
  jsonb scan or a client-side filter over every section in the pattern.
- **It fixes more than auth.** Orphan detection (the pages editor already ships an "Orphans" lens),
  cascade delete, moving a page subtree, counting children — all of them currently work around the
  missing edge.
- **The migration is already happening.** Adding one more column to the same idempotent migration
  costs almost nothing extra; doing it later costs a second migration and a second backfill.

### Cons and risks, honestly

- **Two sources of truth during the transition** (`data.parent` and `parent_id`). Mitigated by
  deriving the column server-side on every write rather than asking clients to maintain it — but
  until every writer goes through that path (raw SQL scripts do not), drift is possible. A periodic
  reconcile query should ship with it.
- **Inverting the ref arrays is the fiddly part** of the backfill: a child listed by two parents, or
  by none, has to be handled explicitly rather than assumed away.
- **Split tables are the bulk of the rows** and would make the backfill enormous. Left out on
  purpose (their type carries the parent), but that means `parent_id` is *sparse* — code must never
  assume it is populated.
- **Policy questions inheritance forces, which the flat model never had to answer:**
  - does a child's `auth` **replace** its parent's, or **merge** per key (today: merge)?
  - may a child **widen** what its parent granted, or only narrow it? Narrowing-only is the safer
    rule and the one most people expect, but it is a behaviour change for anyone relying on a page
    being more public than its pattern.
  - what does a **cycle** do? A depth cap, and a reconcile that reports them.
- **Recursive resolution per read** — fine on an indexed column at depth 4, with the per-request
  memo, but it is a new cost on every listing and wants measuring against a 377k-row table rather
  than assuming.

**Recommendation: do it, in Phase A, alongside `auth`** — with the type-path fallback, so nothing
depends on the backfill being complete before inheritance starts working.

## Still open

1. **One column or two** (`auth` vs `auth_read` / `auth_write`). **Recommendation: one**, with the
   two verbs inside, matching the stored shape — two columns duplicates the inheritance logic.
2. **Does `auth` stay mirrored in `data.authPermissions`?** **Recommendation: the column is the
   source of truth; the read path falls back to `data` for one release; the admin UI writes the
   column only.**
3. **The WebSocket.** Filtering broadcasts per subscriber needs the subscriber's identity on the
   socket — today `subscribe` carries only `{app, pattern}`. A protocol change, and the one piece a
   predicate alone cannot solve.

## The migration is optional, by default (owner, 2026-10-26)

**The server must run against an unmigrated schema and fall back to defaults when the data is not
there.** Not a nice-to-have: dms-server runs against many databases (per-app schemas, SQLite, the
test harness, other people's clones), and a release that requires DDL before it boots is a release
that breaks them all at once.

So there are **three independent switches**, and every combination has to work:

| Columns present? | Backfilled? | Enforcement flag | What you get |
|---|---|---|---|
| no | — | — | **exactly today's behaviour**: auth from `data.authPermissions`, ancestry from the type path. Nothing new, nothing broken. |
| yes | no | off (reads) | identical to the row above — every `auth` is NULL, so every row inherits, and `parent_id` is NULL so the type path answers |
| yes | yes | off | row-level auth and row-level inheritance on reads |
| yes | yes | on (writes) | the `edit` verb enforced; a blank row denies edit |

### How the code stays indifferent

- **Probe, don't assume.** A `columnExists(schema, table, column)` on both adapters — they already
  have `tableExists` in exactly this shape (`information_schema.columns` for Postgres,
  `PRAGMA table_info` for SQLite) — cached per `(schema, table)` like `_tableCache` and surfaced as
  one `authCapability(app)`, memoised the way `hasChangeLog()` does it in `routes/sync/sync.js`.
  That function is the precedent to copy, including its one-line warning when the capability is
  missing.
- **Capability is per TABLE, not per database.** In per-app split mode each app has its own schema,
  and split tables are created on demand by `buildCreateTableSQL` — which will include the new
  columns the moment it is updated. So a freshly created split table can have `auth` while the app's
  main table does not. Any check that asks the database once, globally, will be wrong.
- **Column lists are built, not literal.** `SELECT id, app, type, data` gains `, auth` and
  `, parent_id` only when the probe says so. No `SELECT auth` against a table without it — Postgres
  errors the whole query, which on a read path means a blank page rather than a degraded one.
- **Reads fall back in this order**: `auth` column → `data.authPermissions` → inherited from the
  ancestor → the blank-row default (read allowed, edit denied).
- **Writes never write a column that is not there.** With the columns absent, the admin UI keeps
  writing `data.authPermissions` and the controller skips deriving `parent_id`; the row stays
  exactly as a current server would have written it, so an older server can still read it.
- **The DDL leaves the always-run file.** `migrate_dms_core.sql` runs on *every* init for a
  `role: "dms"` database, which would make the migration automatic — the opposite of optional. The
  `ALTER`s go in an explicit, separately-invoked script, and the always-run file is left alone.

### The test that keeps this honest

Running the suite against a migrated schema proves nothing about the unmigrated one. **The sync and
controller suites must be run twice — once with the columns, once without** — and the second run is
the one that matters, because it is the state every existing database is in. Without that, "optional"
is true for about a month.

## Testing against copies of production apps (owner, 2026-10-26)

Test fixtures are **copies of real apps**, `mitigat-ny-prod` first: it is the biggest, the messiest
(47 patterns, 25 subdomains, 7 of them `no-access` already), and the one where a wrong inheritance
rule would be most visible. A synthetic fixture would agree with whatever the resolver does.

**The tool already exists.** `src/scripts/copy-db.js` (`npm run db:copy`) copies **one app** between
two database envs — `--source`, `--target`, `--app`, `--clear-target`, `--dry-run` — and it already
handles split tables, batching and orphan detection (it imports `findOrphanedPatterns/Pages/Sections/
Sources/Views` from `cleanup-db.js`). `tests/test-db-copy.js` and the `copy-test-src/tgt` configs are
its harness.

So the fixture procedure is:

- [ ] copy `mitigat-ny-prod` into a scratch env (a local Postgres or SQLite config), **never a
      second app inside the production database** — the whole point is that nothing being tested can
      reach prod
- [ ] repeat for at least one small app and one with heavy dataset use, so the matrix has a
      structurally different second and third case
- [ ] run the copy with the schema **unmigrated**, then migrate the copy, then backfill — the three
      switch states from the table above, against real data
- [ ] record what the orphan finders report before and after the `parent_id` backfill: a page or
      section the backfill cannot place is exactly an orphan, so those two should agree, and a
      disagreement is a bug in one of them

## Client-side reads of the parent pointer (owner, 2026-10-26)

Every place the client reads a row's parent has to prefer `parent_id` and fall back, for unmigrated
apps. The inventory, from the working tree:

| Where | Shape read | What it does |
|---|---|---|
| `page/pages/_utils/index.js:75,81,118,121` | bare id (`d.parent === isMatch?.id`, `d.parent === ''`) | nav building and breadcrumbs |
| `admin/.../pagesEditor.jsx:477,700,931` | bare id (`!p.parent \|\| p.parent === ''`) | the page tree and the **Orphans** lens |
| `page/pages/edit/editPane/pagesPane.jsx` | bare id | the editor's page list |
| `api/preloadSectionData.js:221` | bare id (`!d.parent && d.index == 0`) | finding the site's root page |
| `sections/sectionArray.jsx:369,405` | **writes** `parent: JSON.stringify({ id, ref })` | section create |

Two things this inventory settles:

1. **The client never queries by parent — it filters in memory** over rows it already has
   (`dataItems.filter(d => d.parent === …)`). So "use the column" is not a query change on the
   client: it is **one accessor**, `parentIdOf(row)` → `row.parent_id ?? idFrom(row.parent)`,
   handling both stored shapes (bare id, and the stringified `{id, ref}`), used in all five places.
   The query-side win from the column is server-side — auth resolution, and an Orphans lens that
   could finally be a `WHERE parent_id IS NULL` instead of a client-side scan.
2. **`parent_id` has to be selectable before any of this works.** `DATA_ATTRIBUTES` in
   `dms.controller.js` is the whitelist of row attributes a client may request — `id, app, type,
   data, created_at, created_by, updated_at, updated_by`. The column must be added there (guarded by
   the capability probe, so an unmigrated table never has it requested) and then actually asked for
   by the loaders. Until both happen, `row.parent_id` is `undefined` everywhere and every call site
   silently takes the fallback — which is safe, and is also exactly how this quietly never ships.

### Writes: who authors the edge

**Clients author the parent pointer today** — seven places, not one:

| Where | Writes |
|---|---|
| `page/pages/edit/editFunctions.jsx:20` | `parent: item.id` — create a child page |
| `editFunctions.jsx:79` | `parent: newParent` — move a page |
| `editFunctions.jsx:117` | `parent: item?.parent \|\| ''` |
| `admin/.../pagesEditor.jsx:889, 938` | page create / duplicate |
| `page/pages/edit/editPane/pagesPane.jsx:404` | parent on save |
| `sections/sectionArray.jsx:369, 405` | section create — the stringified `{id, ref}` |

(Not a parent pointer despite the key name: `sectionGroupsPane.jsx`'s `parent:` values are group
**positions** — `"content"`, `group.name`. Don't let a grep sweep them in.)

**Proposed: they keep writing `data.parent` and never write `parent_id`.** The server derives the
column in the controller. Why:

1. **It is what makes the migration optional.** An old client, the CLI, a half-deployed bundle — all
   keep writing `data.parent`, and a migrated server still produces a correct `parent_id`. If
   clients authored the column, every writer would have to ship before it could be trusted.
2. **One derivation point cannot drift.** Seven sites each remembering a second field is seven
   chances to forget.
3. Direct SQL bypasses either approach, which is why the reconcile query is in Phase A regardless.

**The trade-off, stated plainly:** this makes `data.parent` the source of truth and `parent_id` a
derived index. The `data` read is not gone — it moves to the write path. If the column should ever
*be* the record, that is a deliberate later flip: update those seven sites, stop writing the JSON,
and let the column stand alone. Do the derived version first; keep the flip as an option once the
backfill has proven itself against the production copies.

## Does this fit chat? (checked 2026-10-26, before implementation)

Traced chat's real row types through `parseRowType`. Two problems, one of them structural.

### Problem 1 — a message does not inherit from its channel

```
chat_chat|71280:data   →  { parent: 'chat_chat', instance: '71280', kind: 'data' }
chat|channel           →  { parent: 'chat',      instance: null,    kind: 'channel' }
```

The type path takes a message to the **source** (`chat_chat`) — one row shared by the whole install —
then the dmsEnv, then the site. **It never passes through the channel.** So every channel's messages
would resolve to identical auth, which is precisely wrong for a private channel.

The channel knows about its view (`channel.data.view_id = 71280`); the view does not know about its
channel. Another upside-down edge, exactly the kind §"Parentage" catalogues.

Two ways to close it:

- **(a) Messages carry `data.parent = <channel row id>`** → the server derives `parent_id` → one hop
  from message to channel. Simple, no resolver special-casing, and **chat has no legacy rows to
  backfill** — every message is written by code we control (the composer and the Slack importer),
  so this costs one field at write time. Note it means `parent_id` *is* populated on split rows for
  chat; the "leave split rows null" guidance was about not rewriting millions of existing dataset
  rows, not a prohibition.
- **(b) The view row points at its channel**, and the resolver learns that for `kind: 'data'` the
  **instance is a view row id** (`{source}|{viewId}:data`). Then message → view → channel. Two hops,
  and it needs `createChannel` to write the back-pointer after the channel row exists.

**Recommend (a) for chat.** But **(b) is needed anyway for datasets** — a dataset row has to reach
its view and source, which is the original Phase 3 scope — so the resolver should understand the
`:data` instance convention regardless. Chat just shouldn't depend on it.

### Problem 2 — resolved by narrowing-only (no third verb) — 2026-10-26

**Retracting the "two verbs is one short" finding above.** Owner's correction: the `auth` column always
*narrows* its parent's grant, and principals are user ids or groups — which is how the rest of DMS
already works (`{ groups: { name: [perms] }, users: { id: [perms] } }` in `routes/dms/auth.js`). So
"may not edit someone else's message" needs no verb: the message row names the author, and everyone
who inherited `edit` from the container loses it on that row.

```js
// a message row's auth — a strict narrowing of the container's edit grant
{ users:  { [authorId]: ['read', 'edit'] },
  groups: { [membersGroup]: ['read'], [adminsGroup]: ['read', 'edit'] } }
```

One consequence to write down: **narrowing removes everyone not named**, so the row must name whoever
should keep edit. If channel admins are to moderate, the composer writes them in — it has the channel
row in hand, so this is one field, not a lookup.

#### What actually remains: creates resolve against a type, not a row

`dms.data.create` takes `[app, type]` and **has no per-row check at all today** — only `this.user`
(`routes/dms/dms.route.js:517`). So "may post here" was never a verb question; it is the question of
what a *create* resolves against, and the answer matters because at create time there is no row yet
to narrow.

This also **flips the recommendation in Problem 1**. For a create the server knows only `(app, type)`:

- **Fix (a), `data.parent = channelId`, does not authorize creates.** The parent would come out of the
  submitted payload — the client naming the row that authorizes its own write. A caller could claim a
  parent they may write to while the row lands in another channel's type, since the *type* decides
  where it is read from. That is a hole, not a wrinkle.
- **Fix (b), the view row points at its channel**, authorizes creates correctly: the type
  `{source}|{viewId}:data` carries the view id, so the parent is derived from the type itself and
  never from client-supplied data.

**So: fix (b), and `data.parent` on messages is not needed.** If (a) is ever used anyway, the server
must verify a submitted `data.parent` against the type's own ancestry before trusting it.

#### And then the post/administer split stops being a conflict

With the view as the message container, the two grants sit on **two different rows** that are
siblings, not ancestor and descendant — the channel *points at* the view — so narrowing-only is never
violated:

| Row | `edit` granted to | Governs |
|---|---|---|
| view (`{source}\|{slug}:view`) | the channel's member group | creating messages — posting |
| channel (`{instance}\|channel`) | the channel's admin group | rename, archive, topic, membership |
| message (`{source}\|{viewId}:data`) | its author (+ admins) | editing that one message |

Both the view and channel grants are narrowings of the chat pattern row, independently. Members post
without being able to archive; admins administer without being handed every message.

Cost: a channel's policy lives in two rows that must stay in step. `createChannel` already writes the
view row and then the channel row (`src/patterns/chat/channels.js`), so it writes one grant to each —
and a membership change touches both. Mechanical, and worth it to avoid a verb.

### Smaller findings

- **Membership lives in rows; auth lives in a column.** `chat|member` rows carry read-state, but an
  invite-only channel's gate has to be in the channel's `auth.users` — the resolver reads a column,
  it cannot query member rows. So `joinChannel` would write both, or member rows become read-state
  only and `auth.users` is the gate. Decide, or they drift.
- **Browse channels fits exactly**: "channels I may read" is a filtered listing, which the single
  choke point gives for free.
- **The WebSocket is chat's blocker, not a nicety.** A non-member must not *receive* a private
  channel's broadcasts, not merely fail to render them — chat is the first real consumer of the open
  protocol question in "Still open".
- **No backfill risk**: chat is new. Its rows can be written correctly from day one, which makes it
  a good first consumer — and a bad canary for the migration path that existing apps will take.

## The merge rules (decided 2026-10-27 — merge the chain, like themes)

Owner: resolution walks the parent chain and **merges** it into one object, the way themes merge, and
the rules must be universal and written down for pattern authors.

This already exists at depth 2 — `dms.route.js:83` does
`{ ...patternAuth.groups, ...pageAuth.groups }`: child wins per principal, unnamed principals
inherited. The work is generalizing it to an N-deep chain and settling what "narrow" means inside a
merge. Reference implementation written and exercised against chat's cases; **all pass**.

### The rules

1. **Merge per principal, never per permission.** A child's entry for a group or user replaces the
   parent's entry for that principal wholesale. Permission arrays are never element-merged —
   lodash `merge` combines arrays *by index*, which turns `['read']` over `['read','edit']` into
   `['read','edit']`. This is the same trap `mergeTheme` documents for `fonts` (`ui/useTheme.js:126`).
2. **A principal the child does not name keeps what the chain gave it.** Merge, not replace — this is
   the theme behaviour and the existing depth-2 behaviour.
3. **A child may only narrow — but only where an ancestor has spoken.** The clamp is per principal: a
   child's entry is intersected with what an ancestor explicitly stated for *that* principal. If no
   ancestor ever mentioned it, there is no ceiling and the child may grant freely.
4. **`otherwise` is the ceiling**, a sibling field — not a `'*'` key inside `groups`. It caps every
   principal the object does not name, which is how a row declares a **closed set**
   (`otherwise: []` = private). It is a property of the whole object, not a principal, so it does not
   belong among the groups; and `'*'` is already taken as a *value* meaning "all verbs"
   (`routes/dms/auth.js:77`), so reusing it as a key would make one character mean two things by
   position.
   **One special case: `otherwise` also clamps `public`.** Every user is in `public`
   (`routes/dms/auth.js:63`), the Access editor seeds it into every row it saves, and perms *union*
   across a user's groups — so without this, a seeded `public: ['read']` punches through
   `otherwise: []` and the ceiling is useless in exactly the case it exists for. `public` is already
   special in three other places (seeded by the editor, filtered by `hasAuthGrants`, short-circuited
   in `isUserAuthed`); it is "everybody", not a principal anyone chose. All other explicitly-named
   principals are exempt from the ceiling — otherwise `otherwise: [], members: ['read']` could not
   be expressed.
5. **Empty result ≠ deny read.** The merged object being empty means "nothing was ever stated",
   which the caller turns into the agreed default: read allowed, edit denied.

### Two things that only showed up on writing it

**Absence means two different things, and conflating them breaks the system.** The first draft used
the default (`['read']`) as the ceiling for an unmentioned principal. That makes *the first grant in
any chain impossible* — the chat pattern grants `members: ['read','edit']`, the site row above never
mentioned `members`, so the grant clamped to `['read']` and nobody could post. So: at the **ceiling**
level absence means "no restriction stated, the child is free"; at the **final check** absence means
"read yes, edit no". Same blank value, opposite readings, and they must stay separate.

**Narrowing alone does not make anything private.** Because unnamed principals inherit (rule 2), a
child that simply lists its members still leaks whatever its ancestors granted — a private channel
whose pattern grants `public: ['read']` stays publicly readable. The `'*'` ceiling is what closes it,
and it is the *only* knob that does. Both failing cases in the first test run were this.

**Flag:** `'*'` already means "all permissions" as a *value* in `isUserAuthed` (`p === '*'`,
`routes/dms/auth.js:77`). Using it as a principal *key* as well is free but reads ambiguously; worth
a deliberate choice before it ships.

### Reference implementation

```js
const VERBS = ['read', 'edit'];

const expand = (perms) => {
  if (perms === undefined || perms === null) return null;      // "not mentioned"
  const list = Array.isArray(perms) ? perms : [perms];
  if (list.includes('*')) return [...VERBS];                   // value '*' = all verbs
  return VERBS.filter(v => list.includes(v));
};

// What an ancestor granted a principal: its own entry, else that level's ceiling.
const ceilingFor = (parent, kind, principal) =>
  expand(parent?.[kind]?.[principal]) ?? expand(parent?.otherwise) ?? null;

function mergeAuthLevel(parent, child) {
  const out = { groups: {}, users: {} };
  const childCeiling = expand(child?.otherwise);
  for (const kind of ['groups', 'users']) {
    const principals = new Set([
      ...Object.keys(parent?.[kind] || {}),
      ...Object.keys(child?.[kind] || {}),
    ]);
    for (const p of principals) {
      const named = expand(child?.[kind]?.[p]);
      // rule 4: the child's ceiling caps principals it does not name — and `public`
      // even when it does, since `public` is everybody and the editor seeds it.
      const capped = (named === null || (kind === 'groups' && p === 'public'))
        ? childCeiling : null;
      // rule 1 + 2: the child's entry wins; otherwise keep what the chain gave it.
      const stated = named ?? childCeiling;
      // rule 3: an ancestor ceiling binds only where an ancestor actually spoke.
      const ceiling = ceilingFor(parent, kind, p);
      let value = stated ?? ceiling ?? [];
      if (capped) value = value.filter(v => capped.includes(v));
      out[kind][p] = ceiling ? value.filter(v => ceiling.includes(v)) : value;
    }
  }
  if (child?.otherwise !== undefined || parent?.otherwise !== undefined)
    out.otherwise = childCeiling ?? expand(parent?.otherwise) ?? [];
  return out;
}

// chain is root → leaf
const mergeAuthChain = (chain) =>
  chain.reduce((acc, level) => mergeAuthLevel(acc, level), { groups: {}, users: {} });
```

### Cases it is held to

| Case | Expected |
|---|---|
| blank chain (unmigrated) | `{}` → caller applies read-yes / edit-no |
| pattern grants `members: [read, edit]`, view inherits | member may post |
| channel states `otherwise: []` + members + admins | non-member cannot read; member cannot administer; admin can |
| message names its author | author edits own; another member cannot; another member still reads; admin moderates |
| child re-grants `edit` under a stated ceiling | refused |
| child names a brand-new group under an `otherwise: []` ceiling | refused |
| a seeded `public: ['read']` under `otherwise: []` | capped — does not leak |
| first grant in a chain, no ancestor mention | lands |

Phase A ships this as `mergeAuth.js` beside `routes/dms/auth.js` with these cases as its test, and
**Phase D documents the five rules in `src/dms/skills/registering-a-pattern-type.md`** — they are
rules pattern authors have to follow, not an implementation detail.

## Verb analysis — do client verbs collapse into read/edit? (2026-10-27)

**Recommendation: no `{ server, client }` split. Keep one flat object; have the server recognise
exactly `read`/`edit` and *derive* them from the existing verbs through an implication table.**

### Every verb in use

Registry: `src/dms/packages/dms/src/utils/adminPermissions.js` (site + pattern admin),
`patterns/page/page.format.js`, `patterns/datasets/datasets.format.js`.

| Verb | Pattern | What it gates | Collapses to |
|---|---|---|---|
| `view-page` | page, datasets | read a pattern/page row — **already the server's read verb** (`dms.route.js:87`) | **read** |
| `view-pattern-list` | admin | read the pattern list | **read** |
| `view-sources` / `view-source` | datasets | read many / read one | **read** |
| `edit-page` | page | write page content | **edit** |
| `update-source` | datasets | write a source | **edit** |
| `edit-pattern` | admin | write a pattern row | **edit** |
| `manage-themes` / `manage-tenants` | admin | write theme / tenant rows | **edit** |
| `create-page` | page | create a child page | **edit on the container** |
| `create-pattern` | admin | create a pattern row | **edit on the container** |
| `create-view` | datasets | create a version under a source | **edit on the container** |
| `delete-pattern` / `delete-source` | admin, datasets | destroy a row | **edit** (see below) |
| `edit-page-permissions` | page | write the auth field | **escalation guard — must stay distinct** |
| `edit-pattern-permissions` | admin | write the auth field | **escalation guard** |
| `edit-source-permissions` | datasets | write the auth field | **escalation guard** |
| `edit-page-params` | page | write one field group (filters, settings panes) | field-scoped edit — **client only** |
| `publish-page` | page | draft → published transition | **client only** — not expressible |
| `download-source` | datasets | bulk export (old DOWNLOAD level) | **client only** — a read you can withhold |
| `view-source-api` | datasets | the API surface | **client only** |
| `manage-downloads` | datasets | create/refresh download artifacts | **client only** |
| `view-as` | auth | impersonation | **client only** — no row involved |
| `auth-users` / `auth-groups` | auth | manage users and groups | **client only** — not DMS rows |

Roughly: **11 of 21 are row access** and do collapse; 3 are the escalation guard; 7 are feature
capabilities with no row behind them.

### Why the feature verbs must not collapse

`publish-page`, `download-source`, `view-source-api` and `view-as` all exist precisely to express
*"you may read/edit this, but not that particular thing with it."* Collapsing `download-source` into
`read` grants bulk export to everyone who can view a source; collapsing `publish-page` into `edit`
means anyone who can fix a typo can publish. `view-as` and `auth-users` have no row at all. These are
load-bearing distinctions, and collapsing them would also force a re-grant across every live site.

### The finding that decides the shape: moving `authPermissions` into the column creates an escalation hole

Today `data.authPermissions` is protected because **writing it needs a different verb than writing
the row** — `edit-page-permissions`, not `edit-page`. Move auth into a column and collapse to two
verbs, and `edit` on a row becomes `edit` on its own grants: anyone who can edit a page can grant
themselves `*`. Note this is *worse* than today, not equal.

The fix already has a precedent server-side — `uda.route.js:193` sniffs the payload and demands the
stronger verb:

```js
const requiresPermEdit = JSON.stringify(sourcesById[sourceId] || {}).includes('auth_permissions');
const reqPermissions = requiresPermEdit ? ['edit-source-permissions'] : ['update-source'];
```

Generalise exactly that: **a write that touches the `auth` column requires the row's
`edit-*-permissions` verb, never plain `edit`.** With a column this gets *easier* than the string
sniff — the write either names the column or it does not.

### Why not `{ server: {}, client: {} }`

It splits one policy across two places, so every grant has to be made twice and kept in step, and the
Access editor has to teach the difference. The two sets also overlap — `view-page` is both the client's
read gate and the server's — so the split duplicates rather than separates. And it makes migration a
rewrite of every existing grant instead of a no-op.

### Recommended shape

1. **One flat `auth` column**, the existing `{ groups: { g: [verbs] }, users: { id: [verbs] } }`
   shape, holding the full verb vocabulary. One object, one merge function, one editor.
2. **The server recognises only `read` and `edit`**, and derives them from whatever verbs are present
   via a small implication table, so existing grants keep working with no rewrite:
   ```js
   const IMPLIES = {
     // bare `view` is already granted on section rows (page.format.js permissionDomain) —
     // omit it and every existing section grant silently loses read.
     read: ['read', 'view', 'view-page', 'view-pattern-list', 'view-sources', 'view-source'],
     edit: ['edit', 'edit-page', 'update-source', 'edit-pattern', 'manage-themes',
            'manage-tenants', 'create-page', 'create-pattern', 'create-view',
            'delete-pattern', 'delete-source'],
   };
   ```
   `'*'` keeps meaning both. This is what makes the migration optional: an unmigrated row's existing
   `view-page` grant *is* a server read grant.
3. **Clients keep their full vocabulary** and go on checking it as they do now — unchanged code.
4. **Writing the `auth` column requires the row's `edit-*-permissions` verb**, generalising
   `uda.route.js:193`. Without this, item 1 is a privilege-escalation hole.
5. **`delete` folds into `edit` server-side** for now — it is the most destructive edit, and every
   current delete verb is already admin-level. Revisit only if a pattern wants "edit but never
   delete"; chat does not (deleting a message is the author's own `edit`).

### Consequence for the merge rules

The clamp applies per verb string, so it works unchanged on the long vocabulary — a child narrowing
`['read','edit','publish-page']` to `['read']` drops publish too. That is the desired reading, and it
means the client gets chain-wide inheritance it does not have today (its merge is two levels deep and
does not clamp). Worth calling out in the Phase D docs as a behaviour change for pattern authors.

## Naming: bare `read`/`edit`, not `server-read`/`server-edit` (2026-10-27)

**`edit` is already a granted verb, in an auth vocabulary** — `page.format.js:69`, a section's
`permissionDomain`:

```js
{label: 'View Section', value: 'view'},
{label: 'Edit Section', value: 'edit'},
```

Sections already grant bare `view`/`edit` meaning "view/edit **this row**", which is exactly the
universal meaning proposed here. The collision is an alignment, not a conflict — bare is the existing
idea being generalised, not a new one.

**Keep them bare.** Reasons, by weight:

1. **`server-` names the wrong axis.** The distinction is not server-vs-client, it is *universal vs
   pattern-scoped*. Clients check these too — chat's channel rail is "which channels may I read", and
   browse-channels is the same query. Prefixing invites a `client-read` twin and reinstates the
   `{ server, client }` split this doc just rejected.
2. **The convention already encodes it.** Every pattern-scoped verb is `{verb}-{noun}`; the noun is
   the scope. Unqualified = any row, suffixed = this pattern's thing. Outliers (`manage-themes`,
   `manage-tenants`, `manage-downloads`, `auth-users`, `auth-groups`) use `manage`/`auth` stems and
   are not worth renaming live grants over.
3. Shortest in the place it is typed most — every row's auth object.

**`read` over `view`** for the read verb, despite `view` being the house stem (`view-page`,
`view-source`, `view-as`) and already bare on sections: `view` also names a **row kind**
(`{source}|{slug}:view`, `view_id`, `create-view`), and a `view` permission on a `view` row is a
readability trap. `read` has no collision, and costs nothing extra because `IMPLIES` must map the
`view-*` family regardless — bare `view` just joins that list.

**Two things to state at ship time:**

- `read` and `edit` become **reserved words**: a pattern may not define its own narrower `read`. The
  Access editor should offer them as fixed options, not free text.
- Existing bare `edit` grants on section rows become **server-enforced** edit on those rows. Correct,
  but a live behaviour change on real data — call it out in the Phase D notes and check it against
  the `mitigat-ny-prod` fixture.

## Three decisions closed (2026-10-27)

**Cycle handling — truncate, never deny.** The walk carries a `visited` Set and a depth cap of 16; on
a repeat or the cap, **stop and resolve against the partial chain**. Denying would turn one bad row
into a site outage, and the truncated chain still holds every distinct ancestor reached before the
repeat — since ancestors only narrow, nothing is wrongly widened. Log loudly so the row gets fixed.
Real depths are ~5 (site → dmsEnv → pattern → page → section) and ~4 for chat, so 16 is generous.
Memoize the resolved chain per request, as `dms.route.js` already does with `patternAuthCache`, so a
cycle is walked once rather than once per row. Cycles are reachable today: duplicate-pattern rewrites
parentage, the Slack importer writes in bulk, and seven client sites hand-author `data.parent`.

**`otherwise`, not `'*'`-as-a-key** — see rule 4 above, including the `public` clamp.

**The WebSocket checks every outgoing message.** Owner accepts the scope. The cost is smaller than it
first looks: the expensive half is resolving the row's ancestor chain, and that is **per row, not per
subscriber** — `notifyChange` already resolves one message and fans it out. So resolve the merged
auth once per broadcast, then per recipient run only `can(merged, user, 'read')`, which is set math
on an object already in memory. The fan-out loop stays allocation-free, which is what its two prior
optimisations were protecting (`ws.js:580`).

What this needs, in order:

1. **Identity on the socket.** `ws.js:405` is `wss.on('connection', (ws) => {` — no `req`, so the
   upgrade request and its cookies are discarded and the connection has no user at all. Take `req`,
   resolve the user, store it on `ws`. This is the protocol change; everything else follows.
2. **A verdict per recipient** inside `notifyChange`, after the single `stripSplitRowData` +
   `JSON.stringify`, reusing the existing per-client loop.
3. **Unauthenticated sockets keep working** — they resolve to the anonymous user and get whatever
   `otherwise`/`public` allows, so public sites are unaffected.
4. **Revocation is now live**, which per-subscribe checking would not have given: the next broadcast
   after a grant changes already uses the new value.

This is its own library task — a protocol change with consumers beyond chat. The same gap does *not*
exist on `/sync/bootstrap` and `/sync/delta`: those are HTTP and already have
`req.availAuthContext.user` (`sync.js:518`), so the resolver drops straight in.

## Reconciliation with `permissions_move` — auth rules must be data (2026-10-27)

Owner, on reading `dataAuth.js`'s `judge()`: **it is unacceptable DMS code because it is
unconfigurable.** Deploying a pattern with new auth rules requires editing a library `switch`. In DMS
everything is data; auth has to be data too. Recorded as a standing rule in `src/dms/CLAUDE.md`
("Auth Rules Are Data, Not Code").

This does **not** reject the branch's approach — it constrains it. `judge()` may stay, provided its
rules come from **pattern registration aggregated across patterns** rather than a hand-written
switch, so that adding a pattern adds no branch.

### What `judge()` hardcodes, and where each part already has a data home

| Hardcoded today | Data home |
|---|---|
| *"a page's grants merge with its pattern's"*, *"a view belongs to a source"* — **relationships between rows** | **parentage** — `parent_id`, falling back to the type path. Walking it reconstructs these. |
| *"changing `authPermissions` needs `edit-page-permissions`"*, `SITE_KEYS`, `isPublish(k)` — **which verb governs which field** | the pattern's **format**, beside the `permissionDomain` that already declares its vocabulary. |
| *"an unknown kind means signed-in is enough"* | nowhere — it is a **default that should not exist**. |

**Correction (2026-10-27): formats are NOT data today.** The `formats` table and the server's
`getFormat` read path both exist, but **nothing writes the table and the client never reads it** — at
runtime a pattern's format comes from `import cmsFormat from "./page.format.js"` in `siteConfig.jsx`.
It is client code in the bundle; the table is vestigial. `permissionDomain` is therefore declared as
data *in source*, read only by the Access editor UI, and never reaches the server.

So "patterns declare auth rules in the format and the server aggregates them" is **not free today**.
Making it true means populating the table and guarding it (a pattern must not be able to rewrite its
own auth rules) — worthwhile, but its own piece of work. It must not block this one. See the verb
model below, which is deliberately designed to need none of it.

### Revised position on the verb collapse

Owner: the collapse to `read`/`edit` was **not** the valuable part, and is partly the same mistake —
it fixes the vocabulary in library code. **A larger server vocabulary is acceptable; a vocabulary
whose *application* is hand-wired per type is not.**

- **Drop "the server recognises exactly two verbs."** Patterns register their verbs, as they nearly do
  already via `permissionDomain`, and the server honours what the aggregate declares.
- **Keep `IMPLIES`, demoted.** No longer the model — a compatibility shim so a chain-resolved row
  understands grants written in today's vocabulary. It belongs with the per-pattern declaration, not
  as a server constant.
- **Keep the field→verb mapping, but as format data**, not `SITE_KEYS` / `isPublish()` in a server
  file. The branch's per-key judging is a real capability and should survive the move — `planEdit` is
  worth keeping entirely; only its *rule source* changes.

### The resulting shape

1. **Parentage carries relationships** — one walk reconstructs what eleven cases spell out.
2. **Formats carry field rules and vocabulary** — aggregated across registered patterns.
3. **`judge()` becomes an interpreter** over (1) and (2), gaining no branch when a pattern is added.
4. **The default is inheritance, never permission** — an unrecognised kind resolves through its
   parent. The single most important correction to the branch, and the one chat needs.

### Still to work out

- The declaration format itself: what a pattern writes to say "this field needs this verb" and "my
  rows parent to X". Should extend `permissionDomain`, not sit beside it.
- Whether the aggregate is computed per request (cached) or at pattern-registration time.
- How a pattern declares parentage for rows whose type path points the wrong way — chat's messages
  reach the source, not the channel (see "Does it fit chat?").

## The server's verbs: five, structural, never extended (decided 2026-10-27)

### The question this answers

Not "how big should the vocabulary be" but **"who decides which verb a request requires?"** Three
possibilities, and only one is both safe and registration-free:

| Source | Verdict |
|---|---|
| the **request** names it | unsafe — a client that picks its own check picks the weakest one |
| the **server** derives it from the row's type | safe, but that is per-type knowledge: a server registry and a deploy per pattern |
| the **server** derives it **structurally**, from what the request physically does | safe, and needs no type knowledge at all |

This — not tidiness — is the real justification for a small server vocabulary. The server may only be
trusted with a verb it can identify from the operation itself.

### The five

| Verb | The server knows it applies because | Earns its place because |
|---|---|---|
| `read` | the request returns row data | — |
| `create` | a create route, with no row yet | **it resolves against a different row** — the parent, not the row |
| `edit` | the request modifies an existing row | — |
| `delete` | a delete route | deleting a **parent** has consequences for children that editing never has |
| `grant` | the write touches the `auth` column | without it, `edit` on a row is `edit` of its own grants — escalation |

All five are facts about the operation (`dms.data.create` / `edit` / `delete` are separate routes;
sync push carries `I`/`U`/`D`; "did this payload name the auth column" is inspectable), true for
every row of every pattern forever. **Nothing else qualifies.** `publish-page`, `download-source`,
`view-as` and any pattern's own verbs cannot be identified without knowing the type — publishing is
structurally just an edit — so they stay client-side.

### Consequences

- **Patterns are never registered on the server.** Client-side changes extend the *pattern*
  vocabulary freely and the server's set never moves.
- **No `IMPLIES` table on the server.** The bridge is written at grant time by the client, which
  knows its own vocabulary: granting `edit-page` stores the pattern verb *and* the structural verbs
  that pattern intends. The server checks `edit` and knows nothing; the client checks `edit-page`.
  `IMPLIES` survives only as each pattern's own expansion map, which is where pattern knowledge
  belongs.
- **Retracts the chat container-row workaround.** "Members may post but not administer" was solved by
  splitting grants across the view row and the channel row, costing `createChannel` two grants to
  keep in step. With `create` as a verb it is one row: members get `create`, admins get `edit`. The
  two-row dance goes. (See "Does it fit chat?" — the finding that messages must reach their channel
  still stands; only the post/administer half is superseded.)
- **`delete` is split now, not later.** Fold it into `edit` and split afterwards and everyone holding
  `edit` loses delete until a backfill; split now and merge later and nobody loses anything. Starting
  fine is the recoverable error.

### The cost, stated plainly

**Field-level enforcement is given up.** The branch enforces "changing `sections` needs
`publish-page`" on the server; here that is an `edit`, and the distinction lives only in the UI.
Field-level rules require the server to know which fields matter — per-type knowledge, the thing this
design refuses. If it becomes necessary the path is making formats genuinely data (above), **not**
adding verbs.

## Grants have a scope: `self` vs `descendants` (decided 2026-10-27)

Owner, reading the `implies` sketch: `permissionDomain` entries are named for a *relationship*
("View Page", "Edit Page") and live on the **pattern**, but the server knows nothing about pages
under patterns — only that a row's descendants inherit its grants. That felt like a mismatch, and it
is a real gap.

**The problem.** Grant `edit-page` on the pattern row, expand it to `['read','edit']`, and plain
chain inheritance puts that grant *on the pattern row* — so it governs the pattern row as well as
everything beneath it. But "Edit Page Content" was never meant to confer editing the pattern row;
that is `edit-pattern`. The same structural verb does two different jobs depending on which row it
lands on. This is the same conflation as chat's post-vs-administer, and it is more general than
either of the two workarounds previously recorded here.

**The fix is a missing axis, not a different mechanism.** A grant carries a scope:

```js
{ value: 'edit-pattern',          implies: { self:        ['edit'] } },
{ value: 'edit-page',             implies: { descendants: ['edit'] } },
{ value: 'create-page',           implies: { descendants: ['create'] } },
{ value: 'edit-page-permissions', implies: { descendants: ['grant'] } },
{ value: 'view-page',             implies: { descendants: ['read'] } },
{ value: 'download-source',       implies: {} },                      // UI only
```

The distinction has been in the vocabulary all along, carried by the noun: `-pattern` verbs are
**self**, `-page` verbs are **descendants**. That is why the names read as if they meant something
the server could not see — they did.

**Resolution.** A row's effective auth is the merge of every ancestor's `descendants` block, then the
row's own `self` block on top. The server still knows nothing about types: it knows two scopes, *mine*
and *below me*. Narrowing is unchanged — a child's `self` clamps against its ancestors'
`descendants`.

**The split is OPT-IN (revised 2026-10-27).** A flat auth object means *"me and everything below
me"*, so the common case carries no scope keys at all:

```js
auth: { otherwise: [], groups: { Editors: ['read','edit'] } }        // a private page
```

`self` / `descendants` appear only on a row that delegates differently than it governs itself — a
pattern, a chat channel. Resolver cost is two lines: `handsDown(r) = r.descendants ?? r`,
`governsSelf(r) = r.self ?? (r.descendants ? {} : r)`.

**Why keep it available at all**, given most rows never use it: without the split, granting "Edit Page
Content" on a pattern also confers editing the **pattern row** — renaming it, changing its theme, and
changing its `base_url` / `subdomain`, which is routing and can break or hijack a site. `grant` and
`delete` being separate verbs does not help; this is plain `edit`. Corroboration from the other
direction: `permissions_move` independently added `edit-source-data`, defined as "row
create/edit/delete, **separate from `update-source` = metadata`" — self versus descendants, solved
there by adding a verb rather than a scope.

**`*` semantics** (verified): expands to all five structural verbs including `grant` and `delete`,
flows to descendants, is scoped like any other grant, and **cannot escalate past an ancestor** — a
child granting `['*']` under a parent that gave only `read` still yields `read`. It stays literal in
the data and expands at *resolve* time, not on save, so a future sixth verb is picked up by existing
`*` grants automatically.

Declaration shape — scope stated once per bucket, not tagged per entry:

```js
permissionDomain: {
  self: [
    { label: 'Edit Pattern',             value: 'edit-pattern',             implies: ['edit'] },
    { label: 'Edit Pattern Permissions', value: 'edit-pattern-permissions', implies: ['grant'] },
  ],
  descendants: [
    { label: 'View Page',             value: 'view-page',             implies: ['read'] },
    { label: 'Edit Page Content',     value: 'edit-page',             implies: ['edit'] },
    { label: 'Create Page',           value: 'create-page',           implies: ['create'] },
    { label: 'Edit Page Permissions', value: 'edit-page-permissions', implies: ['grant'] },
    { label: 'Publish Page',          value: 'publish-page' },          // no implies = UI only
  ],
}
```

**Verified** (`scratchpad/auth-as-data/` — `scoped.cjs`, `deep.cjs` for three levels, `optional.cjs`
for flat-by-default and `*`; all pass):

| Case | Result |
|---|---|
| `edit-page` on the pattern → editor may edit a page | allow |
| same grant → editor may edit the **pattern row** | **deny** |
| `edit-pattern` self-scoped → admin edits the pattern row | allow |
| …and does not thereby inherit page edit | deny |
| chat on **one** row: member may post (`descendants: create`) | allow |
| …may not administer the channel (`self: edit`) | deny |
| a page trying to grant itself `grant` past the pattern's ceiling | deny |
| **3 levels** — `edit-page` on the pattern reaches a **section** | allow |
| a page narrowing its own sections mid-chain | section read-only, page still editable |
| a private page's restriction reaching its sections | deny to outsiders |
| flat auth (no scope keys) governing self **and** descendants | allow both |
| `*` in a child escalating past an ancestor's `['read']` | **deny** |

**Supersedes two earlier decisions in this document:**

- The **container-row workaround** for chat (grants split across the view row and the channel row) is
  retired. One row carries both: `self` for administration, `descendants` for posting.
- The justification for `create` as a *structural verb* is weakened — scope alone separates posting
  from administering. `create` stays, because it still answers a different question (it resolves
  against the parent, since the row does not exist yet), but it is no longer load-bearing for chat.

## Direction settled: build on `permissions_move`, strict defaults (2026-10-27)

**Build off the `permissions_move` branch.** Keep its route coverage, rollout modes, tests and audit
script. Replace **kind-based enforcement** (`dataAuth.js` `judge()`, 317 of ~4,400 implementation
lines) with **parent/child row-based enforcement**. Everything guarding non-row surfaces — external
sources in pgEnv databases, the auth server's user/group endpoints, route operations like upload and
schedule — stays untouched; a chain resolver has nothing to say about any of it.

### Row-based enforcement implies strict defaults

The branch's lenient rule (hub design question 6, 2026-10-23) was motivated explicitly by *"we don't
want to reject a request because there are no permissions set."* Under kind-dispatch that is a forced
choice: a row with no grants has nothing to consult, so you either deny and lock people out of apps
that never configured anything, or you allow.

**Inheritance dissolves the dilemma rather than overriding it.** A row with no grants of its own is
not blank — it is governed by its pattern and its site. "Nothing is set" stops being the common case
and becomes the rare one, so the reason for leniency goes away. Read in hindsight, lenient was a
transition accommodation for unmigrated data, not a philosophical position — and the branch already
leans strict where it can (new sources are seeded `creator: '*'`, `public: []`, explicitly private at
creation).

**Strict, stated precisely:**

- `create` / `edit` / `delete` / `grant` **require a grant**. No "unconfigured ⇒ a signed-in user may".
- A **blank chain is readable**. Strict-as-deny-everything would lock out whoever must set the first
  grant; rule 5 (empty is not denial) covers this.
- **`${app} Admin` always passes** — the bootstrap escape, kept from both designs.
- **The anon rule is unchanged** from the branch: anonymous callers pass only where `public`
  explicitly holds the permission. Already strict, and it composes with inheritance.

**This does not change the rollout.** Existing grants were written for two-level, kind-dispatch,
lenient semantics, so enforcement still goes `legacy → log → enforce` per surface, and
[permissions-grant-migration.md](./permissions-grant-migration.md) still has to grant people the
access they hold today before anything flips. Strict is the destination; the modes are the road.

**Closes** the one conflict this document flagged as needing a person: strict vs lenient defaults.

## One decision function for dms, uda and sync (owner requirement, 2026-10-27)

**All reads and edits across dms, uda and sync go through the same function.** This is not how any of
it is engineered now.

### Where decisions are made today

| Surface | Reads | Writes |
|---|---|---|
| dms rows | `dms.route.js` — 7 inline `isUserAuthed` calls, pattern ⊕ page merged inline, 2 kinds | `dataAuth.js` `judge()` (branch) — 11 kinds |
| uda / sources | `uda/readAuth.js` (branch) | `uda/sourceAuth.js` — 7 call sites |
| auth rows | `auth/utils/permissions.js` (branch) | same |
| sync | **nothing** | `/sync/push` → `dataAuth.js` |
| websocket | **nothing** | n/a |

Five independent implementations post-merge, sharing only the `isUserAuthed` primitive — which
decides set membership, not *what governs what*. Nothing structurally keeps them in agreement.

### The target

Two functions, split by purity:

```
resolve(rows)            → merged auth per row    // the only part that touches a database
can(merged, user, verb)  → boolean                // pure
```

Every call site becomes the same two lines:

| Call site | Becomes |
|---|---|
| dms read | resolve → `can(read)`, else the `no-access` stub |
| dms write | resolve → `can(edit \| create \| delete \| grant)` |
| uda read / write | resolve → `can(read)` / `can(edit)` |
| sync bootstrap, delta | resolve the **set** (one recursive CTE) → filter on `can(read)` |
| sync push | resolve → `can(edit)` |
| websocket | resolve once per broadcast → `can(read)` per recipient |

### The caveat: ancestry is pluggable, semantics are not

External sources live in **pgEnv databases, not `data_items`** — no `parent_id`, no chain to walk.
`decideSource` derives their ancestry from the client-named datasets pattern. So `resolve` cannot be
one literal implementation across every store.

The honest requirement is **one merge, one check, N ancestry providers**. Universal: the merge rules,
the five verbs, narrowing, `otherwise`, `self`/`descendants`. Varying: how a row's ancestors are
discovered — `parent_id` for `data_items`, the owning datasets pattern for external sources. That
keeps the part that matters shared (two surfaces can never disagree about what a grant *means*)
without pretending pgEnv rows have parentage they do not.

### Why kind-dispatch forecloses this

`judge()`'s switch is over `data_items` kinds; UDA's surface has different ones; sync has no kinds at
the read layer at all. **A type-keyed rule cannot be shared across surfaces that do not share types**
— which is precisely why there are five implementations instead of one. Type-free rules are what make
consolidation possible, not merely tidier.

## Running on unmigrated schema (owner, 2026-10-27)

**The code runs on unmigrated schema, and where it cannot resolve the right information it behaves
as it does today.** Not all parents will be derivable before the data migration. `data.authPermissions`
is coalesced with the `auth` column wherever the column is absent or null.

### Legacy data already means what flat means

Today a pattern's `data.authPermissions` does double duty: `patternCan` uses it to decide
`edit-pattern` (**self**), and `dms.route.js:83` merges that same object with the page's to govern
pages (**descendants**). One object, both roles. So coalescing it into a flat `auth` value
**reinterprets nothing** — flat already meant "me and everything below me" before this design named
it. The `self`/`descendants` split only appears where an author opts in.

### Truncation widens; it never wrongly restricts

An unresolvable parent yields a **shorter chain, not a failure**. Because ancestors only narrow, a
truncated chain can only be more permissive — the safe direction to fail during a migration, and the
same reasoning as the cycle rule.

**The cost, which must be written down rather than discovered:** a row that is private *only by
inheritance* becomes readable when its parent cannot be resolved. A page relying on its pattern's
`otherwise: []`, with `parent_id` null and an unresolvable type path, opens up.

**So: parent-resolution coverage gates the `enforce` flip.** Before a surface moves from `log` to
`enforce` for an app, every row in it must resolve its parentage.
[permissions-access-diff.js](../../../packages/dms-server/src/scripts/permissions-access-diff.js) is
already shaped to check this — it exists to diff access per app before each switch. In `log` mode
nothing is enforced, so the exposure only matters at the moment of the flip, which is where the gate
sits.

### Fallback matrix

| Condition | Behaviour |
|---|---|
| no `auth` column | read `data.authPermissions` — one capability probe per process, memoized like `hasChangeLog()` |
| `auth` column present, row's value null | coalesce to `data.authPermissions` |
| legacy value (flat) | flat = self + descendants — today's semantics exactly |
| no `parent_id` column | derive from the type path (`{parent}\|{instance}:{kind}`) |
| `parent_id` null, type path resolves | use it |
| **parent unresolvable** | **chain starts at this row** — its own grants decide; empty means today's default for that surface |
| cycle, or depth > 16 | truncate, resolve against the partial chain, log |

Two query shapes (column present / absent), chosen once per process from the memoized probe — never
per request.

## Where `implies` is applied: the pattern row, at resolve time (decided 2026-10-27)

A pattern declares `edit-page → ['edit']`. Something must apply that map, turning a human-meaningful
grant into the structural verbs the server checks. Two candidates: **at write time** (the Access
editor expands on save, storing `['edit-page','read','edit']`; the server does pure set membership)
or **at resolve time** (storage keeps `['edit-page']`; the server applies the map).

### Why this is not a toss-up

Grants are written in at least six places: the Access editor, the CLI, site seeding
(`createSite.jsx`), tenant provisioning, pattern creation hooks (`beforeCreate` / `afterCreate` — what
seeds a new source `creator: '*'`, `public: []`), and **the grant migration**
([permissions-grant-migration.md](./permissions-grant-migration.md)), which writes grants in bulk,
server-side.

Write-time expansion needs the map in all six. Two run on the server — and **`dms-server` has no
dependency on `packages/dms`** (checked: its `package.json` lists no such dependency), so client code
is not importable server-side. The migration would therefore write grants conferring **nothing** — a
silent, total failure of the one job it exists to do.

Resolve-time expansion needs the map in **zero writers and one reader**.

Write-time has two lesser faults as well: stored expansions go stale when a pattern changes its map,
and a grant written by hand or by script confers nothing (fails closed — safe, but reads as a bug).

### Decided: the vocabulary lives on the pattern row

The pattern's auth vocabulary goes in the pattern row's own `data`, published by the client that
registered the pattern. **The server already loads pattern rows per request and memoizes them**
(`getPatternAuthPermissions`, `patternAuthCache` in `dms.route.js`), so the read costs nothing new.

```js
// on the pattern row
authVocabulary: {
  self:        { 'edit-pattern': ['edit'], 'edit-pattern-permissions': ['grant'] },
  descendants: { 'view-page': ['read'], 'edit-page': ['edit'],
                 'create-page': ['create'], 'edit-page-permissions': ['grant'],
                 'publish-page': [] },          // declared, confers nothing server-side
}
```

Satisfies the principle — the server reads data and knows no types — **without needing the `formats`
table populated**. Far smaller than "make formats real data", and it reuses a row already in hand.

### Three rules this carries

1. **Writing `authVocabulary` requires `grant` on the pattern row.** Otherwise a client declares
   `view-page → ['*']` and escalates. The same guard, applied to the declaration rather than the grant.
2. **Which map applies to an inherited grant:** the one belonging to the pattern in the chain of **the
   row being judged**, not the row the grant sits on. A site-level `view-page` grant therefore means
   "read wherever `view-page` exists", interpreted per pattern.
3. **An unknown verb maps to nothing.** A grant naming a verb the vocabulary does not declare confers
   no structural access — same behaviour as a missing map. Fails closed.

**Fallback if the pattern-row write proves blocked:** write-time expansion with the map duplicated
server-side for the migration only. Avoid unless forced — two sources of truth for the thing most
likely to be wrong.

## Plan (after the decisions)

### Phase A — the columns and the resolver
- [ ] `columnExists(schema, table, column)` on both adapters, mirroring `tableExists`
- [ ] `authCapability(app)` — per-table, cached, warns once when absent (model: `hasChangeLog()`)
- [ ] `auth jsonb` **and `parent_id bigint`** in an **explicit** migration script (NOT the always-run
      `migrate_dms_core.sql`) + the SQLite twin, and in `buildCreateTableSQL`, with an
      `(app, parent_id)` index
- [ ] backfill `parent_id` from the four encodings; leave split rows null (their type carries it)
- [ ] derive `parent_id` from `data.parent` on write, in the controller — one place, no client
      change, and a no-op when the column is absent
- [ ] a reconcile query that reports drift, orphans and cycles
- [ ] backfill from `data->'authPermissions'`; verify a sample across apps
- [ ] `effectiveAuth()` + per-request memo, with the `data` fallback
- [ ] the verb mapping (`view-page` → `read`; `edit-*`/`delete-*` → `edit`; `*` → both) in ONE
      place, and `can(user, row, 'read' | 'edit')` as the only question the rest of the server asks
- [ ] the blank-row default encoded as data, not as scattered `|| {}` truthiness: **no auth → read
      allowed, edit denied**
- [ ] unit tests over the ancestry walk: every kind in `cli/docs/TYPES.md`, `parent_id` present and
      absent (the type-path fallback), a row whose ancestor is missing (must deny, not throw), and a
      cycle (must stop at the depth cap)

### Phase A2 — make `parent_id` visible to clients
- [ ] add `parent_id` to `DATA_ATTRIBUTES`, gated by the capability probe
- [ ] request it in the loaders that build page trees and section lists
- [ ] one `parentIdOf(row)` accessor handling both stored shapes; replace the five call sites above
- [ ] the Orphans lens becomes a query rather than a client-side scan (optional, but it is the
      proof the edge is real)

### Phase B — reads through one choke point
- [ ] route every existing gate in `dms.route.js` through it; delete the per-kind branches
- [ ] extend to the `uda` read paths (the original Phase 3)
- [ ] `length` returns the authorised count
- [ ] split-row types gated for the first time — dataset rows and chat messages

### Phase C — sync
- [ ] `/sync/bootstrap` and `/sync/delta` filter by the same predicate
- [ ] WebSocket: identify the subscriber, filter `notifyChange` per client (decision 5)
- [ ] re-check the chat live tail end to end: a non-member must not receive a private channel's
      broadcasts, not merely fail to render them

### Phase D — writes
- [ ] create / edit / delete gated behind a flag, default off — a blank row denies `edit`
- [ ] an audit script: for a given app, which rows would become uneditable if the flag were turned
      on, and who holds `edit` today. Run it per site before enabling, because the answer on a site
      with no grants is "everyone loses editing"
- [ ] decide the CSRF guard's fate (`X-Requested-With`, currently commented out in `src/index.js`)

## Testing Checklist

- [ ] **The whole suite passes against an unmigrated schema** (columns dropped), and again with the
      columns present but unbackfilled. The unmigrated run is the one that matters — it is the state
      every existing database is in
- [ ] A server WITH the columns and one WITHOUT can read each other's rows (an older server must not
      choke on a row carrying `auth`, and a newer one must read `data.authPermissions`)
- [ ] A split table created after the change has the columns while the app's main table does not —
      the per-table capability check holds

- [ ] A non-member cannot read a private channel's messages **through `/graph`**, not just in the UI
- [ ] A non-member cannot read them through `/sync/bootstrap`, `/sync/delta`, or the WebSocket
- [ ] A dataset view restricted at the source is unreadable through the `uda` routes
- [ ] `length` and the rows actually returned agree, for every listing route
- [ ] An existing site with `data.authPermissions` and no `auth` column value behaves exactly as
      before (the fallback), before and after backfill
- [ ] A row whose ancestor chain is broken (orphan type) denies rather than throwing
- [ ] The `auth` pattern stays publicly readable — the login page must always load
- [ ] A blank row is readable by an anonymous caller and **not** editable by one (the two defaults,
      asserted separately — they are the model's whole shape)
- [ ] With the write flag OFF, every write that works today still works
- [ ] Performance: a 500-row listing resolves ancestors once; measure against a 377k-row
      `data_items` (the trigram index exists for the leading-wildcard type lookups the walk uses)

## Log

- **2026-10-26** — Checked the design against chat before implementation. Found that a message does
  **not** inherit from its channel under the type-path walk (it resolves to the shared source), and
  that two verbs cannot separate posting from administering a channel. Both written up above with
  options; the verb question wants deciding before the resolver is written.
- **2026-10-26** — Owner: test against **copies of production apps** (`mitigat-ny-prod` first) via
  the existing `copy-db.js`, and audit every client read of the parent pointer. Inventory taken: five
  read sites across two stored shapes, all in-memory filters rather than queries, plus the
  `DATA_ATTRIBUTES` whitelist that has to carry `parent_id` before any of them can see it.
- **2026-10-26** — Owner: **the migration must be optional by default** — the server runs on an
  unmigrated schema and falls back. Recorded as three independent switches (columns / backfill /
  enforcement), a per-table capability probe modelled on `hasChangeLog()`, the DDL moved out of the
  always-run migration file, and a test requirement to run the suite twice.
- **2026-10-26** — Parent/child inheritance analysed against real rows: parentage is stored four
  different ways, pattern→page/section inheritance works from the type today, page→section does not.
  Proposed adding `parent_id` in the same migration, with the type path as fallback. Pros/cons and
  the three policy questions inheritance forces are in the section above.
- **2026-10-26** — Owner decided the model: **two server-side verbs, `read` and `edit`**, and a
  blank row is **read-allowed, edit-denied**. First cut is reads (Phases A–C). Three smaller
  questions remain open above.
- **2026-10-23** — Written, superseding the per-kind "Phase 3" of the completed task.
