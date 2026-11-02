# Row auth 6: UDA onto the resolver, with an ancestry provider for external sources

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** doing · **Created by:** amuro@albany.edu · **Edited by:** —

Part of [server-side-auth-general.md](./server-side-auth-general.md) (hub). Depends on tasks 1–3. **The last consolidation step.**

## Objective

Bring datasets reads and writes onto the same `resolve` + `can`, so no two surfaces can disagree
about what a grant means.

## Assessment, 2026-10-29 — the approach changed

Measured against the code and against prod before starting. The original plan was "supply an
**ancestry provider** for external sources". That still holds for external sources and is wrong for
internal ones, which turn out to need nothing new at all.

### Two data systems, and only one of them is a problem

| | rows live in | grants live in | key |
|---|---|---|---|
| **internal** (`dmsEnv`) | `data_items` (`:source`, `:view`), data in split tables | the row's JSON | `data.auth_permissions` (**snake**) |
| **external** (pgEnv) | `data_manager.sources` / `views`, data in `gis_datasets.*` | a real **column** | `auth_permissions` |
| datasets pattern | `data_items` | the row's JSON | `data.authPermissions` (**camel**) |

`rawAuthOf` already reads `data.authPermissions || data.auth_permissions`, so both spellings resolve.
(`dama/CLAUDE.md` documents external grants as `statistics.auth`; the code reads the
`auth_permissions` column. One of those is stale.)

### Internal sources already have a correct type-path owner

Measured on prod — the `{id, ref}` entry shape is identical to `draft_sections`:

```json
{"id":750524,"ref":"mitigat-ny-prod+test_meta_forms_env|source"}
```

| pattern shape | a source's type | type path resolves to |
|---|---|---|
| inline `sources` (`prod\|datasets_test:pattern`) | `datasets_test\|source` | **the pattern itself** — instance matches |
| `dmsEnvId` (`prod\|datasets:pattern`) | `test_meta_forms_env\|source` | **the dmsEnv** that lists it |

`isPlausibleParent` passes in both. So no ancestry provider is needed for internal sources — the
resolver finds the right owner for all 76 of them unaided.

**The one missing hop is `pattern → dmsEnv`.** A dmsEnv's type is `{site}|{name}:dmsenv`, so its
type-path parent is the SITE: the chain runs source → dmsEnv → site and skips the datasets pattern
whose grants govern it. That link exists only as the scalar `data.dmsEnvId` on the pattern.

### DECIDED (owner, 2026-10-29): a pattern owns sources only through an env

> "a pattern doesn't own them directly, only through an env that is how it should be"

So the declarations are:

```js
datasets pattern  childRefs: { datasets: { dmsEnvId: 'dmsenv' } }
dmsEnv            childRefs: { dmsenv:   { sources:  'source'  } }
```

**Not** `sources` on the pattern. Pattern `#1499610` carries both a `dmsEnvId` AND a stale inline
`sources` array of 3 that `getSiteSources` ignores; declaring `sources` there would stamp those
three as the pattern's children and record an ownership the system does not honour.

The legacy inline-sources pattern (`#2248246`) keeps working with no declaration at all, because
its source's type path already points at it.

**One blocker, small and contained:** `refIdsOf` understands reference ARRAYS only —
`refIdsOf(1676363)` and `refIdsOf("1676363")` both return `[]`. It needs to accept a scalar id
before `dmsEnvId` can be declared. Pure function, 83 tests already around it.

With that, the chain becomes **source → dmsEnv → pattern → site** and internal datasets stop being
a special case. External sources keep the client-named pattern and the accepted risk below.

### What task 5 learned that changes the risk here

- **Strict defaults are an INVERSION on this surface, not a delta.** `--audit-writes` measured prod:
  `source`, `view`, `symbology`, `data`, `dmsenv`, `theme` are **100% unstated**. `decideSource`
  uses the lenient rule today (nothing configured ⇒ open); row auth refuses. Where dms writes lose
  26% of rows, uda loses all of them. The grant work is task 8's
  ([row-auth-production-cutover.md](./row-auth-production-cutover.md)).
- **The field-verb decision bites hardest here.** `edit-source-permissions`, `edit-source-data` and
  `create-view` all flatten toward `update-source` under five structural verbs — 3 of the 5 field
  cases in the dms differential were already datasets ones.
- **`GRANT_KEYS` does not cover `auth_permissions`.** It is `['authPermissions', 'auth']`, so the
  escalation guard — the one key-sensitive rule row auth keeps — would silently not fire on the uda
  side. Fix it in this task, not after.
- **The spread is 3× worse.** dms writes had 3 import sites; uda decision points touch **9 files**.
- **2 orphan source rows on prod** (`test_meta_forms_env|capacities_v2:source` ×2), listed by no env
  and no pattern — the same leak as components, in the datasets tree.

### `metadata.isEditable` becomes a permission (owner, 2026-10-29)

> "One thing that is sort of assumed initially is that external sources can't be written to, they
> are read only. We recently added outside of auth metadata for if a source is editable. I think we
> want to change that to a permission."

`metadata.isEditable` is a boolean doing a permission's job, and the code half-says so already:
`uda.route.js:894` calls the client's copy *"a UX convenience, not a trust boundary"*, and
`resolveEditableTable` (`uda.controller.js:1199`) re-derives it server-side on every write. Replace
it with **`edit-source-data`** so there is one mechanism rather than a flag beside a permission.

**The PK requirement stays where it is.** "Is there a resolvable primary key" is a physical fact
about the table, not an authorization question; `resolveEditableTable` keeps checking it
independently. Removing a PK clears editability for a reason that has nothing to do with grants.

#### This makes strict defaults the RIGHT answer here, not a risk

Measured 2026-10-29 across every configured pgEnv:

| pgEnv | sources | `metadata.isEditable = true` |
|---|---|---|
| `hazmit_dama` | 13,388 | **3** |
| `npmrds2` | 451 | **0** |
| `wcdb-dama` | 8 | **7** |

**13,837 of 13,847 external sources are read-only, and that is the long-term norm** — "writes need a
grant" and "external sources are not writable" are the same statement. The earlier worry that strict
defaults would be catastrophic for datasets was measured on the INTERNAL side (`data_items`), where
editability *was* the norm. Those are two different populations and they need opposite treatment.

#### UDA is dual-system THROUGHOUT — corrected 2026-10-29

An earlier revision of this doc claimed "task 6's data-write surface is external only". **That was
wrong**, taken from a route comment rather than the code. `uda.controller.js` branches on `isDms` in
~15 places and serves both systems almost everywhere. Only **three** operations are external-only:

| | |
|---|---|
| `createView` | `uda.controller.js:705` |
| `setPrimaryKeyColumn` | `:1065` |
| `resolveEditableTable` → `uda.data.create/edit/delete` | `:1185` |

`uda.sources.update` and `uda.views.update` are `if (isDms) { …DMS row… } else { …data_manager… }`
— they write INTERNAL sources too, under `update-source`. So the 76 internal `:source` rows on
prod, all unstated, sit squarely inside task 6's write surface. The internal sweep is more
important than the external one, not less:

| | writes it covers |
|---|---|
| **internal** (`data_items`) | source + view metadata (`uda.sources.update`, `uda.views.update`, setIndex, rules, delete). Row data goes through `dms.data.*` and is already under task 5. |
| **external** (pgEnv) | all of the above **plus** view creation, PK setting, and row writes (`uda.data.*`) |

This is also the clearest argument for the owner's "one internally consistent system" steer: ~15
`isDms` branches in the controller is the duplication, and auth should not add a sixteenth.

#### The sweep, named rather than sized

- **External, must keep editing** (grant `edit-source-data`): `hazmit_dama` #1515 *test shaun*,
  #12453 *MitigateNY Mitigation Actions*, #13824 *Actions Cleaned (alignment sandbox)*; **all of
  `wcdb-dama` except #14** — WCDB's entire model is author-edited datasets, so it is the app that
  must not break. 10 rows in total.
- **External, read-only**: the remaining 13,837 need nothing. Strict defaults already say no.
- **Internal** (`data_items` `:source`): 76 rows on `mitigat-ny-prod`, **100% unstated**, where
  editable WAS the norm. These need grants written before any flip. Small enough to enumerate.

Total sweep is under 100 rows, and `--audit-writes` re-run is the proof.

#### Two gaps that block the conversion

- **`edit-source-data` is not in `LEGACY_IMPLIES`** — it confers nothing structurally, so grants
  written with it would be inert and the sweep would silently not work. Must be added with this.
- **`GRANT_KEYS` is `['authPermissions', 'auth']`** and does not cover `auth_permissions`, so the
  escalation guard would not fire on the uda side.

#### And the vocabulary gap behind all of it

> "we don't have a super clear vocab setup in the datasets pattern and we haven't really set
> permissions on sources before in the way we are now"

The datasets pattern's `authVocabulary` is what should declare these verbs and their scopes
(`view-source` / `update-source` / `create-view` / `edit-source-data` / `edit-source-permissions`),
the same way the page pattern declares `edit-page` under `descendants`. Until it does,
`legacyVerbs.js` is the shim and `edit-source-data` is missing from it. Declaring the datasets
vocabulary properly is a prerequisite for this task, not a follow-up — it is also what lets a
source's grants be written SCOPED, which is
[row-auth-scoped-grants.md](./row-auth-scoped-grants.md).

## BUILT 2026-10-29 — behind `DMS_UDA_GATE`, default `kind`

`sourceAuth.js` / `readAuth.js` keep their kind implementation whole; each gained one delegation.
`test-source-auth.js` is **50/50 unchanged** on the default flag.

| | |
|---|---|
| **`routes/uda/rowSourceAuth.js`** *(new)* | `udaGate()`, `mergedAuthForSource` (the only `isDms` branch), `decideSourceRow`, `decidePatternRow`, `decideFromRow`, `holdsAny` |
| `uda/sourceAuth.js` | `isUserAuthedForSource` + `isUserAuthedForPattern` — one ternary each |
| `uda/readAuth.js` | `decideFrom` — one early return |
| `dms/legacyVerbs.js` | `edit-source-data: ['read','edit']` — was missing |
| `dms/rowAuthGate.js` | `GRANT_KEYS` += `auth_permissions`, exported |
| `dms/parentId.js` | `refIdsOf` accepts a single id and a single `{id, ref}` object |
| `dms/rowAuthCaps.js` | the no-`parent_id` message is `info`, not `warn` |
| `patterns/datasets/datasets.childRefs.js` *(new)* | `{ pattern: { dmsEnvId: 'dmsenv' } }`, registered in `patterns/index.js` and the emitter |
| `tests/lib/differential.js` *(new)* | the differential runner, now shared by both gates |
| `tests/test-row-auth-uda-diff.js` + fixture *(new)* | **1 disagreement, pinned** |

### Things the plan got wrong, corrected by building it

- **The datasets vocabulary was already complete.** `datasets.authVocabulary.js` already declares
  `edit-source-data` with `implies: ['read','create','edit','delete']`, scoped under `descendants`.
  The gap was only in `legacyVerbs.js`, the shim for grants on patterns that have not synced.
- **`GRANT_KEYS` is not needed by uda.** `uda.route.js:54-62` already asks for
  `edit-source-permissions` when a patch carries grants, so the guard arrives through the verb
  table. Adding `auth_permissions` to the list is still right — an INTERNAL source row carries its
  grants at `data.auth_permissions`, so a `dms.data.edit` on one now requires `grant`.
- **`childRefs` is ONE entry, not two.** `source → dmsEnv` and `view → source` already resolve by
  type path (both parents carry an instance name). Only `dmsenv → pattern` does not, because a
  dmsEnv's type names the SITE. Declaring the others would restate the type path and could go stale.
- **The read path needs no queries and no `isDms` branch.** `readAuth.decideFrom` is synchronous off
  a pre-loaded snapshot that already holds both chain levels, normalised for internal and external
  alike. `decideFromRow` mirrors it exactly — `mergeAuthChain([patternAP, sourceAP])` + `verdict`.

### Two bugs the suite caught in the delegation, not the judge

1. The first delegation returned `true` for anything not allowed under `log`. `log` means *today's
   rule still decides and may still DENY*, not "allow everything". Now a one-ternary delta inside
   kind's own body, so the mode handling cannot drift.
2. `legacy` was doing the lookup and then discarding it, which also warmed a capability probe whose
   `console.warn` a warning-counting test read as a would-deny. `legacy` now short-circuits before
   any lookup, and the probe message is `info`.

### The one pinned difference

`log: a granted request logs nothing` — a user holding `update-source` on the PATTERN is refused by
row auth, because the chain is `source → dmsEnv → site` until the env carries a `parent_id`. It
**fails closed**. The declaration above is what closes it; the test fixture is an unmigrated sqlite
table with no `parent_id` column, so it cannot close there — the real check is `--audit-writes` on
a migrated app.

### `tests/test-row-auth-uda.js` — 12 cases, and it found THREE bugs

Written to verify the `dmsEnvId` declaration, because nothing else could: the clone has the datasets
pattern but **no dmsEnv rows**, and the differential's fixture is unmigrated. It runs end to end on
a disposable, *migrated* sqlite table. All three bugs were silent — statements that matched no rows,
which is not an error.

1. **The child-type predicate missed every instanced kind.** `stampChildren` built
   `${container}|${childKind}` = `prod|dmsenv`, but a dmsEnv is `prod|test_env:dmsenv`. The exact
   `=` matched only instance-LESS kinds (page, component, page-edit) — so the declaration stamped
   nothing. Now `(type = $a OR type LIKE $b ESCAPE '\\')`, pinning CONTAINER and KIND in both
   shapes; `_`/`%` escaped, since instance names routinely carry underscores. Fixed in all three
   statements (`stampChildren`, `sweepRemovedChildren`, `sweepAllChildren`) via `childTypeParams`.
   **The capture bound is unchanged** — only the instance segment is free, and an instance is a
   name, not a scope.
2. **The declaration lookup looked one level too high for a pattern row.** `childRefsForType` keys
   on `getParent(type)`, which for `prod|datasets:pattern` is the SITE. A datasets pattern owning
   its env is the first case where an owner is itself a pattern, so the lookup found nothing. Now
   `getKind(type) === 'pattern' ? getInstance(type) : getParent(type)`.
3. **It cached the `null`.** The pattern's own create probes before the row exists, so "no
   declaration" was memoised and every later save of that pattern skipped stamping. Now a null is
   re-asked and only a found declaration is cached. **Third time a memoised absence has bitten this
   work** — `rowAuthCaps` latching "unmigrated" is the same shape, twice.

The test also pins the inverse: clear the env's `parent_id` and the pattern grant stops reaching
the source, which is what the one pinned differential entry describes.

**A fixture detail worth keeping:** the test MIGRATES its table (writes `auth` with vocabulary,
childRefs and grants) rather than only adding the column. A half-migrated table — column added,
nothing backfilled — makes every row resolve to empty, because the projection stops selecting
`data` the moment `auth` exists. That is a real deployment hazard, not a test artifact.

### RESOLVED 2026-10-29 — an env may have several parents, so the chain is BUILT, not walked

> "I think an env can have multiple parents" (owner)

That settles it, and it rules `parent_id` out for envs: **one column cannot hold two parents**, and
kind auth has always UNIONED the grants of every owning pattern
(`sourceAuth.readInternalSource` → `unionAuthPermissions`). A single-parent walk would have picked
one and silently dropped the rest. Measured on `rowauth-test`: `datasets` #1499610 and `qa` #2860547
both name env 1676363.

**The `childRefs: { pattern: { dmsEnvId: 'dmsenv' } }` declaration is WITHDRAWN** — deleted from
`datasets.childRefs.js` (file removed), `patterns/index.js` and the emitter. It was unsound twice:

- `childRefs` is keyed by row KIND, and every pattern TYPE shares the kind `pattern`, so a
  datasets-specific declaration applied to **every pattern row in the app** — which is how `qa`
  came to claim the env;
- the runtime and the migration read the declaration from different places (`childRefsForType`
  from the owner's own pattern; `mergeChildRefs` app-wide by kind), and nothing had exposed the
  split before because only one pattern type had ever declared.

It was also a **prod data-corruption risk**: on prod env 1676363 exists, and the multi-owner repair
would have DUPLICATED it. Caught by `--verify-parents` going CLEAN → 1 drift, which is what that
check is for.

**What replaced it.** `mergedAuthForSource` builds the chain explicitly, and internal and external
now produce the same two levels:

| | chain |
|---|---|
| internal (`app+env`) | `[union of the patterns that LIST this source, the source's own grants]` |
| external (pgEnv) | `[the client-named pattern, the source's own grants]` |

Closer to the owner's "one internally consistent system" than the walk was: the only difference left
is *where the pattern level comes from*.

### Two more bugs the rewrite surfaced

1. **Verbs were never expanded.** A hand-built chain skips what `authOf` does for DMS rows, so a
   grant of `update-source` never became `read`+`edit` and every verdict was a refusal. Each level
   is now expanded before merging — against ITS OWN pattern's vocabulary, since two patterns may
   declare the same verb differently, and unioning raw strings first would lose that.
2. **`SELECT auth` throws on an unmigrated table.** `no such column: auth`, caught by
   `decideSourceRow`, which fails closed — so every request was denied with `lookup failed: …`,
   reading as a would-deny on a request that should have been granted. The column is now probed
   (`authColExpr`) and selected as literal `NULL` when absent.

### Result: `test-source-auth.js` is 50/50 under BOTH gates

`tests/fixtures/row-auth-uda-expected-diff.json` is **empty** — zero pinned disagreements. That is
not "row auth equals kind auth": two differences exist that this suite does not exercise, and the
fixture's README names them (the clamp, and strict defaults). A new name appearing there is a
finding.

`tests/test-row-auth-uda.js` — **16 cases**, rewritten for the chain model, including the multi-
pattern union and the clamp (a source may NARROW what its patterns gave a principal, never widen).

### Not done### Not done

- The sweep: 10 external (`hazmit_dama` #1515/#12453/#13824, `wcdb-dama` all but #14) + prod's 76
  internal `:source` rows. Needs `--sync-vocabulary` to land the new `childRefs` first.
- Retiring `metadata.isEditable` in favour of `edit-source-data`.
- The pinned differential entry stays until a MIGRATED app proves it closed — the fixture it runs
  against cannot.

## The plan (2026-10-29)

### The whole UDA surface is THREE decision points

17 files import `sourceAuth` / `readAuth`, but almost all of them take helpers (`requireUser`,
`requestUserId`, `requireReader`). The decisions funnel:

| file | function | callers |
|---|---|---|
| `uda/sourceAuth.js` | `decideSource` | **one** — `isUserAuthedForSource:286` |
| `uda/sourceAuth.js` | `decidePattern` | **one** — `isUserAuthedForPattern:302` |
| `uda/readAuth.js` | `decideFrom:150` | `allowSourceRead`, `allowViewRead`, `filterReadableSources`, `holdsOnSource` |

Every Express and Falcor wrapper — `requireSourcePermission`, `authorizeSourceWrite`,
`authorizePublish`, `authorizeViewAction`, `holdsSourcePermission`, `requirePatternPermission` —
goes through those. So this is **3 insertion points, not 17 import swaps**.

**That changes the recommendation made earlier in this doc.** For dms writes the call sites imported
`assertDataWrite` directly, so swapping the import was the smallest move. Here it is not: a
three-line delegation at the head of each decider leaves the kind implementation whole and is
reversible by deleting three lines, where 17 import swaps would touch files that have nothing to do
with the decision. Worth the owner's nod, since it means editing `sourceAuth.js` / `readAuth.js`
rather than leaving them untouched as `dataAuth.js` was.

### What gets created — ONE new file, and it lives in `routes/uda/`

**`routes/uda/rowSourceAuth.js`** *(new)*. Corrected 2026-10-29: an earlier revision put this in
`routes/dms/` as `udaChain.js`, which is **backwards**. It has to read `data_manager.sources`,
pgEnv configs and `getEssentials` — so putting it under `routes/dms/` would make the generic auth
core `require('../uda/…')`, i.e. the library's own rule about not knowing a subsystem, broken in the
one folder meant to embody it. `routes/uda/*` already requires `../dms/*`; that is the direction.

It exports, with the SAME `{allow, reason}` shape the kind deciders return so each delegation is a
swap and not a rewrite:

| | |
|---|---|
| `udaGate()` | `DMS_UDA_GATE` = `kind` (default) \| `row` |
| `chainForSource({env, sourceId, patternRef, subdomain})` | **the only `isDms` branch in uda auth.** Internal: walk the resolver (source → dmsEnv → pattern → site). External: `[patternAuth, sourceAuth]`, known in one step. |
| `decideSourceRow` / `decidePatternRow` / `allowSourceReadRow` | chain → `mergeAuthChain` → `verdict` |

### `routes/dms/` gains NOTHING for this

The generic decision already exists and already knows nothing about sources — verified:

```js
verdict(mergeAuthChain(chain), user, verb, app)   // → { allow, reason }
```

`verdict` is exported from `rowAuthGate.js`, `mergeAuthChain` from `mergeAuth.js`. The only addition
is exporting `GRANT_KEYS` so uda can apply the same escalation guard (`auth_permissions` → `grant`)
rather than writing a second copy of it.

**This does not weaken task 7's completion test.** The *decision* stays one function, `verdict`. What
varies per system is how a chain is DISCOVERED, which is data access — necessarily per-system, and
the same split that lets `rowAuth.js` walk `data_items` without knowing what a page is.

### What gets changed, and it is small

| file | change | why |
|---|---|---|
| `routes/dms/legacyVerbs.js` | add `'edit-source-data': ['read', 'edit']` | it is missing, so grants written with it are inert — the sweep would silently not work |
| `routes/dms/rowAuthGate.js` | `GRANT_KEYS` += `'auth_permissions'`, and export it | DAMA's column is snake_case; the escalation guard would not fire on uda, and uda needs to apply the same list rather than copy it |
| `routes/dms/parentId.js` | `refIdsOf` accepts a scalar id | `dmsEnvId` is a bare id; today `refIdsOf(1676363)` is `[]`, so the childRef would stamp nothing |
| `packages/dms/.../datasets` | declare `authVocabulary` (scoped) + `childRefs: { datasets: { dmsEnvId: 'dmsenv' }, dmsenv: { sources: 'source' } }` | the vocabulary gap; and it makes `source → dmsEnv → pattern → site` resolve natively |

### Where it gets called

```
uda/sourceAuth.js  isUserAuthedForSource   → if (udaGate() === 'row') return decideSourceRow(opts)
uda/sourceAuth.js  isUserAuthedForPattern  → if (udaGate() === 'row') return decidePatternRow(opts)
uda/readAuth.js    decideFrom              → if (udaGate() === 'row') return allowSourceReadRow(...)
```

All three delegate to a sibling in the same folder (`./rowSourceAuth`), so no import crosses a
boundary it did not already cross.

Three lines. The kind code below each stays exactly as it is and is deleted by task 7.

### Tests

| | |
|---|---|
| `tests/test-row-auth-uda.js` | the row contract for uda, asserted positively — internal chain, external chain, the missing `pattern → dmsEnv` hop, `edit-source-data`, the grant guard on `auth_permissions` |
| `tests/test-row-auth-uda-diff.js` + fixture | the differential against `tests/test-source-auth.js`, every difference pinned with a written reason — same semantics as `test-row-auth-diff.js`: a new disagreement fails, a resolved one is reported |

### Sequence

1. `refIdsOf` scalar + the two childRef declarations → parentage resolves natively.
2. `edit-source-data` into the shim; declare the datasets vocabulary.
3. `GRANT_KEYS` += `auth_permissions`.
4. `routes/uda/rowSourceAuth.js` — the chain builder and the three `*Row` deciders.
5. The three delegations behind `DMS_UDA_GATE`.
6. Both test files; pin the diff.
7. The sweep (10 external + 76 internal), then `--audit-writes` as the proof.
8. Retire `metadata.isEditable` once `edit-source-data` governs it.

Steps 1–3 are independently shippable and useful even if the rest stalls.

### Recommended approach: repeat task 5's shape

It worked, and it left the other author's area untouched.

1. **Declare the datasets vocabulary** on the datasets pattern, scoped, incl. `edit-source-data`.
2. **Add `edit-source-data` to `LEGACY_IMPLIES`** (`['read', 'edit']`) for grants written before it.
3. `refIdsOf` accepts a scalar id; declare `dmsEnvId` on the pattern and `sources` on the dmsEnv.
4. Fix `GRANT_KEYS` for `auth_permissions`.
5. Leave `sourceAuth.js` / `readAuth.js` alone.
6. Add the uda surface to `rowAuthGate.js` — already task 7's destination.
7. `DMS_UDA_GATE=kind|row`, default `kind`.
8. A differential against `tests/test-source-auth.js`, every difference pinned with a reason, same
   as `tests/test-row-auth-diff.js`.
9. The sweep above, then `--audit-writes` as the proof.
10. Retire `metadata.isEditable` once `edit-source-data` governs it — client toggle
    (`datasets/pages/dataTypes/default/admin.jsx:191`) becomes a permission edit.

### Correction to this task's own completion test

"A `grep` for auth decision points finds one module" **cannot be satisfied by task 6**, because
`sourceAuth.js` stays in place exactly as `dataAuth.js` did. Deleting the kind side is task 7's job.
Judged against its original wording this task would read as failed when it is not.

### Open for the owner

Is task 6's goal **"ready to flip"** or **"built and provably equivalent, flipped only after task
8's grant work"**? Given datasets are 100% ungranted on prod, the strict-default inversion is either
a blocker or a documented diff, and that is a decision rather than something the code settles.

## The caveat this task exists to handle (external sources only)
## What changes

- `sourceAuth.js`'s `decideSource` / `decidePattern` keep their lookups and hand the ancestry to
  `resolve`; the verdict comes from `can`.
- `readAuth.js` likewise.
- Internal sources (`app+instance`) are ordinary `data_items` rows and use `parent_id`.

## Watch for

The branch's **accepted risk** stands and is not this task's to re-open: anyone holding a grant on
*any* datasets pattern can name it and inherit its grants on an external source
([permissions-server-source-auth-core.md](./permissions-server-source-auth-core.md), decision 2).

## Done when

A `grep` for auth decision points finds **one module**. That is the hub's completion test, and this
is the task that makes it true.


## `decideSourceRow` fails closed on an unresolvable chain (found 2026-10-30, live run)

`row-auth-uda-expected-diff.json` is EMPTY and `test-source-auth.js` is 50/50 under both gates. The
differential still missed this, because every case in it names a source whose chain resolves. The
first anonymous page load in a real browser found it.

### What was observed

`chenango.localhost/the_plan/jurisdictional_annexes/select_jurisdiction`, logged out, renders
**4,768 characters under `enforce` against 16,649–17,056 under `legacy`** — 4 runs each, and the
`enforce` figure is identical every time, so this is not the stale-fetch race. 327 lines of public
content disappear: the jurisdiction narrative, the profile, the building-stock and critical-facility
tables. The jurisdiction's name never resolves either, so the dropdown shows the bare GEOID.

Reduced to one request — same view, same options string, same server:

```python
paths = [["uda","mitigat-ny-prod+jurisdictions","viewsById",1346450,"options",opts,"length"]]
```

| caller | mode | `length` |
|---|---|---|
| anonymous | **enforce** | **0** |
| signed in (AVAIL, LHMP Template Editor) | enforce | 1662 |
| anonymous | legacy | 1662 |

### The mechanism — confirmed, not inferred

My first reading of this blamed `rowSourceAuth.js:245` (`if (!got.ok) return { allow: false }`,
an unresolvable chain failing closed). **That was wrong.** Reading code to choose between candidate
mechanisms was the mistake; the server states its reason if you run it in `log` mode:

```
[read-auth] would-deny data mitigat-ny-prod+jurisdictions/1346449 user=anon groups=
reason=missing view-source or download-source or update-source or edit-source-data or ...
```

Not "source not found", not "is in no datasets pattern". The chain **resolved**. This is an ordinary
grant decision, and the read path is `allowViewRead → allowSourceRead → decideFrom → decideFromRow`,
never `decideSourceRow`. (A related correction: an earlier query of mine found "0 datasets patterns"
in `mitigat-ny-prod` because it read `dms.data_items`; this config is **per-app split**, so prod is
in `dms_mitigat_ny_prod`. The patterns were there all along.)

What is actually true, from the right schema:

| | |
|---|---|
| `dms_mitigat_ny_prod` | **unmigrated** — no `auth`, no `parent_id` |
| owning pattern 1499610 `Datasets` | `data.authVocabulary` = **absent**, grants `public: ["view-page"]` |
| source 1346449 | own grants `null` (unstated) |

`holdsAny` compares **structurally**: it maps each required permission through `verbsFor` and asks
`verdict` for the structural verb. `view-source` → `read`. The datasets vocabulary does say
`view-page` implies `read` for descendants — **but that vocabulary lives in the pattern ROW, and
this app has none**, so `impliesMaps` is empty and `view-page` is never expanded into anything.
Public therefore holds a string that confers no structural verb at all.

`AVAIL` holds `["*"]`, and a wildcard is honoured without any vocabulary. Hence:

- anonymous → no structural verb → denied → `length: 0`
- AVAIL → wildcard → allowed → `length: 1662`
- legacy → `legacyAllows` short-circuits on `isDmsEnv(env) ⇒ true`; **nothing was ever checked**

### Why this is the dangerous shape

**An app with no vocabulary silently voids every grant written as a named verb, while leaving every
`*` holder untouched.** Admins and AVAIL see a fully working site. Only the public loses access, and
only on data-backed sections, with no error anywhere — the page renders its headings and empty
tables. That is why four browser runs were needed to see it at all, and why no suite caught it:
`test-source-auth.js` and the differential both build rows that have a vocabulary.

This is the dependency task 8 step 4 (`--sync-vocabulary`) exists for, but it is **broader than the
runbook currently states**: the vocabulary must be synced for every app whose sources are
*referenced*, not only the app being flipped. A page can name a source in another app, and that
app's migration state then governs what the public can read.

### Before this is called fixed

- [x] ~~Trace the caller-dependent branch~~ — there was none; `*` is honoured without a vocabulary, named verbs are not.
- [ ] Pre-flight check in `migrate-row-auth.js`: per app, count grants naming verbs where no vocabulary exists — "these principals confer nothing on flip". Runnable read-only against prod.
- [ ] Add the no-vocabulary case to `test-source-auth.js` and the differential: a pattern granting a NAMED verb to `public`, on an app with no vocabulary row —
      the whole point of that harness is that it should have caught this.
- [ ] Re-run the live page and compare rendered length against the `legacy` figures above, which is
      the only check that would have caught it this time.


## Root cause, after the cross-app move (2026-10-30)

The cross-app reference was a **confound, not the cause**. With it removed the denial is identical,
now inside the app's own namespace:

```
[read-auth] would-deny data rowauth-test+jurisdictions/1346449 user=anon groups=
reason=missing view-source or download-source or ...
```

### The two UDA auth paths disagree about vocabulary expansion

| path | builds grants via | expands named verbs? |
|---|---|---|
| `decideSourceRow` → `internalSourceChain` | `expandLevel(…, impliesMaps(vocabularyOf(row)))` | **yes** (`rowSourceAuth.js:206-211`) |
| `decideFromRow` → `readAuth.snapshot` | `unionAuthPermissions(owning)` | **no** (`readAuth.js:111`) |

`holdsAny` expands the REQUIRED permission into structural verbs (`view-source` → `read`) and then
asks `verdict` for each. The snapshot hands it grants that were never expanded, so a structural verb
is compared against a raw named string and never matches. Proven against the live clone row:

```
vocabulary present on pattern 1499610 : true
raw      public grant                 : ["view-page"]
EXPANDED public grant                 : ["view-page","read"]     ← what the other path would use
```

`AVAIL: ["*"]` is unaffected because a wildcard needs no expansion — which is exactly why this is
invisible to anyone who holds one.

**Why the differential missed it:** `test-source-auth.js` and
`row-auth-uda-expected-diff.json` exercise `decideSourceRow`. The READ path that every page actually
uses is `allowViewRead → allowSourceRead → decideFrom → decideFromRow`, and nothing covers it.

### The fix

`readAuth.snapshot` must expand each owning pattern's grants against that pattern's own vocabulary
before unioning — the same three lines `internalSourceChain` already runs — and expand the source's
own grants with the resulting maps. The snapshot already loads the pattern rows, so this adds no
query; it needs the `auth` column in that SELECT where it is not already fetched.

**Not applied yet.** It loosens an auth path, so it wants a failing test first: an anonymous caller,
a datasets pattern granting `public: ['view-page']`, a vocabulary present — asserted through
`allowSourceRead`, not `decideSourceRow`. That test is the thing whose absence allowed this.


## Implemented 2026-10-30 — owner's rules for source reads

Three changes, all in `routes/uda/readAuth.js` plus one line in `routes/dms/rowAuth.js`.

**1. The `auth` column is the system of record here too.** `loadInternal` read grants from `data`
only; a grant written to the column and not mirrored into `data` was invisible. New `ownAuthOf()`
applies `rawAuthOf`'s precedence — column wins, but a column holding only DECLARATIONS
(`vocabulary`, `childRefs`, `view`) names nothing and falls through to `data`, so an explicitly
empty `{groups:{},users:{}}` still reads as "someone cleared the grants". Measured first: on the
clone, 0 rows had column-only grants, so this was latent, not live — it goes live the moment the
Access editor writes the column as the record.

**2. Verbs are expanded against the pattern's vocabulary.** `internalSourceChain` did this;
the snapshot path never did, so `holdsAny` compared the structural `read` against the raw string
`view-page` and never matched. `rawAuthOf` now also strips `view`.

**3. Source reads default open (owner, 2026-10-30).** *"If all auth settings in `auth` or the `data`
auth attributes are null then view/read should be true and edit should be false."* Grants otherwise
work exactly as before — DAMA scopes an upload to its creator with real grants, and those keep
working. New `decideRead()`:

| source state | read |
|---|---|
| states nothing anywhere | **allowed** |
| `auth: { view: false }`, nothing else | refused (its own grantees and `${app} Admin` only) |
| states its own grants | judged as always; the pattern may still LEND, never gate |

A datasets pattern's grants can no longer DENY a source read. `view-page` was never meant to be the
verb that opens a source. Writes are untouched — they still resolve the whole chain.

`decideRead` is separate from `decideFrom` on purpose: `holdsOnSource` asks `decideFrom` about WRITE
permissions, where pattern grants must still count.

### Verification

- `test-read-auth.js` 25 → **30 cases, 30 passing**, including the live bug reduced to a fixture
  (blank source under a pattern granting only `view-page`), `view: false` with and without own
  grants, and column-beats-stale-`data`.
- One expectation deliberately changed: *"a source in no pattern is refused"* → **readable**. Being
  unreferenced is the absence of a statement, not a statement. Orphanhood still denies writes.
- Everything else green: `npm test` exit 0 · `source-auth` 50/50 under **both** gates ·
  `row-auth-reads` 20 · `row-auth-uda` 16 · `row-auth-gate` 21.
- Under `DMS_UDA_GATE=row`, `test-read-auth.js` went from **14/30 to 28/30**. The 2 that remain fail
  with the old read rule too — pre-existing row-gate gaps in `holdsOnSource` redaction, not ours.

### Live result, and what is still missing

Anonymous, full `enforce`, same page: **4,768 → 13,709 characters** (legacy baseline 16,657). The
dataset reads flow — `uda.rowauth-test+jurisdictions` now returns 2.65 MB where it returned a
`length: 0`.

**~2,950 characters / 286 lines still missing**, and the trail is concrete: the page still issues two
`uda.mitigat-ny-prod+…` requests although **zero clone rows contain that prefix**. They come from the
other place env strings live:

| table (pgEnv `hazmit_dama`) | rows mentioning `mitigat-ny-prod+` |
|---|---|
| `data_manager.sources` | **12,977** |
| `data_manager.views` | **11,894** |

`app-scope-dmsenvs.js --check` scans an app's `data_items` and reports CLEAN, because this is outside
it. **This needs an owner decision, not a patch:** a dmsEnv reference is app-scoped by the new rule,
but it is stored here inside a pgEnv that is deliberately cross-app. Either the check must cover DAMA
metadata for every pgEnv an app uses, or these references mean something different from the ones in
`data_items` and are legitimate.


## Where the last of the gap was (2026-10-30) — and it is DATA, not code

Two separate things were conflated. Both are now settled.

### 1. The clone was still naming the prod app — in a form the `+` regex could not see

`--check` reported CLEAN while **14,508 references remained**, because both the check and the rewrite
required `{app}+`. The app half is also stored on its own under an `app` key, and the CLIENT composes
the env from it:

- `data.app` on every copied source row (463 rows)
- `sourceInfo.app` / `externalSource.app` inside section state, **escaped**, because that state is
  JSON encoded inside JSON

That is what kept `uda.mitigat-ny-prod+jurisdictions` being requested from an app whose rows no
longer contained the string `mitigat-ny-prod+` anywhere. Both the check and the rewrite now handle
the bare `"app": "…"` form, escaped or not, and only ever rewrite that KEY — the 244 remaining
mentions are S3 image URLs (`…/img/mitigat-ny-prod/…`) and must not be touched. Catching the bare
form also surfaced a third app, `dms-site`, with 4 references.

**It did not change the rendering**: 13,709 before the rewrite, 13,709 after. Real, worth fixing,
and not the cause.

### 2. The remaining ~2,950 characters are 389 DAMA sources granted to AVAIL only

Re-measured on the CURRENT data, so the comparison is honest (the earlier baseline predated the
adopt):

| mode | anonymous |
|---|---|
| legacy | 16,620 – 17,037 |
| **enforce** | **13,709**, every run |
| log | 16,616 — renders, and names what it would refuse |

In `log` mode the page logs **389 distinct refusals**, all but one on the external pgEnv:

```
would-deny source hazmit_dama/885  reason=missing view-source      ×389
would-deny source rowauth-test+datasets/2726687                    ×1
```

Every one of them states grants, and the grants are the whole story:

```
auth_permissions = {"users": {}, "groups": {"AVAIL": ["*"]}}
```

AVAIL `*`, public nothing. And across `hazmit_dama`, **0 of 13,390 sources have a NULL
`auth_permissions`** — so the owner's "all null ⇒ read true" default never applies to any of them.
`src/scripts/grant-groups-star-on-sources.js` is presumably how they all came to look like this.

**This is correct enforcement of what the data says, not a defect.** Today it is invisible because
`allowSourceRead` returns `true` immediately under `legacy` — external source reads are not checked
at all. At cutover, every public MitigateNY page backed by a DAMA source would lose that content for
logged-out visitors.

It needs a data decision, not a patch: either grant `public: ['view-source']` on the sources the
public pages read, or clear `auth_permissions` on them so the unstated default applies. The count to
work from is the 389 the page actually touches, not all 13,390.
