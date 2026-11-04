# Row auth: UDA decides through the same six functions as DMS

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

Part of [server-side-auth-general.md](./server-side-auth-general.md) (hub). Follows
[row-auth-uda.md](./row-auth-uda.md) (task 6), which put datasets *behind* the resolver without
changing the shape of what it is handed. Prerequisite for the datasets half of
[row-auth-consolidate.md](./row-auth-consolidate.md) (task 7) Phase 4.

## Objective

`routes/auth/index.js` exports one contract, and `dms.route.js`, `sync.js` and `dama/upload/auth.js`
already decide through it:

```js
assertDataWrite · dataAuthMode · createJudge · planEdit · readBlocked · listingBlocked
```

**UDA should use these same six and nothing else.** Not a wrapper that forwards to
`sourceAuth.js` — the same functions, reaching the same resolver, over data in the same shape.

## The owner's premise (2026-11-02)

> "the auth data for UDA should be in exactly the same shape as the data for dms, basically,
> sources have auth objects which should have a vocabulary which should be uniform across both
> internal and external sources"

That is the whole design. Everything below is what currently stops it being true.

## Why a facade alone does not work — measured, and reverted

An attempt to re-export the datasets surface from `routes/auth/index.js` was made on 2026-11-02 and
**backed out the same session**, because it would have been a switch in name only:

| | count |
|---|---|
| names the UDA routes import today | **11** |
| names the attempted facade block exported | **29** (17 `sourceAuth` + 12 `readAuth`) |
| the DMS contract | **6** |
| decision functions `rowAuth/rowSourceAuth.js` implements | **4** (`decideSourceRow`, `decidePatternRow`, `decideFromRow`, `readsRow`) |

Owner, on the attempt: *"however the surface you just pulled into auth/index for uda is massive."*
Correct — and the size is the symptom, not the problem. The 11 names are three different KINDS of
thing welded into two modules:

| kind | examples | belongs |
|---|---|---|
| decisions | `isUserAuthedForSource`, `allowSourceRead`, `allowViewRead` | behind the switch |
| express middleware that answers the request itself (401/403) | `assertSourcePermission`, `requireReader`, `requirePatternPermission` | shared plumbing, above the switch |
| pure plumbing, no decision at all | `parsePatternRef`, `sourceIdForView`, `readMode`, `redactSourceRow` | shared, never duplicated |

`rowSourceAuth.js` implements none of the eleven. It holds only the four decision cores that
`sourceAuth.decideSource` / `decidePattern` and `readAuth.decideFrom` call themselves when
`DMS_UDA_GATE=row`. **That is why `DMS_UDA_GATE` keeps working under `DMS_AUTH_IMPL=kind`** — the
dispatch lives inside kind auth's files, not in the switch.

## What is actually different, in data

### 1. Three field names for one thing

| row | grants live in |
|---|---|
| DMS pattern | `data.authPermissions` + the `auth` column |
| DMS source (internal) | `data.auth_permissions` + the `auth` column |
| external source | `data_manager.sources.auth_permissions` (a pgEnv column) |

`rowAuthGate.js` already carries the evidence: `GRANT_KEYS = ['authPermissions', 'auth',
'auth_permissions']`. Three spellings in one escalation guard is the divergence being papered over
rather than fixed.

### 2. FOUR chain shapes, three of them hand-built

| | how the chain is built |
|---|---|
| DMS row | `parent_id` walked by `rowAuth.createResolver`, N levels, declared by `childRefs` |
| internal source (row auth) | `rowSourceAuth.internalSourceChain` — HAND-BUILT two levels: `[union of every datasets pattern listing it, the source]` |
| external source (row auth) | `rowSourceAuth.mergedAuthForSource` — HAND-BUILT one or two levels: `[the pattern the REQUEST names (if usable), the source]` |
| internal source / view / data (kind auth) | `dataAuth.resolveOwner` — HAND-BUILT named lookups: `self-source`, `owning-source`, `source-by-slug` |

Only the first is a parent walk. The other three reconstruct a chain per call from reference
arrays, a client-supplied pattern id, or a slug — which is also why `decideFromRow` has to be
handed a pre-built snapshot instead of resolving anything itself.

### 2a. `authRules.js` already proves the rules are expressible as data — for internal sources

Owner, 2026-11-02: *"source and view have entries in the kindAuth authRules.js."* They do, and the
entries are good:

```js
source: { owner: 'self-source',
          ops: { create: { owner: 'datasets-grants', perms: ['create-source'] },
                 delete: ['delete-source'],
                 edit: { byKey: { auth_permissions: ['edit-source-permissions'] },
                         onlyKeys: [{ keys: ['views'], perms: ['create-view','update-source','delete-source'] }],
                         default: ['update-source'] } },
          noChange: ['update-source','edit-source-permissions','create-view'] },
view:   { owner: 'owning-source', ops: { create: { owner: 'source-by-slug', perms: ['create-view'] }, … } },
data:   { owner: 'source-by-slug', appliesWhen: 'split', ops: { '*': ['edit-source-data'] } },
```

`authJudge.js` interprets that with no knowledge of a source at all. **So the datasets rules are
already data, and already uniform with the page rules beside them** — which is most of what this
task is asking for, built and tested on the kind side behind `DMS_DATA_AUTH_JUDGE=data`.

Three things keep it from being the answer on its own:

1. **It covers INTERNAL sources only.** Every source owner resolves through
   `internalSourceGrants(internalEnv(…))`. An external source is not a DMS row, never reaches
   `dataAuth.judge`, and has no entry — so the one population with no vocabulary is also the one
   population the rules do not describe.
2. **`resolveOwner` is the chain, hand-written, in a third place.** The file says so itself: *"the
   owner lookups below are the part the rules can't express."* `self-source`, `owning-source` and
   `source-by-slug` exist precisely because a source has no `parent_id` to walk. Phase 2 gives it
   one — its ENV — and takes the datasets pattern out of the chain entirely, at which point all
   three resolvers have nothing left to manufacture and go.
3. **`source-by-slug` resolves through `controller.getSourceIdBySlug`**, which takes
   `ORDER BY id DESC LIMIT 1` and memoises with no invalidation on source create. Two sources
   sharing a slug therefore route a `:data` row's AUTH to whichever is newest. Recorded on
   `row-auth-production-cutover.md`, where the same lookup misrouted an upload on `rowauth-test`.

**So the reuse is: keep the rules, delete the resolvers.** `authRules.js`'s source/view/data
entries are a head start on the vocabulary half of this task; `resolveOwner`'s source cases are
three more things Phase 2 deletes.

### 3. The vocabulary is not uniform — which is the owner's specific complaint

The verbs exist and are correct: `datasets.format.js:56` declares a full `permissionDomain` with
`implies` (`view-source → read`, `update-source → read,edit`, `edit-source-data →
read,create,edit,delete`, the three capabilities with `implies: []`). What is missing is that this
never reaches a source as a VOCABULARY the way a page pattern's does:

| | vocabulary used to expand its grants |
|---|---|
| DMS row | the nearest ancestor declaring one (`mapsForChain`, leaf → root) |
| internal source | the UNION of its listing patterns' maps (`sourceSnapshot.unionMaps`) — a source has none of its own |
| **external source** | **none.** `mergedAuthForSource` calls `expandLevel(src.auth, null)` when no pattern is named, so the only expansion is `legacyVerbs.js` — the shim |

So an external source granted `view-source` by name, with no pattern named on the request, expands
through the legacy table or not at all. That is the opposite end of the same defect the three
expansion sites in `sourceSnapshot.js` were written to fix.

## What has to change

### Phase 1 — one source of truth for the vocabulary (owner, 2026-11-02)

> "This task should force the vocabulary to be uniform and have one source of truth for that
> vocabulary so that it can be modified."

**The vocabulary is DECLARED in exactly one place and derived everywhere else.** The CONTENT is
already right — `datasets.format.js:56` has every verb with correct `implies`, and `implies: []`
on the three capabilities. What is wrong is where it lives: see Phase 2, "Where the
permissionDomain actually belongs". It moves to `dmsEnvFormat`, the row kind that is actually a
source's ancestor, so the declaration is reachable by the same leaf → root walk every other row
uses. The mechanism for deriving `authVocabulary` from a `permissionDomain` is
[permission-domain-single-source.md](./permission-domain-single-source.md), which this task depends
on rather than duplicating.

**Internal and external sources SHARE ONE VOCABULARY** (owner, 2026-11-02) — not one each,
not one resolved per population. A source is a source. The same verb list, the same `implies`, the
same answer to "does this confer read", whether the rows live in `data_items` or in a pgEnv's
`data_manager.sources`.

That settles what was an open question a draft of this task left hanging. There is no "channel for
external sources" to decide, because there is no separate vocabulary for them to reach — there is
one datasets vocabulary and every source is judged against it.

Also one grant field: a source carries its grants in the same key as every other row, read by the
same `rawAuthOf` precedence (`auth` column first, `data` as fallback). The three-entry `GRANT_KEYS`
is the list of what to retire.

"So that it can be modified" is a requirement, not a nicety: editing one verb's `implies` in the
format must change every decision that verb governs, on every source of either kind, without a
second edit anywhere. If a change has to be made in two files, this phase is not done.

### Phase 1a — the conversion script, and no backwards compatibility

> "The task should create a script that converts old data to the new vocabulary and in cases where
> the old vocabulary reaches the decider it should be treated as null, falling back to the default
> settings. It shouldn't try to be backwards compatible."

**The script.** A sibling of `migrate-row-auth.js`, same contract — dry run by default, `--apply`
to write, a report of what it cannot resolve. It converts stored grants from the old verb set to
the new vocabulary across all three field names and both populations (`data_items` `:source` rows
and `data_manager.sources`). `migrate-row-auth.js --sync-vocabulary <manifest.json>` already writes
the DECLARATION onto rows from a client-emitted manifest; this converts the GRANTS that cite it.
The two are separate passes and must run declaration-first, for the same reason pass 1 precedes
pass 3 there.

**And then the shim dies.** `legacyVerbs.js` is deleted, not demoted. Its own header says it is
"meant to be deleted once every pattern declares its own"; this task is where that happens.
`expandLevel`'s branch goes with it, and the three callers resolve a vocabulary or they resolve
nothing.

**Old vocabulary reaching the decider is treated as NULL — it is not interpreted, not guessed, and
not expanded through a compatibility table.** The decision then falls back to the default rules in
`rowAuthGate.verdict()`: `${app} Admin` passes, nothing stated means read-allowed and write-denied,
anything else is judged on the structural verbs actually present.

⚠ **ONE SUB-DECISION, AND IT DECIDES WHETHER CONTENT GOES DARK.** "Treated as null" has two
readings and they produce opposite outcomes for the same row:

| reading | a row granting `{groups:{Editors:['view-page']}}` and nothing else |
|---|---|
| (a) the VOCABULARY is null — grants stand, expand to nothing | principals ARE stated, so `isUnstated` is false → `can()` finds no `read` → **refused** |
| (b) the GRANT is treated as absent — the row is unstated | falls to rule 5 → **read allowed**, writes denied |

`legacyVerbs.js` measured exactly this population: on a migrated clone, with no mapping, "reads
were allowed on exactly the **28 of 40 sampled pattern rows that carry no grants at all** and
refused on all **12 that do** — because their grants say `view-page`, `edit-page`,
`view-pattern-list`, and none of those is a structural verb." So reading (a) takes the twelve rows
where someone bothered to configure access and makes them unreadable; reading (b) opens them to
everyone.

Neither is "backwards compatible" — that is the point, and it is settled. But the conversion script
is what makes the choice survivable: **run it first and no row should still cite an old verb**, so
the fallback governs only rows the script could not convert, and the script's report is the list of
those rows BEFORE anything is enforced. The owner picks (a) or (b) for that residue; (a) fails
closed and is the safe direction, (b) preserves today's reachability. The script's dry-run output
on `rowauth-test` and on a prod clone is the evidence to pick on, and it must be run before this
phase is called done.

### Phase 2 — the parent is the ENV, and the env grants nothing (owner, 2026-11-02)

The owner's first statement was *"for uda auth, we can consider there is no parent to the source
object"*, then corrected:

> "so I suppose I was wrong a source has a dmsEnv (or pgEnv as a parent) but those things shouldn't
> have any permissions associated with them"

**The correction is the better rule, and it is not the same as "no parent".** A source has a real
parent — its env — so the ordinary machinery works on it: `parent_id` is a column follow,
`mapsForChain` walks leaf → root and finds the declared vocabulary, nothing needs a special route.
What changes is that **the env never states grants**, so merging that level contributes nothing and
the source's own `auth` remains the whole answer for the decision.

Declaration inherits. Grants do not — because there are none above to inherit.

#### What this deletes, and why

The thing that goes is not the parent, it is **the datasets PATTERN being treated as one**:

| deleted | what it was |
|---|---|
| `rowSourceAuth.internalSourceChain` | reverse-looks-up every datasets pattern listing the source, unions their grants |
| `rowSourceAuth.mergedAuthForSource` | the pattern the REQUEST names lends its grants |
| `dataAuth.resolveOwner` cases `self-source`, `owning-source`, `source-by-slug` | the same lookups a third time |
| the `patternRef` / `dms_pattern` lending path | see below |

A datasets pattern is not a source's ancestor. The type path says so — `{env}|{name}:source`, with
the env above it and the pattern nowhere in it — and `getSiteSources` has to run a reverse lookup
through `pattern.dmsEnvId` precisely because the relationship does not exist in the row. Three
separate hand-built chains exist to manufacture an ancestor the data never had.

**This removes a hole the owner already flagged as not a boundary.** `readAuth.js` carries it in
its own header: *"PLACEHOLDER (owner, 2026-10-26): the client picks the pattern, so a caller can
name whichever datasets pattern grants the most."* With the env as parent and the pattern out of
the chain, a client-supplied pattern id confers nothing — the placeholder is gone rather than
documented.

#### Where the permissionDomain actually belongs

> "the one place is tricky because the datasets format is deceptive it doesn't actually control
> anything, the permissions domain should be on the dmsEnv format which should have sources and
> views as descendent children which need to be copied from datasets."

Verified, and the two formats are the wrong way round:

| | `datasets.format.js` | `admin.format.js` `dmsEnvFormat` |
|---|---|---|
| key | `app: "datasets"`, `type: "source"` / `"view"` / `"form-manager"` | `app: "admin"`, `type: "dmsenv"` |
| children | `registerFormats: [view]`, `views` as `type: 'dms-format'` | `registerFormats: []` |
| `sources` | — | `type: "json", default: []` — **a plain blob, not a child declaration** |
| `permissionDomain` | the full verb list, with `implies` | **none** |
| `authPermissions` | declared on `source` and `form-manager` | **none** |

So the structure is declared on a format whose `app` is the literal string `"datasets"`, while the
server resolves a format by `app || '+' || type` (`dms.controller.js:859`) against rows whose app is
the real app and whose type is `{env}|{name}:source`. It drives the Access editor
(`SourceAccessEditor` reads `authAttr?.permissionDomain`) and the server's expansion comes from
somewhere else entirely — which is exactly the deception, and exactly why the verbs shown to an
author and the verbs the server honours have been free to drift.

**Move it.** `dmsEnvFormat` gains the `permissionDomain` and declares `sources` (and through it
`views`) as real `dms-format` descendants, copied from `datasets.format.js`. Then the one source of
truth Phase 1 requires sits on the row kind that is actually the ancestor, and `mapsForChain`
reaches it by walking. This is the open item already recorded on
[permission-domain-single-source.md](./permission-domain-single-source.md) as
*"make `admin.format.js:57-61` `dmsEnvFormat.sources` a real child declaration with a
`permissionDomain`"*; this task is what makes it load-bearing rather than tidy.

#### The format objects this task edits — including what the env does NOT grant

> "still what that parent grants or doesn't grant should be in the updated format objects that this
> task will edit"

**"The env grants nothing" is a DECLARATION, not a rule in the resolver.** `permissionDomain`
already accepts the scoped shape — `SourceAccessEditorChain.jsx:18-19` documents it as
`{ self: [ {label, value, implies}, … ], descendants: [ … ] }`, and `authVocabulary.js` enforces
the split (a verb declared only under `self` confers nothing inside a `descendants` grant, and
vice versa). So the env says what it is by what it declares:

```js
// admin.format.js — dmsEnvFormat
{
  app: 'admin', type: 'dmsenv',
  registerFormats: [source],                 // copied from datasets.format.js
  attributes: [
    { key: 'name',    type: 'text', required: true },
    { key: 'pgEnv',   type: 'text' },        // NEW: which external env this row represents, if any
    { key: 'sources', type: 'dms-format' },  // was: type:'json', default:[] — a blob, not a child
    { key: 'authPermissions', type: 'json',
      permissionDomain: {
        self: [],                            // ← THE ENV GRANTS NOTHING ABOUT ITSELF, said in data
        descendants: [ …the source/view verbs, moved from datasets.format.js… ],
      } },
  ],
}
```

An empty `self` is the whole statement. Nothing in `rowAuthGate` or the resolver needs to know that
an env is special: it resolves the env's level like any other, finds no `self` verbs declared and
no grants stated, and contributes nothing. Change your mind later and the fix is a line in the
format, not a branch in the decider — which is the same test Phase 1 sets for the vocabulary.

Three format objects change, and the task is not done until all three say what they mean:

| format | today | after |
|---|---|---|
| `admin.format.js` `dmsEnvFormat` | `name` + `sources` only; `sources` a json blob; no `permissionDomain`, no `authPermissions`, `registerFormats: []` | declares `sources` as a `dms-format` child, carries the source/view `permissionDomain` with an EMPTY `self`, registers the source format, and gains `pgEnv` so an external env can have a row too |
| `datasets.format.js` `source` / `view` | hold the `permissionDomain` and the `views` child declaration, keyed `app: "datasets"` | the verbs and the child declaration MOVE to the env; what stays is the editor's attribute shape |
| `datasets.format.js` `form-manager` (the pattern row) | declares `sources` as a `dms-format` child and its own `permissionDomain` | keeps `self` verbs that genuinely govern the PATTERN row; stops claiming sources as children, because it is not their ancestor |

**This also answers the `create-source` question flagged below.** A verb granted on the env that
governs what may be made UNDER it is a `descendants` verb by definition, so `create-source` sits in
the env's `descendants` list and the env's `self` stays empty. No special case, and the scope split
is doing the work it was built for.

#### External sources: the env gets a row, the SOURCE still has none (owner, 2026-11-02)

> "I like the idea of giving pgEnvs a dmsRow" … "but it still has to be special shaped because the
> external sources don't have a dmsRow"

**Decided: each pgEnv gets a `:dmsenv` row.** `hazmit_dama`, `npmrds2`, `wcdb-dama` become rows
like any other env, so the level that carries the DECLARATION is uniform — one vocabulary, reached
the same way, for both populations. `dmsEnvFormat` gains a `pgEnv` attribute naming which external
env a row represents; today the four env rows on `rowauth-test` carry only `name` and `sources`.

**And the owner is right that this does not make it symmetric.** An internal source is a
`data_items` row with a `parent_id` column. An external source is a row in
`data_manager.sources`, in a **different database**, with no `type`, no `parent_id`, and no column
follow available to it. Giving the env a row fixes the declaration; it cannot fix the walk.

So one thing stays special-shaped, and this task's job is to make it exactly one:

| | internal | external |
|---|---|---|
| the source's own grants | `data_items` row, `auth` column / `data` | `data_manager.sources.auth_permissions` |
| finding its parent | `parent_id`, a column follow | **the one special case** — see below |
| the parent | a `:dmsenv` row | a `:dmsenv` row (new) |
| the vocabulary | declared on the env | declared on the env — the SAME one |
| the verbs, the grant shape, the merge, the verdict | identical | identical |

**The special case is one function: "which env row is this source's parent."** That is the ancestry
provider [row-auth-uda.md](./row-auth-uda.md) already built the seam for — its title is literally
"UDA onto the resolver, with an ancestry provider for external sources." This task narrows what
that provider has to do rather than inventing a new mechanism.

**It needs no new column and no cross-database id.** A `parent_id` on an external source would
point at a row in another database, which is a reference nothing can validate. It is not needed:
the pgEnv NAME is already in hand at every call site — a caller cannot query an external source
without having named the env to connect to it (`getDb(env)`). So the provider is
`env name → the :dmsenv row whose pgEnv attribute names it`, cached like any other env lookup. The
source stores nothing.

Measure the residue against what it replaces: today the external path has its own chain builder
(`mergedAuthForSource`), its own grant field, no vocabulary at all, and a client-supplied pattern
lending grants. After this, it has one lookup that differs and everything else shared.

**The migration this commits to:** a `:dmsenv` row per pgEnv (three today), plus the `pgEnv`
attribute on the format. It does NOT mean rows for the 13,847 external sources — those stay where
they are, in `data_manager.sources`, which is the whole point of the provider.

#### And the exception lives in `routes/auth/`, not `routes/uda/` (owner, 2026-11-02)

> "even still we can move those exceptions behind the api we are building in the auth folder
> instead of in the code in the uda folder"

**Bounding the exception is not enough; it has to be on the right side of the API.** The one thing
that differs — where a source's grants are stored and how its env is found — is a fact about
AUTHORIZATION, so the auth folder absorbs it and nothing outside learns it exists.

| | before | after |
|---|---|---|
| who knows a source can live in two places | `uda/sourceAuth.js`, `uda/readAuth.js`, `uda/rowSourceAuth.js`, and every route that picks between them | `routes/auth/` only — one provider, one storage reader |
| what `routes/uda/` imports from auth | 11 names across 3 files | **nothing but the six** |
| `isDmsEnv(env)` branches | ~15 in `uda.controller.js`, plus every auth path | none in any auth path |

A UDA route asks `readBlocked({ row, … })` and gets an answer. Whether that row came from
`data_items` or from a pgEnv is the resolver's business, the same way a page route does not know
whether its component rows are in the main table or a split one.

This is what makes "exactly one thing differs" a defensible claim rather than bookkeeping: the
difference is not merely small, it is **invisible from outside `routes/auth/`**. If a UDA file
still has to know which kind of source it is holding in order to authorize it, the containment
failed and so did the task.

#### Two things that stay parent-shaped, and should

- **A view belongs to its source, and a `:data` row belongs to its source.** `authRules.js`'s
  `view: { owner: 'owning-source' }` and `data: { owner: 'source-by-slug' }` stay correct; what
  changes is that the owner is reached by the row's own `parent_id` rather than by a slug lookup —
  which retires `getSourceIdBySlug`'s `ORDER BY id DESC` misrouting (see 2a above).
- **`create-source` is judged on the parent**, because at create time there is no source to judge.
  `authRules.js` has `create: { owner: 'datasets-grants', perms: ['create-source'] }` today; under
  this phase the owner becomes the ENV. That is not an exception to "the env grants nothing" —
  `create-source` governs what may be made UNDER the env, so it is a `descendants` verb and the
  env's `self` list stays empty. See the format table above.

#### ⚠ What this costs, measured

Today an internal source INHERITS its datasets pattern's grants, and kind auth's rule is lenient
(nothing set ⇒ open). Taking the pattern out of the chain means every grant that currently reaches
a source through it stops reaching it.

- prod: **76 internal `:source` rows, 100% unstated.** Under rule 5 an unstated row is read-allowed
  and write-denied, so reads are unaffected and every write needs an explicit source grant.
- external: **13,837 of 13,847 are read-only and need nothing.** The 10 that must keep editing
  (`hazmit_dama` #1515, #12453, #13824; all of `wcdb-dama` except #14) need explicit grants.

That is the grant sweep already specified in [row-auth-uda.md](./row-auth-uda.md), and this phase is
what makes it mandatory rather than advisable: **without the sweep, cutting the pattern out of the
chain silently removes the only grants those sources had.** Sweep first, verify with
`--audit-writes`, then cut.

### Phase 3 — the six functions, and only the six

With the data uniform, the UDA routes call `assertDataWrite` / `readBlocked` / `listingBlocked`
like any other route — and **`routes/uda/` ends this task with no authorization code in it at
all.** Every exception that survives, including the external-source ancestry provider, lives behind
the API in `routes/auth/`. What remains of `sourceAuth.js` splits the way `readAuth.js` did on
2026-11-02:

- **plumbing → `routes/auth/`** — `requestUserId`, `sourceIdForView`, `ANON_CALLER` and the
  express helpers. These decide nothing and must never be duplicated per implementation.
  `parsePatternRef` / `requestPatternRef` are NOT in this list: Phase 2 removes the pattern id as
  an auth input entirely, so they move out of auth or are deleted, depending on whether any
  non-auth caller still wants the id.
- **decisions → the two implementation folders** — and at that point `DMS_UDA_GATE` folds into
  `DMS_AUTH_IMPL`, because there is finally something on both sides to switch between.

`readAuth.READ_PERMISSIONS` dies here. It is already documented in its own file as a
hand-maintained restatement of "which verbs happen to include reading" that drifted —
`download-source`, `manage-downloads` and `view-source-api` confer no row access yet appear in it,
so under kind auth a download grant opens the source's metadata. `readsRow` asks the one structural
question instead and needs no list.

## What this does NOT change

`sourceSnapshot.js` stays. Reading an env's grants once per 30s instead of once per decision is a
caching decision and a good one — a catalog listing over thousands of sources cannot afford a
per-source query.

What changes is what it holds. Today it carries a manufactured chain per source — `ap` plus
`patternAP`, with `loadInternal` unioning every listing pattern's grants and `namedPattern`
fetching the request-named one. Under Phase 2 the only level above a source is its env, and the env
states nothing, so `patternAP`, `unionMaps` and `namedPattern` go: the snapshot holds each source's
own resolved and expanded grants, plus the env's declared vocabulary. Smaller object, same reason
for existing.

## Prerequisites

- **The datasets vocabulary must be declared and synced**, which is already a prerequisite of the
  grant sweep in [row-auth-uda.md](./row-auth-uda.md). Nothing here works while the only expansion
  available to a source is the legacy shim.
- **[permission-domain-single-source.md](./permission-domain-single-source.md)** supplies the
  single source of truth Phase 1 requires — `authVocabulary` derived from `permissionDomain`. This
  task consumes that; it does not re-solve it.
- **The grant sweep itself** — 10 external sources that must keep editing (`hazmit_dama` #1515,
  #12453, #13824; all of `wcdb-dama` except #14) and prod's 76 internal `:source` rows, 100%
  unstated. Measured: 13,837 of 13,847 external sources are read-only and need nothing.
- Not blocked by task 7 Phase 4, but Phase 4 cannot finish without it: deleting `kindAuth/` means
  deleting `sourceAuth.js`, and today every UDA and DAMA route reaches auth through it.

## Done when

1. **One vocabulary, declared once, on the right row kind.** `dmsEnvFormat` carries the
   `permissionDomain`; changing a verb's `implies` there changes every decision that verb governs,
   on internal and external sources alike, with no second edit anywhere.
2. **What the env grants is declared, not coded.** Its `permissionDomain.self` is empty and no
   module contains a rule about envs being special — changing that decision is an edit to the
   format alone.
3. **A source's grants and vocabulary are read by the same code path as a page's** — no
   `auth_permissions` special case, no hand-built chain. Its verdict reads its own `auth`; the env
   contributes a declaration and no grants. `grep` finds no surviving chain-builder for a source,
   and no code path in which a datasets pattern lends grants to one.
4. **`legacyVerbs.js` is deleted** and the conversion script has run with `--apply` on every
   target, its dry-run report empty of unconverted rows.
5. `grep` finds no UDA or DAMA route importing `kindAuth/` or `rowAuth/` by name; they import
   `routes/auth`.
6. The facade's export list is still the six plus metadata — if it grew to serve datasets, this
   task failed in the way the 2026-11-02 attempt did.
7. **Exactly one thing differs between internal and external sources**: which env row is a
   source's parent. Not the vocabulary, not the verbs, not the grant shape, not the verdict.
7a. **And that difference is invisible outside `routes/auth/`.** `grep` finds no `isDmsEnv`, no
   pgEnv branch and no storage test in any authorization path reachable from `routes/uda/` or
   `src/dama/` — a UDA file never has to know which kind of source it is holding in order to
   authorize it.
8. `DMS_UDA_GATE` is gone, its job done by `DMS_AUTH_IMPL`.
9. `test-row-auth-uda-diff.js` still reports every divergence with a written reason.

---

## Build log

### Slice A — the formats (DONE 2026-11-02)

**A coupling this task had not captured, found by measuring before writing code.** On
`rowauth-test`:

| | |
|---|---|
| `:source` rows whose `parent_id` points at a `:dmsenv` row | **71 of 71** |
| `:dmsenv` rows carrying a vocabulary (`auth.vocabulary` or `data.authVocabulary`) | **0 of 4** |
| `:source` rows stating grants | **1 of 71** |

So Phase 2's STRUCTURE already exists — `migrate-row-auth.js` pass 4 stamped every source's parent
— and what is missing is the DECLARATION. That is precisely why the manufactured chain exists: a
source walking its real parents today finds no vocabulary anywhere, because neither the env nor the
site declares one. **Phase 1 and Phase 2 therefore cannot ship independently**, and the build order
is: give the env a vocabulary, stamp it, then delete the chain builders — not the reverse.

**What landed.**

1. **`packages/dms/src/patterns/dmsEnv.formats.js`** (new) — the `view` and `source` formats moved
   verbatim out of `datasets.format.js`, with the reason recorded at the top: the datasets pattern
   is not their ancestor and never was. `datasets.format.js` re-exports them, so the editor's
   imports are unchanged.
2. **`admin.format.js` `dmsEnvFormat`** — now `registerFormats: [source]`, `sources` is a real
   `dms-format` child instead of `type: 'json', default: []`, and it gains `pgEnv` (so an external
   env can have a row) and `authPermissions` with **`permissionDomain: []`** — the empty `self`
   that says, in data, that an env grants nothing about itself.
3. **`deriveDmsEnvVocabulary(dmsEnvFormat)`** in `deriveAuthVocabulary.js` — the env is not a
   pattern, so it needs its own derivation. `instance: dmsEnvFormat` puts its own (empty) domain in
   `self` and its `registerFormats` tree in `descendants`; empty scopes are omitted, so the result
   is `{ descendants: [ …source and view verbs… ] }` and no `self` key at all.

**Deliberately NOT done yet:** `datasets.format.js`'s `form-manager` still has
`registerFormats: [source]`, so the datasets pattern still derives the source verbs too. Removing
it now would strip those verbs from the only row that currently carries them and break both the
Access editor and server expansion. It comes out in the slice that stamps env rows.

**Tests.** New `packages/dms/tests/dmsEnvVocabulary.test.js`, 9 cases: the verbs derive as
descendants, `self` is absent, the three capabilities still imply nothing, `*` never enters,
`view-source` is the read verb, `sources` is a child declaration, the source format registers
`view`, `pgEnv` exists, and the empty domain is declared rather than implied.

`deriveAuthVocabulary.test.js` + `authVocabulary.test.js` 38/38 — the shipped vocabularies are
unchanged, which is the point: nothing was lost in the move. Full client suite 815 passed, 12
failed — the same five pre-existing files (themes, section groups, syncDelta, userMenus), none
format- or auth-related. Server auth suites unchanged: vocabulary 33, row-auth 30, gate 21,
source-auth 53, read-auth 30.

### Next slice — stamp the env rows

`--sync-vocabulary` writes declarations onto PATTERN rows from a client-emitted manifest. Env rows
need the same, from `deriveDmsEnvVocabulary`. Once an env carries it, an internal source resolves
its vocabulary by the ordinary walk, and the chain builders can go.

### Slice B — the env rows carry it (DONE 2026-11-02, applied to `rowauth-test`)

The declaration channel already existed for PATTERN rows: `emit-auth-vocabulary.mjs` →
`vocab.json` → `migrate-row-auth.js --sync-vocabulary`. An env is not a pattern, so it was never
reached. Both ends extended.

**`emit-auth-vocabulary.mjs`** now emits a ROW-KIND entry keyed `:dmsenv`. The `:` prefix is what
keeps it out of the pattern map — a `pattern_type` is never empty and never starts with `:` — and
it reads like the type suffix it stamps. Emitted:

```
keys: page, datasets, auth, admin, :dmsenv
:dmsenv scopes: ['descendants']        ← no `self` key at all
descendants: view-source, download-source, update-source, edit-source-data, create-view,
             manage-downloads, view-source-api, delete-source, edit-source-permissions
```

One snag worth recording: the emitter bundles with esbuild under a resolver whose `KEEP` regex is
`\.(format|domain|childRefs)(\.js)?$`, so a file named `dmsEnv.formats.js` (plural) was STUBBED and
the build failed with "No matching export for import view". Renamed to `dmsEnv.format.js`, which is
the convention anyway — `admin.format.js` holds four formats under a singular name.

**`migrate-row-auth.js` pass 1b** — stamps row-kind vocabularies. Same column chain as pass 1
(`auth.vocabulary` when the table has the column, else `data.authVocabulary`), same canonical
comparison so `jsonb` key reordering does not rewrite every row every run, same dry-run default.
Pass 1 now filters `:`-prefixed keys so the two cannot collide.

**Applied to `rowauth-test`:**

```
1b. row-kind vocabulary
     :dmsenv  rows 4   current 0   to write 4
        declares 9 descendant verb(s), 0 self verb(s)  ← grants nothing about itself, by declaration
        wrote 4 row(s) into auth.vocabulary
```

**The milestone, verified against the live clone.** A source now resolves its vocabulary by walking
its own `parent_id` — one hop, to its env:

```
source #750524 test_meta_forms_env|test_form:source  parent_id=1676363
vocabulary found on #1676363 prod|test_meta_forms_env:dmsenv (depth 1)
view-source implies:   ["read"]
update-source implies: ["read","edit"]
```

No manufactured chain, no datasets pattern, no request-named pattern. **This is what makes
`internalSourceChain`, `mergedAuthForSource` and `resolveOwner`'s three source cases deletable** —
until now they were the only way a source reached a vocabulary at all.

All four env rows carry `descendants: 9` and **no `self` key**, so "the env grants nothing about
itself" is now a fact in the data, not a rule anywhere in the server.

**Tests.** Server: vocabulary 33, row-auth 30, gate 21, source-auth 53, read-auth 30, row-auth-uda
22, data-auth 53, parent-id 85 — all green; `test-uda-auth` 27/1 is the known pre-existing failure.
Client: 47/47 across the three vocabulary suites.

**Still not done in this slice:** `datasets.format.js`'s `form-manager` keeps
`registerFormats: [source]`, so the datasets pattern still declares the source verbs too. Harmless
(both rows now declare the same list) and it stays until the chain builders are deleted, so there is
never a window where a source can reach no vocabulary.

### Next slice — delete the manufactured chains

With the env declaring, `rowSourceAuth.internalSourceChain` and `mergedAuthForSource` have nothing
left to supply for INTERNAL sources. External sources still need the pgEnv `:dmsenv` rows and the
ancestry provider before theirs can go.

### Slice C — external sources get an env, and the pattern leaves the chain (DONE 2026-11-02)

**`scripts/ensure-pgenv-rows.js`** (new) — gives a pgEnv the `:dmsenv` row it never had. Dry run by
default, idempotent, and it ADOPTS a row that matches by name but predates the `pgEnv` attribute
rather than creating a duplicate. Applied to `rowauth-test` for `hazmit_dama` (the one pgEnv
`VITE_DMS_PG_ENVS` names):

```
site #566430 prod:site  (instance "prod")
+ hazmit_dama  create prod|hazmit_dama:dmsenv  parent_id=566430
created #2900845
```

Then `--sync-vocabulary` stamped it in pass 1b with no change to the script — 5 env rows, 4
already current, 1 written. **The env level is now uniform**: internal and external sources resolve
the same vocabulary from the same kind of row.

It creates rows for the ENVS only. The 13,847 external sources stay in `data_manager.sources`,
which is the whole point of the provider below.

**`routes/auth/rowAuth/sourceAncestry.js`** (new) — the one asymmetry that survives, and it is in
the auth folder, not `routes/uda/`:

```
internal   source.parent_id   → the env row     (a column follow)
external   the pgEnv NAME     → the env row     (this lookup)
```

No new column and no cross-database id: a caller cannot query an external source without naming
the env to connect to it, so the name is always in hand and the source stores nothing.

**`mergedAuthForSource`'s external branch rewritten.** Was: the datasets pattern the REQUEST named
lends its grants, merged over the source's own. Now: one level — the source's own grants — expanded
against the vocabulary its env declares.

That deletes the hole `readAuth.js` records in its own header as *"a placeholder, not a boundary"*
because the client picks the pattern. `patternRef.app` survives **only as a locator**: per-app split
mode puts env rows in an app-scoped table, so finding one needs an app name. Addressing, not
authorization — it selects a table and confers nothing. The distinction the old code lost.

**Tests.** row-auth-uda 22, source-auth 53, read-auth 30, row-auth 30, gate 21 — green; uda-auth
27/1 is the known pre-existing failure. Differentials unchanged at 4 and 1 unexpected, both still
Shaun's new kind rules, so the rewrite moved no verdict the harnesses watch.

### Next slice — delete the manufactured chains

`internalSourceChain` now supplies nothing the parent walk cannot, and the external branch no
longer reads a pattern. `dataAuth.resolveOwner`'s `self-source` / `owning-source` /
`source-by-slug` are the third copy and go with them. After that: the conversion script,
`legacyVerbs.js`, and pointing the UDA routes at the facade.

### Slice D — the manufactured chains deleted (DONE 2026-11-02)

**`internalSourceChain` is gone**, replaced by `sourceAncestry.sourceChainFor` — the ordinary parent
walk: the source's own grants, and `parent_id` upward for the first row that declares. Both
branches of `mergedAuthForSource` now go through one module, with the same return shape; the only
difference left is how the env is found (a column follow vs the pgEnv name).

`dataAuth.resolveOwner`'s `self-source` / `owning-source` / `source-by-slug` were NOT deleted. They
are reached only under `DMS_DATA_AUTH_JUDGE=data`, the other author's live trial, and they belong to
kind auth, which is still the default implementation. They go when `kindAuth/` does, at task 7
Phase 4 — noted so nobody reads this slice as having finished them.

#### ⚠ A bug this slice found in Slice C — and why the suites missed it

The Slice C edit that added `require('./sourceAncestry')` targeted `require('../rowAuthCaps')`, but
the real line is `./rowAuthCaps` (it moved into `rowAuth/` in the 2026-11-02 refactor). The replace
silently matched nothing, so **`envRowForPgEnv` was undefined for the whole of Slice C** and the
external branch would have thrown `ReferenceError` on first use.

Every suite was green. Nothing exercises `mergedAuthForSource`'s external branch — the UDA suite
builds internal fixtures only, and `test-uda-auth`'s external cases run through kind auth. The
error surfaced only because Slice D's internal rewrite made the same call, and the internal path IS
covered.

**The gap is the finding, not the typo.** A `python` string-replace that matches nothing writes
nothing and reports success; the guard is `assert old in s`, which that edit skipped. Worth a
regression test over the external branch before this task closes.

#### The suite rewritten, because the contract changed

`test-row-auth-uda.js` sections 1–4 asserted the OLD model — pattern grants reaching sources, the
union across several patterns, the source narrowing what they gave. All of that is gone by design,
so the sections were rewritten rather than repaired, with the reason recorded in the file:

| was | now |
|---|---|
| a pattern grant reaches a source its env lists | it does **not** — and the test says so |
| several patterns' grants union | the env declares; grants come from the source alone |
| a source may only NARROW what its patterns gave | nothing above it grants, so there is nothing to clamp |
| — | granting the ENV confers nothing on the source beneath it |

17 passed, 0 failed. The fixture now puts `authVocabulary` on the env, which is the shape the live
clone has had since Slice B.

#### Evidence: `--audit-writes` before and after

The owner asked for this before the first slice that can move a verdict rather than reroute one:

```
before:  163 of 10933 row(s) (1.5%) writable by `rowauth-test Admin` and nobody else
after:   163 of 10933 row(s) (1.5%)                       — identical, section A unchanged
```

Zero delta **on this data**, and the reason matters: `rowauth-test`'s sources are already 100%
unstated, so there were no inherited grants to lose. On prod there are 76 internal `:source` rows in
the same state, which is why the grant sweep is a prerequisite of enforcing rather than a follow-up.

#### One divergence pinned — the first that is OUR decision

`test-row-auth-uda-diff.js` went 1 → 2 unexpected. The new one, `log: a granted request logs
nothing`, is the design change showing through: kind auth still lends a pattern's grants, so a
request it considers granted is refused by the row judge and `log` writes a would-deny line the old
contract asserts does not appear.

Pinned as `no-pattern-lending` **with the reason and the measurement**, and the fixture's README
now notes that this is the first entry there that is a decision rather than a finding. The
remaining unexpected entry is the other author's blank-row rule, which is not ours to pin.

**Tests.** source-auth 53, read-auth 30, row-auth 30, gate 21, data-auth 53, reads 20, parent-id 85,
upload-auth 37, row-auth-uda 17 — green. `test-uda-auth` 27/1 unchanged (pre-existing). Write
differential unchanged at 4.

### Slice E — the coverage gap closed, and Phase 1a measured (2026-11-02)

**`tests/test-external-source-auth.js`** (new, 10 cases) — the branch no suite covered, which is
how Slice C shipped with `envRowForPgEnv` undefined. It pins that an external source resolves the
vocabulary its ENV declares, that the env contributes no grants, that naming a pattern in the
request changes nothing, and that the source's own grants are the whole answer.

One case pins TODAY'S behaviour deliberately: without an app the env row is unreachable, `maps` is
null, and `expandLevel` falls through to `legacyVerbs.js`, where `update-source` happens to imply
read+edit — so the verb still confers, from a hardcoded table rather than any declaration. The test
says to flip it to `false` when the shim is deleted; it is the cheapest proof the shim is really
gone rather than merely unreferenced.

**`scripts/convert-grant-vocabulary.js`** (new) — Phase 1a's script. It does NOT translate old
verbs into new ones; there is no mapping to write. It measures **who loses a structural verb when
the shim stops rescuing them**, which is the only question that decides whether the shim can go:

```
DECLARED    the chain declares it. Unaffected.
SHIM-ONLY   undeclared, but legacyVerbs confers something. THIS is what deletion costs.
INERT       undeclared and not in the shim. Confers nothing today either.
```

A principal only loses access if EVERY verb it holds is shim-only or inert — one declared verb
carrying the same structural verb keeps it. That per-principal check is why the row counts
overstate the damage.

#### The result on `rowauth-test` — and it settles the open decision

```
rows 10933   with grants 3214

verb                          declared   shim-only   inert
  view-page                        179           1       0
  view-pattern                     177           0       0
  edit-page                        112           0       0
  publish-page                     110           0       0
  create-page                      108           0       0
  edit-page-permissions              3           0       0
  edit-page-layout                   0           0       1
  edit-page-params                   1           0       0

WHO LOSES A STRUCTURAL VERB IF legacyVerbs.js IS DELETED: 0
```

**Nobody.** The single shim-only `view-page` is on `#1499610 prod|datasets:pattern`, whose
`public` group also holds `view-pattern` — declared, and it confers `read`. The single inert
`edit-page-layout` is on `#2043199` and confers nothing under any reading.

So the a/b sub-decision this task flagged — "the vocabulary is null, grants stand and expand to
nothing" (refuse) versus "the grant is treated as absent" (rule 5 opens reads) — **does not arise
on this app**: no principal's access depends on the shim. It remains open for any app where the
script reports a non-zero loser count, and running it is now the gate rather than a judgement call.

`--apply` stripped the one inert verb. Re-running reports 0 and 0: idempotent.

#### Three bugs in the write path, each found only by re-running

The script wrote, reported success, and changed nothing — three times, for three different reasons.
All three are in this codebase's history already and all three are worth the comments left in the
file:

1. **Read `auth`, wrote `data`.** The row's grants come from whichever the precedence picks; a
   strip has to write back to the place it read from.
2. **Subdomain-keyed columns.** `resolveAuthPermissions` returns `parsed[subdomain] ?? parsed['*']`
   when a `'*'` key exists, so the grants live INSIDE that branch and any top-level `groups`/`users`
   are ignored. The same shape broke `rawAuthOf` on 2026-10-29.
3. **The branch is a JSON STRING.** Thousands of rows double-encode (pass 2 documents 3,194 on this
   app). `jsonb_set` into a path under a string value silently does nothing. The fix preserves the
   encoding the row already uses rather than normalising it — other readers expect what is there.

**Idempotence is what caught all three.** Each run reported "stripped 1 row" and the next run
reported the same work outstanding. A script that only ever ran once would have reported success
and left the data untouched, which is the failure mode the `--audit-writes` delta cannot see.

**Cleanup:** runs (1) and (2) left dead top-level `groups`/`users` keys on `#2043199`. They are
ignored by the resolver whenever a `'*'` key is present, so they changed no verdict, but they were
written in error and have been removed — the row is back to `['*', 'childRefs', 'vocabulary']`.

**Tests.** row-auth-uda 17, external-source-auth 10, source-auth 53, read-auth 30, row-auth 30,
data-auth 53, reads 20 — all green.

### Still open

- **Deleting `legacyVerbs.js` is a CROSS-APP decision.** The measurement above covers
  `rowauth-test` only; the shim is shared code, so the same script must report 0 on every app being
  enforced before it goes. It runs read-only and needs no migration.
- `rowAuthGate.verbsFor` still calls `expandLegacy` for the UDA `holdsPermission` path — a second
  entry point that must be handled with the deletion, not after it.
- The UDA routes still import `kindAuth/` by name (Phase 3).

### Slice F — the plumbing split out of kind auth (2026-11-02)

The prerequisite Phase 3 names, and the reason the first facade attempt had to be reverted:
`sourceAuth.js` held three different things, so a route that wanted `parsePatternRef` had to import
a named implementation to get it.

**`routes/auth/sourceGuards.js`** (new) — everything from `requestUserId` down: identity, the
Express guards, the Falcor asserts. None of it decides; it reads who the caller is, answers the
request itself on a refusal, and otherwise gets out of the way. `sourceAuth.js` re-exports it so
its ~20 callers keep their import against one definition.

**UDA routes now take their plumbing from the shared layer.** What still names an implementation is
exactly four imports, and every one is a genuine decision or a reader that moves with them:

```
uda.route.js          sourceIdForView                                    (reader)
uda.route.js          readMode allowSourceRead allowViewRead
                      filterReadableSources redactSourceRow              (readAuth decisions)
uda.tasks.route.js    isUserAuthedForSource                              (decision)
uda.colorDomain.js    allowViewRead                                      (decision)
```

That is the honest remainder: the datasets DECISIONS have no row-side twin yet, so putting them
behind the switch would still be a switch in name only. The plumbing is out of the way, which is
what had to happen first.

#### A circular dependency, and it failed silently

`sourceGuards` requires `kindAuth/sourceAuth` for the decisions; `sourceAuth` re-exports
`sourceGuards`. A top-level require is therefore a cycle, and Node hands back partially-initialised
exports — every destructured name `undefined`, no throw, a guard that silently cannot decide. Node
printed four `Accessing non-existent property … inside circular dependency` warnings and nothing
else.

**This is the third time the same shape has appeared in this programme** — the `NO_CHANGE` Symbol
(where two separately-minted Symbols would have silently performed skipped writes), and the
`DMS_AUTH_IMPL=kind` default that left `DMS_WRITE_GATE` inert. Fixed the way the codebase already
does it: `const decide = () => require('./kindAuth/sourceAuth')`, resolved at call time.

Five free references came with the extraction — `isDmsEnv`, `getDb`, and the reporting helpers
`refusal` / `logWouldDeny` / `refused`. The first two are locals; the last three are now exported
from `sourceAuth` and reached through `decide()`. Caught by the suites: 25 failures in
`test-uda-auth`, 15 in `test-upload-auth`, 8 in `test-schedule-auth`, all `isDmsEnv is not defined`.

**Tests.** Back to baseline: source-auth 53, uda-auth 27/1 (pre-existing), upload-auth 37,
schedule-auth 13, datatype-auth 9, access-log 13, read-auth 30, row-auth-uda 17,
external-source-auth 10. Full `npm test` unchanged at 4 unexpected on the write differential.

---

### Slice G — the shim is deleted (DONE 2026-11-03)

`rowAuth/legacyVerbs.js` and `rowAuth/expandLevel.js` are gone. What a permission string confers is
now whatever the row's chain DECLARES (`authVocabulary.js`) and nothing else; an undeclared verb
confers no structural verb and is matched by name.

**Measured before touching anything**, on `rowauth-test`:

| check | result |
|---|---|
| `--sync-vocabulary` coverage | **81/81 (100%)**, all already current |
| `convert-grant-vocabulary.js` | **0 principals** lose a structural verb |
| request-side verbs (declared vs the shim's table) | every asked verb covered |

The coverage number first read 79/81. The two gaps were `qa` and `mapeditor` missing from the
MANIFEST, not from the rows: `emit-auth-vocabulary.mjs` only walks the library's registry, so an app
pattern type needs `--extra <its format>`. The rows had been stamped correctly all along.

```
node scripts/emit-auth-vocabulary.mjs \
  --extra <app>/src/patterns/qa/qa.format.js \
  --extra <app>/src/patterns/mapeditor/mapeditor.format.js \
  --extra <app>/src/patterns/chat/chat.format.js > vocab.json
```

Only two declared implications differ from the shim's table, both because the format says so:
`edit-source-data` gains `create` + `delete`, and a bare `edit` gains `read`.

**The request side needed the vocabulary too**, which the plan had not accounted for. `verbsFor`
translates an ASKED permission into structural verbs, and it was reading the shim's table
unconditionally — not behind the declared-vs-shim precedence `expandLevel` owned. It now takes the
maps from the row's chain (`resolver.mapsFor`, the nearest declaring ancestor, same rule as the
grant side), threaded through `holdsPermission` → `holdsAny` → the three datasets decisions.

**External sources had been on the shim exclusively.** `loadExternal` expanded with
`expandLevel(ap, null)`, so deleting it would have left `view-source` as a bare string and refused
every external read. They now expand against their pgEnv's `:dmsenv` row — the same declaration
internal sources use. That needs an `app` to locate the row under per-app split mode, so the read
decisions take one explicitly (`appFor(app, patternRef)`); a caller with neither resolves no
vocabulary and checks by name. Today that is only the tile routes, which are `logOnly`.

`convert-grant-vocabulary.js` keeps a **frozen copy** of `LEGACY_IMPLIES`, because its whole job is
answering "what does this cost?" for an app that has NOT been converted — production above all.

**Tests.** Six suites had fixtures that declared nothing and were being rescued by the shim; they
now declare, as a migrated app does. The "flip this to false" pin in `test-external-source-auth.js`
was replaced by a sharper pair: the exact verb still passes by name, but no other verb rides along.

### Slice H — kind auth has one judge (DONE 2026-11-03)

The hand-written `switch` over eleven row kinds is deleted from `dataAuth.js`. `authRules.js` +
`authJudge.js` — rules as data, applied by an interpreter — are what kind auth is now (owner: "we
don't want hand written rules").

**Measured identical first**, across 167 cases: test-data-auth 53/53, upload-auth 37, uda-auth 27/1
(same pre-existing failure), source-auth 53, row-auth-reads 20, child-sweep 21, parent-stamp 9 — the
same numbers under `DMS_DATA_AUTH_JUDGE=data` and without it. Same kinds covered, same
`DEFAULT: { signedIn: true }` fallthrough, and the owner lookups are literally shared code.

**Six attribute clauses had no test at all.** Found by walking every `byKey` / `when` / `onlyKeys`
clause in `authRules.js` against the suite: page `section_groups` and `dataSources`, site `tenants`,
site `dms_envs` (the only clause that reads a different owner for one key), the `tenant` and
`dmsenv` kinds, and source `onlyKeys: [views]`. The fixture also held no `manage-tenants` grant, so
two of them could only ever have been tested as refusals — a `Tenanters` group was added.

They were verified against **both** judges before the switch was removed: HEAD's `dataAuth.js`
restored, suite run (59/59), new file put back (59/59).

All six disagree with ROW auth, now pinned with reasons. One is the known `field` reason (row auth
allows `section_groups` to an `edit-page` holder — there are no field→verb rules). The other five
are a cause nothing had written down: kind auth's `site-grants` and `datasets-grants` owners read
the **admin / datasets pattern rows, which are siblings** of a tenant or dmsenv row, not ancestors.
Row auth walks `parent_id` to the site row, which states nothing — so it refuses what kind auth
allows. It fails closed, and the fix is in the data (the site row carrying those grants), not the
judge. Pinned as `sibling-grants`.

### Slice I — eight flags become two (DONE 2026-11-03)

Owner, 2026-11-03: *"we want only one unified auth api that can switch between providers (row and
kind)"* and *"the one flag I also want to keep is log vs enforce, and it should be made to work with
both auth implementations."*

| was | now |
|---|---|
| `DMS_ROW_AUTH_MODE`, `DMS_DATA_AUTH_MODE`, `DMS_READ_AUTH_MODE`, `DMS_SOURCE_AUTH_MODE`, `DMS_AUTH_ROW_MODE` | **`DMS_AUTH_MODE`** = `log` (default) \| `enforce` — `routes/auth/mode.js` |
| `DMS_WRITE_GATE`, `DMS_UDA_GATE` | **`DMS_AUTH_IMPL`** = `kind` (default) \| `row` — `routes/auth/impl.js` |
| `DMS_DATA_AUTH_JUDGE` | gone with the hand-written switch (Slice H) |

`legacy` went with them: `log` already refuses nothing AND says what it would have refused, which is
strictly more useful than silence. `logOnly` survives as a per-call argument, not a flag — tiles
stay at `log` under `enforce` because MapLibre sends no identity.

**`DMS_AUTH_IMPL` is read per call** (`impl.js`), not captured at load. A suite selects an
implementation by setting the variable at the top of its file, and whether that lands depended on
whether anything it required first had already pulled the module in. That exact ordering bug once
made a differential pass green having compared kind auth with itself.

**What the collapse costs, stated plainly:** a surface can no longer be flipped to `enforce` on its
own. Enforcement is all surfaces or none, per implementation. The rehearsal that remains is
`DMS_AUTH_IMPL=row` + `DMS_AUTH_MODE=log`, which runs row auth's rules over real traffic and logs
everything they would refuse.

**One deliberate exception stays**: `rowAuth/index.js` `readBlocked` / `listingBlocked` still call
kind auth while the mode is `log`, for `pattern` and `page` only. That is a SAFETY floor, not a
choice of implementation — `log` means "refuse nothing", and refusing nothing on a read path kind
auth already enforces would publish every private page.

**Verified end to end on real data**, not just in tests: `--audit-writes` against `rowauth-test`
reports **163 of 10933 (1.5%)** admin-only, identical to the pre-change baseline, with the real
resolver agreeing on 300/300 sampled rows.

**Tests.** Every suite's `withMode` helper now drives `DMS_AUTH_MODE`; the eight `legacy` cases are
deleted with the mode they asserted; `createGate`'s per-call `mode` override is gone, so the
`publicRead` cases set the environment like every other suite. `test-uda-auth` went **27/1 → 28/0** —
the long-standing failure was a flag interaction, and it is gone with the flags.

Final: data-auth 58, source-auth 52, read-auth 29, uda-auth 28, upload-auth 37, schedule-auth 12,
datatype-auth 8, row-auth-gate 20, row-auth-reads 19, row-auth-writes 32, row-auth-uda 17,
external-source-auth 11, auth-vocabulary 33, parent-stamp 9, parent-id 85, child-sweep 21,
auth-users 27, auth-permissions 23, blank-audit 7, access-log 13 — all 0 failed. Differentials at
their pinned 4 and 1, with 33 disagreements measured on the write side (not neutered).

### Slice J — the grant sweep (APPLIED to `rowauth-test`, 2026-11-03)

New: `src/scripts/sweep-source-grants.js` — dry-run by default, `--apply`, `--verify`.

**It writes a grant only where a VERDICT would otherwise change.** A diff of grant objects says 64
of 71 sources on `rowauth-test` depend on what the datasets pattern lends them. Judging instead
says what that actually costs:

```
   64 × update-source / groups.AVAIL          64 × update-source / users.1
   64 × edit-source-data / groups.AVAIL       64 × edit-source-data / users.1
   64 × create-view / groups.AVAIL            64 × create-view / users.1
   64 × delete-source / groups.AVAIL          64 × delete-source / users.1
   64 × edit-source-permissions / groups.AVAIL  64 × edit-source-permissions / users.1
    1 × read / groups.AVAIL                    1 × read / users.1
```

Reads were almost entirely safe already — an unstated source is readable by everyone under rule 5,
so the `public: [view-page, view-pattern, read]` half of every lend conferred nothing it did not
already have. Only the ONE source that states grants of its own would have lost a read. The loss is
edits, for the two principals holding `*` on the pattern.

**This also names an inconsistency that is live right now.** Writes stopped lending in Slice D;
reads did not. So today `AVAIL` can see an unredacted source through `holdsOnSource` but cannot
edit it through `decideSourceRow`. The sweep closes that by making the grant real.

#### Two mistakes worth keeping, because both reported success

1. **Per-principal writes would have caused a bigger regression than they prevented.** Writing a
   grant makes the row STATED, and a stated row is no longer covered by rule 5 — so writing only
   the principals that lose something strips rule-5 reads from everyone else the pattern lends to.
   On this app that was public reads on 63 sources. The unit is therefore the SOURCE: a source that
   needs any write gets the pattern's entire grant object, every principal, verbatim. Nobody gains
   anything they did not already have.
2. **The first `--apply` wrote 64 rows and 1 took.** Grants are read from the `auth` column, else
   from `data` — but a source keeps its `data` grants under `auth_permissions`, not
   `authPermissions`, and a source that states nothing has neither key. The page spelling was the
   fallback, so 63 rows got a `data.authPermissions` no reader of a source consults. Caught by
   `--verify`, which is why it exists. The script now always writes the `auth` COLUMN — the system
   of record, which beats `data` whatever `data` holds. The 63 stray keys were removed.

#### Result

```
   sources                         71
   in no datasets pattern           7
   lose nothing when the lend goes 64
   NEED A GRANT WRITTEN             0
   ✓ CUTTING THE LEND CHANGES NO VERDICT ON THIS APP.
```

**`--audit-writes` is the proof the task asked for: 163 of 10933 → 35 of 10933 (1.5% → 0.3%).**
128 rows that only `rowauth-test Admin` could have written are writable by their grantees again.
Resolver cross-check still 300/300. Suites unchanged (read-auth 29, row-auth-uda 17,
external-source-auth 11, source-auth 52, uda-auth 28 — all 0 failed).

#### Not done

- **Prod was not measured.** `--db dms-mercury-3 --app mitigat-ny-prod` (a dry run — it only
  SELECTs) was refused by the sandbox as a production read. It needs the owner's go-ahead. The
  task's own figure for it is 76 internal `:source` rows, 100% unstated.
- **External sources are out of scope for this script, by design.** Their lend comes from the
  pattern the REQUEST names, not from one that lists them, so there is no per-source answer to
  compute; and a DAMA pgEnv is shared with production. That half stays the explicit named list
  (`hazmit_dama` #1515 / #12453 / #13824, all of `wcdb-dama` but #14), which
  `grant-public-read-sources.js` is the right shape for.
- **Pattern lending is still live on reads.** The sweep makes cutting it safe; it does not cut it.
  `sourceSnapshot.loadInternal`'s `patternAP` / `unionMaps` / `namedPattern` are the next edit.

### Slice K — pattern lending is cut from reads (DONE 2026-11-03)

The other half of `no-pattern-lending`. Writes stopped lending in Slice D; reads do now. Four parts,
all in `sourceSnapshot.js` plus the two `decideFrom*` functions:

1. **`loadInternal` no longer reads the datasets patterns at all** — not their grants (`patternAP`
   is `{}`) and not their vocabularies.
2. **A source's vocabulary comes from its ENV**, by `parent_id` with the type path as fallback. The
   env rows have carried it since Slice B; until now the pattern was the only row consulted.
3. **The request-named pattern lends nothing to external sources.** `named.app` survives as a
   locator (it selects the table holding the env row) and `named.maps` as the vocabulary. This was
   the hole `readAuth.js` records as *"a placeholder, not a boundary"*: the client picks the
   pattern, so a caller with two datasets patterns could name whichever granted more.
4. **`orphan` is gone.** "Listed by no datasets pattern" was only ever a fact about the pattern, and
   it contradicted `decideRead`, which never consulted it — the same source was readable there and
   refused by `holdsOnSource`.

#### Measured, not assumed

Every `(source × principal × verb)` verdict on `rowauth-test` was dumped before the change and
compared after — 71 sources × 5 principals × 8 verbs:

```
   sources changed:  7 of 71
   verdicts LOST  :  0
   verdicts GAINED: 35   (view-source on the 7 ex-orphans, every one already readable)
```

**Nobody lost anything**, which is what the Slice J sweep was for. The only movement is the 7
orphans answering `view-source` consistently with the reads they already allowed.

`--audit-writes` unchanged at 35 of 10933, resolver cross-check 300/300.

#### A bug this introduced, and how it surfaced

Following parentage meant selecting `parent_id` — and **selecting a column that is not there does
not degrade the query, it throws**, taking the whole snapshot down and refusing every read in the
env. Five of `test-read-auth.js`'s cases went red with `no such column: parent_id` on an unmigrated
sqlite table. `sourceSnapshot` already had the probe for exactly this (`authColExpr` /
`rowAuthCaps`); there is now a `parentColExpr` beside it. 8 failures → 2.

#### The 2 that remained were the real change

Both pinned the named pattern lending to an external source, and both are rewritten to the new rule
rather than deleted — `named(extPattern)` for `Rando` now refuses, and the pair that proves it is
not simply "everything is refused" stays: `${app} Admin` of the locator app still passes, and a
source granting the public still reads with a patternRef attached. The route-level case now asserts
the private source answers `null` to a caller naming the pattern, with a readable source alongside
to show the locator still works.

#### State

All 20 suites 0 failed (read-auth 29, data-auth 58, source-auth 52, uda-auth 28, row-auth-uda 17,
external-source-auth 11, …). Differentials at their pinned 4 and 1.

**Criterion 3 is now met**: `grep` finds no surviving chain-builder for a source and no code path in
which a datasets pattern lends grants to one. `unionAuthPermissions` survives in `sourceSnapshot.js`
for `readNamedPattern`'s callers only.

### Slice L — criterion 5: no route names an implementation (DONE 2026-11-03)

```
grep -rn "kindAuth/\|rowAuth/" src/routes/uda/ src/dama/     →  (nothing)
```

16 import sites, 17 distinct names, in three groups — and only the third needed real work.

**Plumbing and mode (10 names).** `requestUserId`, `requestUserIdWarnBody`, `requestPatternRef`,
`requireUser`, `requireUserOrOpen`, `requireReader`, `requireSourcePermission`,
`requirePatternPermission` already lived in `sourceGuards.js` and were only re-exported through
`sourceAuth.js`; `authMode` / `readMode` are now aliases of the shared mode. One-line repaths.

**The read surface → new `routes/auth/sourceReads.js`.** Mode, snapshot, logging, redaction, the
app locator — the layer AROUND a decision, which is the same whichever implementation answers. It
sat in `kindAuth/readAuth.js` because that is where it was written, so every UDA and DAMA read
route imported kind auth by name to reach it while the decision inside had been dispatching on
`DMS_AUTH_IMPL` for weeks. **The imports said one thing and the behaviour did another.**

Each implementation now supplies one narrow object instead:

```js
sourceDecision.reads(s, user, app, reqPermissions)        → { allow, reason }
sourceDecision.holds(s, user, app, reqPermissions, check) → { allow, reason }
```

`s` is the snapshot entry (`{ ap, view, maps }`), so a decision gets the source's grants already
expanded and the vocabulary they were expanded with, and needs no database access. `check` selects
between kind auth's strict and lenient rules; the row judge has neither and ignores it — which is
precisely why this is two objects rather than one shared decision with a flag.

`kindAuth/readAuth.js` went from 285 lines to 39: the decision, and nothing else.

**The authorize functions → `sourceGuards.js`.** `isUserAuthedForSource`,
`isUserAuthedForPattern` and `sourceIdForView`. The first two apply the MODE around whichever
`decideSource` / `decidePattern` the switch picks — identical for both implementations, so they
belong to neither. The third is a database lookup.

The facade stayed at **22 names**: nothing datasets-specific was added to it, which is the failure
mode of the 2026-11-02 attempt (29 names to serve 11 datasets call sites).

**State.** All 20 suites 0 failed, differentials at their pinned 4 and 1, `--audit-writes` 35 of
10933 and the sweep still verifying clean.

> One run of `--audit-writes` reported its resolver cross-check at **299/300** rather than 300/300,
> and I could not reproduce it in 18 further runs. The sample is `ORDER BY random() LIMIT 300`, and
> the check compares the resolver's "is this chain stated" against the audit's own SQL
> approximation of the same question — so a rare disagreement is a gap between those two methods,
> not between the implementations. Recorded rather than dismissed: the disagreeing row id was not
> captured, so this is unexplained rather than explained-and-harmless.

### Where criterion 5 leaves the task

Met: 1, 2, 3, 4a, 5, 7a, 8. Remaining:

- **4b** — the conversion script has never been run with `--apply` on any target, and prod has not
  been measured (the read is refused by the sandbox as a production read).
- **7** — the snapshot still has two loaders, `loadInternal` and `loadExternal`. They now produce
  the same shape; the remaining difference is which row supplies the vocabulary.
- **9** — the UDA differential's one unpinned divergence is the blank-row rule, not ours to pin.

### Slice M — a source is resolved like any other row (DONE 2026-11-03)

Owner, 2026-11-03: *"why do we need special code for source reads, shouldn't they be able to be
handled the same as any other row?"*

**Measured first, and the answer was yes** — the ordinary row gate, the same `judge(rows, 'read')`
a page or a theme gets, already agreed with the entire special path on `rowauth-test`:

```
internal sources 71 × principals 4 = 284 reads
  the ORDINARY row gate agrees with the special path on 284/284
```

It had not always been so. A source's grants used to come from a union of every datasets PATTERN
that listed it, found by reverse lookup, with the vocabularies unioned the same way — no parent walk
could reproduce that. Slices D and K deleted it, and the special path had been vestigial since.

#### What changed

`loadInternal` no longer builds a source's grants by hand. It runs `createResolver(...).resolve()` —
the same walk every row gets — and caches the result, which is what this file is actually for.

**This fixed a latent bug, not just a shape.** Reading only a source's own `auth` meant that
anything an ancestor granted was silently ignored for sources while every other row kind inherited
it. The env grants nothing TODAY by declaration (`permissionDomain.self: []`), so nothing was
wrong — but that was a property of the DATA, not of the code.

#### What it also proved: the two providers cannot share a resolved chain

The first cut handed `merged` to both implementations and four `test-read-auth` cases went red at
once. `mergeAuthChain` expands `'*'` into the five structural verbs **at resolve time**, because
that is how rule 3 clamps: a child's `['*']` under a parent that allowed only `['read']` has to come
back as `['read']`, which is impossible if `'*'` survives as a wildcard. Kind auth matches
permission strings BY NAME — handed that object it sees no `'*'` and no `view-source`, and refuses
everyone.

So the snapshot entry carries two objects, and that is **not** two implementations of inheritance:

| | |
|---|---|
| `ap` | the source's own grants, expanded additively (names preserved) — kind auth, and the `stated` / `view: false` pre-check both sides share |
| `merged` | the resolved chain — row auth |

The providers have different grant vocabularies. One resolution each is what having two providers
MEANS; the thing worth deleting was a second implementation of the WALK, and that is gone.

#### Cost

```
71 sources, one listing:
   cold snapshot   28.4 ms      warm snapshot   1.0 ms      ungated row gate (batched)   77.2 ms
```

The cache is why the snapshot exists, and it stays. (The 77ms is a stub controller that reloads
every container row per gate; the real one caches, so it overstates.)

#### Two bugs found on the way

1. **`view: false` was silently dropped.** `ownAuthOf` reads the column under the name the old
   projection gave it (`authcol`), and the new query aliased it `auth` for the resolver. The row is
   now handed over in the shape each reader expects rather than renamed at the query.
2. See above — the `'*'` expansion, caught by the suite within a minute of the first cut.

**State.** All 20 suites 0 failed; differentials at their pinned 4 and 1; `--audit-writes` 35 of
10933 with the cross-check at 300/300; the ordinary gate and the read surface agree 284/284.

#### What is still source-specific, and why

- **External sources** — not `data_items` rows at all: different database, no `type`, no
  `parent_id`. `sourceAncestry.js` is the bridge, and this is criterion 7's one permitted asymmetry.
- **Redaction** (`trimGrants`, `dropSecrets`) — reply-shaping for two columns, not authorization.
  It still lives in `sourceReads.js` because that is where it was written.
- **`view: false`** — a source-only narrowing flag; arguably should be grants.

### Slice N — the three source-* modules, accounted for (DONE 2026-11-03)

Owner: *"why are the sourceGuard, sourceReads and sourceSnapshot still in the code tree?"* — 888
lines across three files named for one row kind. The accounting, and what came out of it.

**The structural reason they exist, which is real:** UDA addresses sources by `(env, sourceId)` and
gates BEFORE fetching a row — five call sites in `uda.route.js` read
`await canReadSource(...) ? await fetchTheThing() : null`. `readBlocked` takes a row. And external
sources have no row at all. Something has to turn an id into a decision.

**What did not earn its place:**

1. **`namedPattern` was a database round-trip per uncached read whose result was unused.** It
   fetched the request-named datasets pattern's grants and vocabulary. Pattern lending went in
   Slice K, so `.ap` died with it; an external source's vocabulary now comes from its `:dmsenv` row
   inside `loadExternal`, so `.maps` died too. The last field anything read was `.app` — which the
   caller already holds as `patternRef.app`. Deleted, cache and all; `decideRead` / `decideFrom`
   take the app string directly. `readNamedPattern` stays: kind auth's PATTERN-level decisions
   still ask it about a pattern's own grants.
2. **Five dead exports** — `SNAPSHOT_TTL_MS`, `GRANT_EDITORS`, `SECRET_EDITORS`, `sourceOfView`,
   `decideFrom` — confirmed unreferenced outside the files that defined them.
3. **Redaction was never authorization.** `trimGrants` / `dropSecrets` / `redactSourceRow` decide
   which COLUMNS an already-allowed reply carries, for two DAMA columns. Moved to
   `routes/uda/sourceRedaction.js` (68 lines), which still ASKS auth a question (`holdsOnSource`) —
   the right direction: a route asks whether the caller holds a permission, then shapes its reply.
4. **`sourceGuards.js` was mostly not about sources.** `requestUserId`, `requireUser`,
   `requireReader`, `requireUserOrOpen`, `requireFalcorUser`, `ANON_CALLER` and the pattern-ref
   parsers read who is asking — any route wants that. Split to `routes/auth/requestUser.js`;
   `sourceGuards.js` keeps the source- and pattern-level authorize functions and the guards that
   answer a request with them.

**Also collapsed, same session:** `impl.js` + `mode.js` + `noChange.js` → `routes/auth/settings.js`
(71 lines). The two flags are one concern — what this server is configured to do. `NO_CHANGE` is
not a setting and the file says so; it lives there because this is the one module both
implementations may read without reaching for each other, which is the whole reason the Symbol has
to be shared in the first place.

#### The auth folder now

```
    71  settings.js        the two flags, and the shared sentinel
    90  index.js           the switch
   146  auth.js            is this caller authed; what do stored grants resolve to
   146  requestUser.js     who is asking (not source-specific)
   196  sourceGuards.js    source/pattern authorize + the guards that answer with it
   199  sourceReads.js     the (env,id) read adapter: mode, logging, dispatch
   317  sourceSnapshot.js  the 30s per-env cache, and the external loader
```

#### Two mistakes, both caught by the suites

- The first split took `requireSourcePermission` with the generic helpers — a comment-walkback
  heuristic over-captured. Moved back; `sourceGuards.js` is untracked, so there was no `checkout`
  to undo it with, only reading both files and repairing.
- `requireUserOrOpen` and `readerAllowed` are not purely generic: they consult the MODE and write
  the would-deny line, through the lazy `decide()` that stayed behind in `sourceGuards.js`. Three
  `test-datatype-auth` and three `test-schedule-auth` cases went to 500 with
  `ReferenceError: decide is not defined`. They now take `authMode` from `./settings` and the
  reporting pair from `sourceGuards` through the same lazy-require the codebase already uses for
  this exact cycle.

**State.** All 20 suites 0 failed; differentials at their pinned 4 and 1; `--audit-writes` 35 of
10933 with the cross-check at 300/300.

### Slice O — an external source is a row, and is resolved like one (DONE 2026-11-03)

Owner, 2026-11-03: *"external sources aren't rows in data items but they are rows in the sources
table and the auth behaves exactly the same way for them data wise."*

Correct, and "external sources aren't rows" had been this task's standing excuse for criterion 7's
asymmetry — including in Slice M's own write-up. What actually differs is WHICH TABLE the row is
read from. The chain above it does not differ at all: a pgEnv's `:dmsenv` row is an ordinary
`data_items` row carrying the same declaration an internal source's env carries.

`loadExternal` now hands its rows to the same `createResolver` walk, with `parent_id` pointing at
the env row. `createResolver` takes its loaders as arguments precisely so the rows can come from
anywhere — the capability was already there and unused.

**What this fixes:** an external source could never inherit anything. It expanded its own grants and
stopped. An internal one walked its chain. Nothing is wrong today because the env grants nothing by
declaration — the same latent divergence Slice M found on the internal side, in the other direction.

**The ids are prefixed** (`x${source_id}`) because the two tables number independently:
`data_manager.sources` #5 and `data_items` #5 are different rows, and the resolver caches by id.
Without the prefix an env row could be served from cache as a source, silently.

A chain that cannot be walked falls back to the source's own grants with a warning, which is what
every external source got before today.

**State.** All 20 suites 0 failed, differentials at their pinned 4 and 1, `--audit-writes` 35 of
10933, cross-check 300/300.

**Criterion 7 is now met in substance:** the one thing that differs between internal and external
sources is which table the row is loaded from. Not the vocabulary, not the verbs, not the grant
shape, not the verdict, and no longer the walk.

### Slice P — `sourceGuards` 19 exports → 9 (DONE 2026-11-03)

Owner, 2026-11-03: *"sourceGuards exports 19 functions, that seems like an overly complicated api,
when basically the question you are asking is, given a row with an auth grant, can I do verb to
it?"*

**Ten of the nineteen were pass-throughs.** `requestUserId`, `requireUser`, `requireReader`,
`requestPatternRef` and the rest had moved to `requestUser.js` in Slice N and were still being
re-exported from here — and 18 of this module's import-sites were reaching for them, which is most
of what made the surface look the size it did. Who is asking and what they may do are different
questions; the files are separate and now so are the imports.

**A second pass-through layer went with it.** `kindAuth/sourceAuth.js` ended with `...guards`,
re-exporting this whole module so older imports kept working. That is what made a named
implementation look like the place to get functions that have nothing to do with kind auth —
`src/index.js`, `pattern-filter-sync.js` and two suites were all reaching into `kindAuth/` for
request plumbing. Removed; every caller now imports from the module that defines what it wants.

What is left, and what each thing actually is:

```
isUserAuthedForSource  isUserAuthedForPattern     THE QUESTION, with the mode applied
requireSourcePermission  requirePatternPermission  the same question, answering Express
assertSourcePermission   assertPatternPermission   the same question, answering Falcor
sourceIdForView                                    a lookup
logWouldDeny  refused                              reporting
```

**Three bugs, all from removing a re-export that something still leaned on**, and all caught within
a minute by the suites: `parsePatternRef is not a function` in two double-quoted `require(...)`
lines my single-quote regex had skipped; `decide().isUserAuthedForPattern is not a function` where
the guards were still reaching for functions that now live in their own file; and
`sourceIdForView is not a function` in `kindAuth/dataAuth.js`. 25 / 19 / 8 / 1 failures
respectively, each a one-line fix.

#### Why it is 9 and not 3

The six are **two subjects × three transports**, and the subject axis is the fake one: "source" and
"pattern" differ only in WHICH ROW is being asked about. If a caller handed over a row, they would
be one function per transport — and the transports are about answering a request, not about auth.

That collapse is blocked by the same thing as everything else left in this task: **UDA addresses by
`(env, sourceId)` and gates before fetching**, so `isUserAuthedForSource` has to resolve a source
from an id while `isUserAuthedForPattern` resolves a pattern from a `patternRef`. Give the auth
layer rows and the API is `can(row, verb, user)` plus two transport adapters, which is the shape the
owner described.

**State.** All 20 suites 0 failed; differentials at their pinned 4 and 1; `--audit-writes` 35 of
10933, cross-check 300/300.

---

## 2026-11-04 — ROW AUTH DELETED. This task's premise is retired.

Owner: *"I think we want to completely abandon row auth at this point, I think kind auth is actually
the better solution at this point and its just making the shared code more complicated."*

Everything below this line in the task is history. What follows is what was removed, what survived,
and the two things that were load-bearing and now are not.

### Removed (1,489 lines of implementation, 9 suites, 2 fixtures, 1 flag, 1 script)

| | |
|---|---|
| `routes/auth/rowAuth/rowAuthGate.js` (531) | the judge: `verdict`, `createGate`, `createRowJudge`, `assertDataWrite`, `planEdit`, `verbsFor`, `holdsPermission`, the `AUTH_FIELDS` escalation floor |
| `routes/auth/rowAuth/rowSourceAuth.js` (281) | the datasets half: `decideSourceRow`, `decidePatternRow`, `readsRow`, `holdsAny`, `mergedAuthForSource` |
| `routes/auth/rowAuth/rowAuth.js` (363) | `createResolver` — the `parent_id` walk, `rawAuthOf`, `authOf`, `mapsForChain` |
| `routes/auth/rowAuth/mergeAuth.js` (209) | `mergeAuthChain`, `can`, `isUnstated` — rules 1–5, including the clamp |
| `routes/auth/rowAuth/index.js` (105) | the parallel contract `../index.js` switched on |
| `DMS_AUTH_IMPL` | the ninth and last of the flags. **`DMS_AUTH_MODE` is now the only auth variable.** |
| `src/scripts/sweep-source-grants.js` | its window closed when pattern-lending was cut on 2026-11-03 |
| `migrate-row-auth.js --audit-writes` / `--diff-reads` | both measured the gate; the column work in that script is untouched and still required |
| tests | `test-row-auth{,-gate,-writes,-reads,-uda,-diff,-uda-diff}.js`, `test-merge-auth.js`, `test-external-source-auth.js`, and the two `fixtures/row-auth*-expected-diff.json` |

### Survived, and moved out of the folder — none of it was row auth

| now at | why it stays |
|---|---|
| `routes/auth/authVocabulary.js` | `permissionDomain` → verbs → `implies`. `verbsForFields` is how kind auth knows which verb governs which field; `childRefsOf` / `ownerKindOf` are the controller's. |
| `routes/auth/sourceAncestry.js` | a pgEnv's `:dmsenv` row — where an external source's vocabulary is declared |
| `routes/dms/parentId.js` | stamping `parent_id`, and the cascade delete that rides on it. Containment, never auth. |
| `routes/dms/rowAuthCaps.js` | the probe for the `auth` and `parent_id` columns, which are still where grants and containment are stored |

`sourceSnapshot.js` lost the second of its two resolved grant objects. It carried both because the
providers could not share a representation — merging expands `'*'` into the five structural verbs at
resolve time so rule 3 can clamp, and kind auth matches names, so handed that object it saw no `'*'`
and refused everyone. One implementation, one representation.

### Two things row auth was carrying, now uncovered

1. **Reads are guarded for `pattern` and `page` only.** Every other kind — site, theme, tenant,
   dmsenv, source, view, component, page-edit, split `:data` — is guarded on write and open on read.
   The gate closed that by judging every kind the same way. Closing it now means a read rule in
   `kindAuth/kindReadAuth.js`.
2. **Nothing above a source is inherited.** Nothing above one grants today, by declaration
   (`admin.format.js`, `permissionDomain.self: []`), so no verdict changes — but that is a property
   of the data. Give an env grants and they are silently ignored. The comment at
   `sourceSnapshot.js` `loadInternal` says so at the point it would have to be fixed.

Also uncovered, and smaller: the page⊕pattern merge in `kindReadAuth.js` has **no clamp**, so a page
may widen what its pattern gave a principal. The two implementations were pinned as divergent on
exactly this and row auth was the stricter one.

### Verification

`npm test` 0 failed; `test-data-auth` 66, `test-source-auth` 52, `test-read-auth` 31,
`test-auth-permissions` 24, `test-auth-level-rules` 13, `test-access-log` 14,
`test-auth-vocabulary` 20, `test-uda` 144, `test-sync` 95 — all 0 failed. Client vitest 855 passed,
12 failed, the same 12 (radio/avlGraph/sectionGroup/syncDelta/userMenus themes) that fail at HEAD.
`test-table-splitting` fails one assertion, confirmed identical at HEAD in a worktree.

### Still open

The other `row-auth-*.md` tasks in `tasks/current/` describe work that no longer exists
(`row-auth-chain-spike`, `-consolidate`, `-dms-writes`, `-resolver`, `-schema`, `-scoped-grants`,
`-uda`, `-production-cutover`). They have not been moved to `completed/` — that is a bookkeeping
decision for the owner, since several also record findings about the surviving column work.
`row-auth-parentage.md` and `row-auth-vocabulary.md` describe the parts that survived and stay.
