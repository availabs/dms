# One place to declare a permission: `permissionDomain`, and `authVocabulary` derived from it

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** in progress · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

Part of [server-side-auth-general.md](./server-side-auth-general.md) (hub). Supersedes the authoring
half of [row-auth-vocabulary.md](./row-auth-vocabulary.md), whose transport it keeps unchanged.

## Objective

A permission is declared **once**, in the `permissionDomain` of the format that describes the row it
governs. Everything else — the Access editor's options, the pattern-level option list, the
`authVocabulary` the server interprets, the server's read set — is **computed** from that.

Owner's rule (2026-10-30): *"We can even have code that derives authVocabulary from the permissions
domain of all formats for a pattern. But we can't have multiple sources of configuration truth."*

## Why now

`authVocabulary` is **one day old** — every file arrived in `e8b531f2 "rowauth"` (2026-10-29),
uncommitted on `permissions_move`. `permissionDomain` predates it by nine months (`df407e55`,
2026-01-29). This is not two mature systems that drifted; it is a new concept landed beside the
incumbent without reconciling them, and the duplication is already measurable: the datasets
vocabulary carries 16 verbs against the editor's 10.

It is not cosmetic. The live `enforce` run against `rowauth-test` found a public county page serving
4,768 characters to a logged-out visitor instead of 16,657 ([row-auth-uda.md](./row-auth-uda.md)).
The proximate cause was `view-page` sitting in the datasets vocabulary's `descendants`, which made a
pattern-level grant reach every source beneath it. That entry was authored a day earlier, by us, to
satisfy a **one-way** coverage test (`permissionDomain ⊆ authVocabulary`) — the verb went into
`descendants` because coverage demanded it, not because anyone decided a pattern's `view-page`
should open a source. A single declaration makes that class of error unrepresentable.

## Current state — five lists, no two identical

| # | Where | What it feeds | Source verbs |
|---|---|---|---|
| 1 | `utils/adminPermissions.js` `permissionOptionsFor(type)` | the **pattern-level** Access editor | a `switch` on `pattern_type`; `DATASETS_OPTIONS` = 12 |
| 2 | each format's attribute `permissionDomain` | the **row-level** editors (page, section, source) | source = 9 + `*`; page = 5 + `*`; section = 2 + `*` |
| 3 | `*.authVocabulary.js` | grants expansion, transported to the server | datasets = 4 self + 12 descendants |
| 4 | `readAuth.js` `READ_PERMISSIONS` | what a source read **requires** | 9, hardcoded |
| 5 | `legacyVerbs.js` `LEGACY_IMPLIES` | expands the **required** permission (`verbsFor`) | a global map; no `download-source` |

`adminPermissions.js` states the duplication in a comment: *"Keep in step with datasets.format.js's
source `authPermissions` domain."* That instruction is the bug surface.

**The switch is already a hand-copy of the derivation.** `PAGE_OPTIONS` is
`view-page, edit-page, create-page, edit-page-permissions, publish-page` — identical, item for item,
to `page.format.js`'s page-level `permissionDomain`.

## The design

### Scope comes from the format tree, not a keyword

A pattern declares its formats by each `siteConfig` entry returning `format` — the established
convention, five of seven types (see `documentation/pattern-registry.md`). **`siteConfig` is an
ARRAY, and each entry may carry its own format for its own row kind**, which is how one pattern type
owns several:

| pattern | config | format | row kind |
|---|---|---|---|
| `admin` | `adminConfig` | `cloneDeep(adminFormat)` | the **site** row |
| `admin` | `patternConfig` | `cloneDeep(pattern)` | the **pattern** row |
| `page` | `pagesConfig` | `cmsFormat` + `registerFormats` | page, component, page-edit |

So:

```
formats(pattern) = ⋃ over every siteConfig entry
                     ( that entry's format, plus its registerFormats tree )
                   keyed by ROW KIND (the type with the instance prefix stripped)
```

`descendants` = the domains of the kinds BENEATH the pattern. `self` = the domain of the
**pattern-kind** format — and there is exactly one of those in the whole system, `admin+pattern`
(`admin.format.js:65`), because every pattern row of every type is an `admin+pattern` row. So `self`
is one authored list shared by all seven types, not a per-type invention and not a registry key.

A type may ADD to `self` with its own **pattern-instance format** — the row kind that *is* the
pattern instance, as `datasets.format.js`'s `form-manager` (`:78`, `registerFormats: [source]`) is
for datasets. Its domain carries the verbs granted at the pattern level and nowhere else:
`view-sources` and `create-source`. So:

```
self        = admin+pattern domain  ∪  the type's own pattern-instance format domain (if it has one)
descendants = every other format in the type's tree
```

`page` has no pattern-instance format — its top kind is `page` (`cmsPageFormat`, `:106`), already a
descendant — so its `self` is the shared domain alone.

**Why `view-sources` must be `self`, not `descendants`.** It is the verb that decides whether you can
see any pages at the datasets level, and it gates the pattern's whole route subtree by name
(`datasets/siteConfig.jsx:118`). Put it in `descendants` and a pattern-level
`public: ['view-sources']` would open every source beneath it — the identical shape to the `view-page`
regression this task exists to undo.

For `admin`, its pattern-instance format IS the shared `admin+pattern` one (`patternConfig`), so the
**site** format and everything registered under it — `pattern`, `tenant`, `themeFormat`,
`dmsEnvFormat` — are its `descendants`. That is what the shipped vocabulary already encodes, and it
is why admin needs no capabilities-vs-verbs distinction: `manage-themes`, `manage-tenants`,
`create-pattern` and `view-pattern-list` govern theme, tenant and pattern rows, which are exactly
those registered formats.

**Conflicts: the later entry in the array wins** (owner, 2026-10-30). Two configs declaring a
`permissionDomain` for the same row kind is a **configuration error**; last-wins is the documented
resolution so the behaviour is predictable, and **nothing enforces it** — deliberately, no
validation code.

Derivation reads the UNBOUND base modules (`page.format.js`, `admin.format.js`, …) rather than
calling `siteConfig` functions, which are mount-time and take a bound `app` and instance. Binding
only rewrites `app` and prefixes `type`; it never touches `permissionDomain`. **Assert that in a
test** rather than trusting it — and note `page/siteConfig.jsx` mutates the component format at
mount with `pattern.additionalSectionAttributes`, so the rule is: instance mutation may add
attributes, never permissions.

### Entry shape — additive, and already the vocabulary's shape

`authVocabulary.js` says it outright: *"It is therefore directly usable as a `permissionDomain`."*

```js
{ label: 'View Source', value: 'view-source', implies: ['read'] }
```

`label`/`value` are what the editor reads today; `implies` is what the server needs. An entry
without `implies` still resolves through `LEGACY_IMPLIES`, so nothing breaks on the way.

`*` stays an editor affordance, never a declared verb.

### Transport is UNCHANGED, and must be

**Verified 2026-10-30: `dms.formats` holds 0 rows and `dms.route.js` never references it —
`getFormat` is dead code.** The library CLAUDE.md's claim that the server already reads formats is
aspirational. So the server cannot read `permissionDomain`; the manifest emitter,
`--sync-vocabulary` and the `auth.vocabulary` column all stay exactly as they are. Only the
AUTHORING location moves: the emitter derives the vocabulary from formats instead of reading
`*.authVocabulary.js`.

## Worked example — datasets, the lists side by side

| verb | source format domain (9+`*`) | `DATASETS_OPTIONS` (12) | vocabulary `descendants` (12) | lands as |
|---|---|---|---|---|
| `view-source` | ✅ | ✅ | ✅ | descendants |
| `download-source` | ✅ | ✅ | ✅ | descendants |
| `update-source` | ✅ | ✅ | ✅ | descendants |
| `edit-source-data` | ✅ | ✅ | ✅ | descendants |
| `create-view` | ✅ | ✅ | ✅ | descendants |
| `manage-downloads` | ✅ | ✅ | ✅ | descendants |
| `view-source-api` | ✅ | ✅ | ✅ | descendants |
| `delete-source` | ✅ | ✅ | ✅ | descendants |
| `edit-source-permissions` | ✅ | ✅ | ✅ | descendants |
| `create-source` | — | ✅ *"pattern level only"* | ✅ | **self** (`form-manager`) |
| `view-sources` | — | ✅ | ✅ | **self** (`form-manager`) |
| ~~`view-page`~~ | — | ✅ | ✅ | **deleted** — see decision 2 |

The last three are the delta that makes `DATASETS_OPTIONS` 12 against the format's 9, and all three
are pattern-level by intent. Moving them to `self` is the substance of this task; merging the lists
is not lossless bookkeeping, and the `view-page` row is precisely where it went wrong before.

## Decisions — SETTLED 2026-10-30 (owner)

**1. `self` is the shared `admin+pattern` format — NOT a registry key.** *(Revised 2026-10-30;
supersedes the original "self lives on the registry entry".)* Owner: *"I want all patterns to work
the same even if we have different work to get them there"* and *"you could think of the format for
admin as site"*. Every pattern row of every type is an `admin+pattern` row, which is why five of the
seven vocabularies hand-copy an identical `self` bucket. That one format's `permissionDomain` is the
`self` source for all seven, and the registry carries no `permissionDomain` at all.

This also removes the capabilities-vs-verbs line the earlier draft was about to draw. Admin's
site-level verbs — `manage-themes`, `manage-tenants`, `create-pattern`, `view-pattern-list` — govern
theme, tenant and pattern rows, which are exactly the formats registered under the site. They derive
as ordinary `descendants`, with no new concept.

**2. The pattern-row read verb is `view-pattern`; the datasets-level view is `view-sources`.**
*(Revised 2026-10-30; supersedes "view-page is self only for datasets".)* `view-page` appeared
**twice** in the datasets vocabulary, both labelled "View Pattern". In `descendants` it meant a
pattern-level `public: ['view-page']` opened every source beneath it — the live regression that cost
a public county page 327 lines ([row-auth-uda.md](./row-auth-uda.md)). In `self` it means *read this
pattern row*, which has nothing to do with pages; datasets has no page row kind at all (its formats
are `source` → `view`).

- The `descendants` entry is **deleted**. The verb that decides whether you can see any pages at the
  datasets level already exists: **`view-sources`**, which gates the pattern's entire route subtree
  (`datasets/siteConfig.jsx:118`, `reqPermissions: ['view-sources']`). `view-source` (singular) stays
  as the per-source read.
- The `self` entry is **renamed** `view-page` → `view-pattern` on the shared pattern-row domain. One
  string currently means "view a page" on page patterns and "read the pattern row" everywhere else.
  **This is a migration, not a label swap** — see Phase 5.

**3. The read gate asks ONE structural question; `view-source` is the direct read verb.**

```
may read a source  ⟺  the merged chain grants structural `read`
```

`view-source` implies `['read']` and is the plain verb an author grants to mean "may see this".
Anything that logically includes seeing gets it through `implies` (`update-source` → `read,edit`;
`edit-source-data` → `read,create,edit,delete`). **`READ_PERMISSIONS` stops being a declaration** —
it is a consequence, derived, not maintained.

Capability verbs sit on the other side of that line: `download-source`, `manage-downloads` and
`view-source-api` keep `implies: []`, confer no row access, and are checked **by name** where they
are used. Owner's rule: *"read in the system needs to be different from download — users need to be
able to access a dataset in the system but not be able to download it."* Both directions now hold:
`view-source` alone reads without downloading, `download-source` alone downloads without reading.

> **A shipped defect this exposes, fixed as part of this task.** `verbsFor` ends
> `return named.length ? named : ['edit']`. A verb that maps to no structural verb therefore falls
> through to **`edit`**, silently overriding the `implies: []` the vocabulary declares. Measured
> against the real `holdsAny`:
>
> ```
> download-source only   may download? false     ← the cap `migrate-source-auth-to-permissions.js`
> update-source  only    may download? true         applies to anonymous `public`
> ```
>
> So today the download route is gated by `edit` — too strict for the people meant to hold it, too
> loose for everyone who edits. The fix is for a no-structural-verb permission to be checked by NAME
> rather than defaulted. `verbsFor` is load-bearing for every row judgment, so this needs its own
> test and its own "Done when" line, not a quiet ride-along.

**4. `chat` and `qa` get a minimal real format**, not an auth-style stub. A stub
(`{app, attributes: []}`, as `auth` returns) has nowhere to hang a `permissionDomain`, so their
descendants verbs would derive EMPTY and Phase 2's equality assertion would fail for both. A format
with one auth attribute keeps the verbs and satisfies the rule.

**5. `delete-pattern` belongs to `admin` only** (owner, 2026-10-30). It moves off the pattern-row
domain onto the **site** format's, beside `create-pattern` — deleting a pattern is a site operation,
and only the admin type registers the site format, so only admin's vocabulary offers it. Measured on
`rowauth-test`: **0 stored grants name it**, any pattern type, so the move costs nothing. Two server
corrections follow, both making delete symmetric with create:

- `dms-server/src/routes/dms/dataAuth.js:192` asks `siteCan('create-pattern')` to create, but `:195`
  asks `patternCan(pattern, ['delete-pattern'])` to delete — reading the grant off the row being
  deleted. Delete asks `siteCan('delete-pattern')`. The site row's `SITE_KEYS.patterns` (`:168`)
  already lists create and delete together, so that half is right already.
- `kindReadAuth.js:34` lists `delete-pattern` in `PATTERN_READ_PERMISSIONS`. A site-level verb is not
  a way to earn a read on a pattern row; it drops out of that list.

**6. `auth` gets a real format too — same rule, more work behind it.** Both its `siteConfig` entries
return the stub `{app, attributes: []}` (`auth/siteConfig.jsx:163`, `:343`). It declares `user` and
`group` formats carrying `auth-users` + `view-as` and `auth-groups` respectively. Those rows live in
the auth database rather than `data_items`, so nothing resolves their `implies` against a row and the
routes stay gated by a **by-name** check — the same mechanism Phase 4(b) establishes for
`download-source`, not an exception carved for auth. Where a row is STORED is a storage fact; the
format declares that the row kind exists and owns its verb list.

### Left open, deliberately

**The anonymous `public` cap — CLOSED 2026-10-30, no change needed.** An earlier note here said
`migrate-source-auth-to-permissions.js` caps `public` at exactly `download-source`, which would have
meant *"the public may download the file but may not see the source"*. That was a MISREADING: the
script's cap is `PUBLIC_CAP = new Set(['view-source', 'download-source'])`, so a public `*` expands
to view AND download and the pathological pairing never occurs. Owner, 2026-10-30: *"If they can't
see it, they can't see it and I don't care about the download."* Left exactly as it is.

**`hazmit_dama` sources are private to the public — POLICY, not an artifact.** Measured 2026-10-30
across all **13,390** sources in the pgEnv: **none grants the anonymous `public` group anything.**
10,372 carry `AVAIL: ['*']` alone; 2,988 carry an explicit `public: []`; the rest add a named user
to one of those. The `public: []` ones are deliberate — `createDamaSource` writes
`{ users: { <creator>: ['*'] }, groups: { public: [] } }` and `src/dama/CLAUDE.md` states the
consequence outright: *"New sources are private by default … a public page charting one goes blank
under `enforce` unless the source grants `public: ['view-source']`."*

So enforcement did not break this; it is the documented default meeting a public site.
**Five of them are charted by `rowauth-test` pages**, all `AVAIL: ['*']` and nothing public:

| source | name |
|---|---|
| 379 | AVAIL NYS Floodplains |
| 885 | FEMA National Risk Index — Census Tracts |
| 891 | FEMA National Risk Index — Counties (Map) |
| 1396 | AVAIL Fusion County Losses by Hazard |
| 1612 | AVAIL NFIP Community Boundaries |

**APPLIED 2026-10-30, to production, on the owner's rule.** Owner: *"The production site currently
has public read that is the current base behavior"* — reads run at `log`, which refuses nothing, so
the grants described nothing that was actually enforced; and *"grant public: view-source on any with
another grant but not an explicit public: []"*. Applied with
`src/scripts/grant-public-read-sources.js --apply`: **10,373 sources** gained
`public: ['view-source']`, 0 were already public, 0 skipped. Verified after: 10,373 readable,
3,017 refused, none left without a `public` key. `download-source` untouched.

Before-state and a per-row transactional revert are in the session scratchpad
(`hazmit-before-10373.json`, `hazmit-revert-10373.sql`).

**What the catalogue looked like when the dust settled.** Not one source in the pgEnv had EVER been
granted public read by a person — the count of non-empty `public` lists before this was zero. So the
three-way split is:

| | n | what it means |
|---|---|---|
| intentionally public | **0** | nobody ever granted the public read, before or after |
| public by rule (2026-10-30) | **10,373** | had a grant, never refused the public |
| intentionally non-public | **29** | the migration read a legacy numeric `auth` with no public grant |
| non-public BY DEFECT | **2,988** | see below |

**The 2,988 are a defect, not a refusal.** Every one is category `Uploaded File`, type `file_upload`
— 100% uniform, the same page attachments as the 10,013 that were granted, same owner naming
(`{app}+{instance}|{pgEnv}`). Their `auth_permissions` is `{users:{}, groups:{public:[]}}`: no
creator, no group, nobody. `createDamaSource`'s default is
`{ users: { [user_id]: ['*'] }, groups: { public: [] } }`, and `file-upload-route.js:135` passes
`user_id ? +user_id : null`, so an upload with no identified user loses the creator clause and only
the refusal survives. `user_id` on the row is null too, so the creator is not recoverable.
`isUnstated` needs BOTH buckets empty, so these count as stated-with-nobody-granted: under `enforce`
**no one can read them, editors included.** Ids 11732–14767, the newest block, so the route is still
producing them. NOT repaired — own task.

**Also left for later:** 28 of the granted sources are category `Sandbox`
(`DEFAULT_NEW_SOURCE_CATEGORIES`, i.e. the creator picked none) with names like "fema test" and
"sba teest". They met the rule honestly but are scratch work; they are a one-line revert from the
snapshot.

A DAMA pgEnv is NOT namespaced per app the way `data_items` is —
`hazmit_dama` is the live database behind production MitigateNY, so a write here changes the
production site. That standing constraint (*"I don't want to migrate prod I only want to migrate
rowauth-test"*) is about the DMS row-auth MIGRATION — adding `auth`/`parent_id` columns — and the
owner authorised this grant explicitly. `src/scripts/grant-public-read-sources.js` adds
`view-source` to `groups.public` on an EXPLICIT source list, never removes anything, never touches
`download-source`, has no `--all` flag, and is a dry run unless `--apply`. The authoritative list for
a given site is its `[read-auth] would-deny` log under `enforce` — the procedure
`src/dama/CLAUDE.md` already prescribes.

**`view-source-api` is dead.** Checked nowhere in client or server — it appears only in option
lists, `READ_PERMISSIONS` and two migration scripts. It stays declared with `implies: []` so existing
grants do not silently change meaning; removing a grantable verb is a data question for later.

## Plan

- [x] **Phase 0 — decide.** Settled 2026-10-30; see Decisions above.
- [x] **Phase 1 — `implies` into the domains. DONE 2026-10-30.** Added to every entry of the
      datasets source domain (9 + `*`) and both page domains (page + section). No reader changes;
      the vocabulary files stay authoritative, so behaviour is unchanged. Two things came with it:

      - **`edit-page-params` added to the page domain.** It was declared in the vocabulary AND in
        `LEGACY_IMPLIES` but appeared in no `permissionDomain`, so it had never been grantable
        except through a blanket `*`.
      - **A real regression fixed in `page.authVocabulary.js`.** Its `edit-page` declared
        `['read','edit']`, but deleting a page requires exactly `edit-page`
        (`dataAuth.js:220`) and `LEGACY_IMPLIES` has encoded `['read','edit','delete']` since
        2026-10-29. So on an app whose vocabulary had been synced, an `edit-page` grantee was
        REFUSED a page delete that kind auth allows — the same class of error as `view-page` in
        `descendants`, introduced by the same commit. Corrected to include `delete`.

      New test, `permissionDomain implies agrees with the vocabulary` (2 cases, page + datasets):
      every domain entry must declare implications identical to the vocabulary's. The existing
      "covers its domain" tests only check a verb EXISTS; this one caught `edit-page` on its first
      run. Client suite 792 passing (12 pre-existing failures, unchanged); server `npm test` exit 0;
      `test-read-auth` 30/30, `test-source-auth` 50/50, `test-row-auth-reads` 20/20.
- [x] **Phase 2 — the derivation. DONE 2026-10-30 for the two types that have domains.**
      `patterns/deriveAuthVocabulary.js`: `descendants` = the union of every format's
      `permissionDomain` plus its `registerFormats` tree; `self` = the registry entry's own domain;
      `*` dropped; a scope with no verbs omitted, as the hand-written files do; **last entry wins**
      on a duplicate row kind. `tests/deriveAuthVocabulary.test.js`, 6 cases:

      - **page reproduces exactly**, both scopes.
      - **datasets reproduces with the three pattern-level verbs moved to `self`** — the intended
        delta, asserted explicitly, so an UNintended divergence still fails.
      - wildcard dropped, empty scope omitted, last-wins, `registerFormats` walked.

      Comparison is on `value` + `implies`, not `label`: the two lists were written by hand and
      differ in case ("View Source" vs "View source"). The domain's label is the one the editor
      shows and therefore the one that survives, so that difference is not a defect.

      **ORDERING CORRECTION.** Phase 2 cannot cover all seven types yet, and Phase 3 must not run
      until it can: `auth`, `admin`, `qa`, `mapeditor` and `chat` have no `permissionDomain` at all,
      so deleting their vocabulary files would delete their verbs outright. **Phase 5 now precedes
      Phase 3** — declare the missing domains first, extend this suite to all seven, then flip the
      readers.
- [x] **Phase 3 — flip the readers. DONE 2026-10-30.** The seven `*.authVocabulary.js` files and
      `permissionOptionsFor`'s switch are gone; a verb is declared once, in a format.

      **What reads what now.** `registry.js` derives each type's vocabulary at registration from
      `formats` / `instanceFormat` and refuses a definition that still sets `authVocabulary`.
      Transport is unchanged: the derived object is stamped onto the pattern row exactly as before.
      `publicRead` and the new `siteFallback` moved onto the registry entry, since they are
      declarations about the type rather than verbs.

      **The shared pattern-row domain lives in `patterns/patternRow.domain.js`**, referenced by
      `admin.format.js`'s pattern format (where a domain belongs) and by `registry.js` (which must
      not pull in admin.format.js's lazy component imports to derive). One authored list, two
      readers.

      **The Access editor** is `patternPermissionOptions` in `registry.js`: `*`, then `self`, then
      `descendants`, deduped. The auth pattern's site-level fallback is declared —
      `siteFallback: 'admin'` on the auth entry — rather than switched on a type name in code.

      **The emitter had to change too.** It loaded vocabulary files as pure-data `data:` URLs;
      formats are not pure data (admin.format.js imports display components and the registry). It
      now bundles each format with esbuild under a resolver that keeps only `*.format.js` /
      `*.domain.js` / `*.childRefs.js` and stubs everything else — a display component cannot carry
      a verb. `--extra` takes a FORMAT module now. All seven types emit, where
      `--sync-vocabulary` previously reported two (`qa`, `mapeditor`) missing.

      **Deleting the oracles.** `tests/fixtures/shippedAuthVocabularies.js` freezes the seven files
      as they shipped so `deriveAuthVocabulary.test.js` keeps asserting the derivation reproduces
      them. It is a fixture, not a declaration — nothing in the app reads it.

      **The `--sync-vocabulary` diff on `rowauth-test`** (dry run, 81 pattern rows, 0 types missing
      from the manifest). Every difference is one of the four designed changes:
      | change | rows | why |
      |---|---|---|
      | `+ view-pattern [read]` on `self` | all types | decision 2 |
      | `− delete-pattern` from `self` | all but admin | decision 5 |
      | admin `descendants` gains the pattern-row verbs + `delete-pattern` | admin | the site tree registers `pattern` |
      | datasets `view-sources`/`create-source` `descendants` → `self`; duplicate `view-page` dropped | datasets | decision 2 |
      | auth `descendants` loses the four site-level verbs | auth | they describe the SITE's row kinds |
      | page `edit-page` `[read,edit]` → `[read,edit,delete]` | page | the STORED row is stale: Phase 1 corrected this to match `dataAuth.js` and `LEGACY_IMPLIES`, which already required exactly `edit-page` to delete a page |

      > **A defect this diff caught, in work from this same phase.** The first `auth.format.js` gave
      > `auth-users` / `auth-groups` / `view-as` `implies: ['read','edit']`, reasoning that it is
      > true of the users and groups. The hand-written vocabulary had said `implies: []`, and it was
      > right: there is no `data_items` row behind these verbs, so the only thing those structural
      > verbs could reach is a descendant of the auth PATTERN row — quietly widening every existing
      > `auth-users` grant. Reverted to `implies: []`. **Changing what a verb is offered on is safe;
      > changing what it IMPLIES is not** — the rule was already in Watch for, and the diff is what
      > enforced it. This is the argument for running the diff before `--apply`, not after.

      **Not yet applied.** The diff is a dry run; `--apply` is held until the `view-page` backfill
      lands (Phase 5(c)), since the two touch the same rows.

- [x] **Phase 4 — the read gate and the capability line. DONE 2026-10-30.**

      **(a) One structural question.** `decideRead` under the row gate asks
      `rowSourceAuth.readsRow` — does the chain grant `read`? — instead of matching nine names.
      Every verb that should confer a read already declares `read` in its `implies`; the three that
      should not (`download-source`, `manage-downloads`, `view-source-api`) declare `implies: []`.
      So reading is derived. `READ_PERMISSIONS` survives for KIND auth only, which matches by name
      and cannot expand anything, marked do-not-extend and dying with kind auth.

      **Three expansion gaps this exposed, all the same bug in different places.** The structural
      question only works if the grants have been expanded against a vocabulary, and only the
      datasets PATTERN level was:
      - `loadInternal` left each SOURCE's own grants unexpanded, so `view-source` on a source never
        became `read`. Sources have no vocabulary of their own, so they now expand against the
        union of the maps of every datasets pattern that lists them.
      - `loadExternal` did the same for external sources; they belong to no DMS pattern, so the
        legacy table is the only expansion available.
      - `namedPattern` returned `readNamedPattern`'s raw strings, so a pattern named on the request
        lent `view-source` as a bare string. It now reads that pattern's vocabulary and expands.
        `sourceAuth.js` (kind auth) is left untouched.

      Fixing these **also closed the two long-standing `holdsOnSource` redaction failures**:
      `test-read-auth.js` is 30/30 under BOTH gates, up from 28/30 under `row`.

      **(b) `verbsFor` no longer defaults to `['edit']`.** It returns an empty array for a
      permission that implies no structural verb, and the caller checks that permission BY NAME —
      `holdsPermission` in rowAuthGate.js, used by `holdsAny` (uda) and `decide.rowCan`. This works
      with no new plumbing because `expandPerms` is ADDITIVE: expansion adds the structural verbs
      and keeps the original strings, so a merged chain still holds `download-source` itself.

      `rowCan` keeps its exact prior contract — ALL of the structural verbs the permissions imply —
      with only the fallback changed. An earlier draft also flipped it to ANY-of, which is arguably
      what `dataAuth.js`'s call sites mean, but that is a separate behaviour change and was reverted.

      > **One tightening to watch.** `siteCan('*')` used to mean "holds structural `edit` on the
      > site row", because `*` maps to no structural verb and fell through to `['edit']`. It now
      > means "holds literal `*`". A site granting only `manage-themes` (→ read, edit) therefore
      > stops passing `siteCan('*')`, which `dataAuth.js` uses for any non-edit site op and for
      > unlisted keys. That is the correct reading, but it is stricter than yesterday.

      **Pinned, and proved to have teeth.** `test-row-auth-uda.js` section 5 (6 cases) asserts both
      directions against the real `holdsAny`. Reverting `verbsFor` to the old fallback fails three
      of them with exactly the measured symptom: `download-source` alone → cannot download,
      `update-source` alone → can.

- [x] **Phase 5 — every row kind gets the domain that describes it. DONE 2026-10-30.** Ran BEFORE
      Phase 3, which it unblocks. `deriveAuthVocabulary` now covers **all seven** types —
      `tests/deriveAuthVocabulary.test.js` 11/11.
      `auth`, `admin`, `qa`, `mapeditor` and `chat` have no `permissionDomain` at all, so today they
      fall to `permissionOptionsFor`'s `default:` and can only ever be granted the generic three.
      This is the author-empowerment half of the task. Five steps, in this order:

      **(a) The shared pattern-row domain.** Add `permissionDomain` to `admin.format.js`'s `pattern`
      format (`:65`, whose `authPermissions` attribute at `:134` has none). This becomes `self` for
      all seven types:
      ```js
      { label: 'View Pattern',             value: 'view-pattern',             implies: ['read'] },
      { label: 'Edit Pattern',             value: 'edit-pattern',             implies: ['read','edit'] },
      { label: 'Edit Pattern Permissions', value: 'edit-pattern-permissions', implies: ['read','edit','grant'] },
      ```
      No `delete-pattern` (decision 5), no `view-page` (decision 2).

      **(b) Admin's lists onto the site tree.** The site format (`patternAdminFormat`, `:163`) has no
      `authPermissions` attribute — add one carrying `*`, `view-pattern-list`, `create-pattern`,
      `delete-pattern`. `manage-themes` goes on `themeFormat`, `manage-tenants` on `tenant`. Admin's
      `descendants` then derives from site + pattern + theme + tenant + dmsenv with no special case.

      **(c) `view-page` → `view-pattern`, with the migration.** NOT a rename. Measured on
      `rowauth-test`: **every stored grant sits under the wildcard scope `*`** — there are zero
      `self:`/`descendants:`-scoped grants — so scope `*` satisfies both buckets, and the **172
      `view-page` grants on page patterns are what currently earns the pattern-row read** through
      `PATTERN_READ_PERMISSIONS`. Swap the string and those pages stop loading. So:
      1. `kindReadAuth.js:34` accepts `view-pattern` **and** `view-page` on pattern rows;
      2. backfill `view-pattern` alongside `view-page` wherever a pattern-row grant names it;
      3. only then does `view-page` leave the pattern-row domain. Dropping the server's acceptance of
      it is a later, separate step.
      **DONE on `rowauth-test` 2026-10-30.** `src/scripts/backfill-view-pattern.js` (dry run unless
      `--apply`) ADDS `view-pattern` beside every pattern-row grant of `view-page` and removes
      nothing — 64 of 81 rows, 354 grants, across the `*` scope and the `data.authPermissions`
      mirror; `descendants` is skipped, since there `view-page` means a page. Re-running reports 0,
      so it is idempotent. `--sync-vocabulary --apply` then followed: **81/81, vocabulary coverage
      100% for the first time** (it was 79/81 before this task, with `qa` and `mapeditor` missing).
      Only **1** non-page pattern row (a datasets one) names `view-page` today, so the
      `descendants` deletion in decision 2 affects a single stored grant.

      **(d) `mapeditor`, `qa`, `chat`.** `mapeditor` has `mapeditor.format.js` already — add the
      domain (3 verbs). `qa` and `chat` get the minimal real format of decision 4; for `chat` that
      means finally giving `{instance}|channel` a format, the non-conformer recorded in
      `documentation/pattern-registry.md`.

      **(e) `auth.format.js`.** New file per decision 6: `user` (`auth-users`, `view-as`) and `group`
      (`auth-groups`) formats, replacing the two `{app, attributes: []}` stubs.

      **Two divergences the derivation surfaces — resolve them here, don't paper over them.**
      `view-pattern`/`view-page` on the pattern row is listed only by datasets today, with the
      comment *"the server needs it to load ANY non-auth/admin pattern row"* — so it was never
      datasets-specific and the shared domain gives it to all seven. And `delete-pattern` is absent
      from `auth` and `admin` alone; decision 5 makes that moot by moving it to the site.

      **Done when** `deriveAuthVocabulary` covers all seven and
      `tests/deriveAuthVocabulary.test.js` asserts each as equality.

      **What landed (2026-10-30).** The derivation gained an `instance` parameter: a type's
      pattern-instance format contributes its OWN domain to `self` and its `registerFormats` tree to
      `descendants`. Without it, `form-manager`'s verbs landed in both scopes. `page` and `admin`
      pass no `instance` — their top formats (`page`, `site`) are already descendant kinds.

      Server + client changes made with (c): `kindReadAuth.js` accepts `view-pattern` AND `view-page`
      on pattern rows and no longer accepts `delete-pattern`; `legacyVerbs.js` maps `view-pattern` to
      `['read']`; `dataAuth.js`'s pattern-delete branch asks `siteCan('delete-pattern')`;
      `adminPermissions.js` drops `DELETE_PATTERN` from `PATTERN_ADMIN_PERMISSIONS` and
      `patternActions.delete` now asks `siteCan`. Three access-matrix cases in
      `adminPermissions.test.js` were rewritten to the new rule and a positive site-grant case added
      (36/36).

      **A divergence found and asserted, not papered over.** `auth`'s shipped vocabulary carries the
      four SITE-level verbs (`view-pattern-list`, `create-pattern`, `manage-themes`,
      `manage-tenants`) because site access falls back to the auth row while the admin row grants
      nothing (`adminPermissions.js`, `adminRowHasGrants`). Those describe the SITE's row kinds, so
      they derive from the admin type and not from auth. The fallback reads grants off the row and
      does not consult auth's vocabulary, so this should be inert — the test asserts the absence
      explicitly so it is a decision rather than an accident. **Verify against a live site before
      Phase 3 deletes `auth.authVocabulary.js`.**

      **`qa` and `chat` — settled 2026-10-30 (owner): a simple format with a single `settings`
      attribute, "they can be updated later".** Neither had a format, and both build their config
      from the page pattern's (`getPatternType("page").siteConfig[0]`), so their ticket/channel rows
      are page rows and there was nowhere to hang a domain. `qa/qa.format.js` and
      `chat/chat.format.js` each declare one `settings` attribute carrying the `permissionDomain`;
      both reproduce their hand-written `descendants` exactly. This also closes `chat`'s
      `{instance}|channel`-with-no-format, the non-conformer recorded in
      `documentation/pattern-registry.md`.

      Deliberately NOT done: neither format is wired as the config's runtime `format`. Both patterns
      depend on the page config's format to render and edit their rows, and swapping it would change
      behaviour for no gain here — the format exists to own the verb list. Phase 3 feeds these
      modules to the emitter; `settings` can be filled in when either pattern needs stored
      configuration of its own.

      **The domain sits on the `settings` attribute, not an `authPermissions` one.** The derivation
      reads `permissionDomain` off ANY attribute, so this works; but `permissionsPane.jsx` and
      `SourceAccessEditor.jsx` look the domain up by `attributes.find(a => a.key ===
      'authPermissions')`. That per-attribute lookup is for page and source ROWS; pattern-level
      grants go through `permissionOptionsFor`, which Phase 3 replaces with the derivation. If
      either pattern later wants a per-row Access editor, the domain moves to an `authPermissions`
      attribute then.

## Done when

1. ✅ A verb appears in exactly one authored list. `grep -rn "authVocabulary" src/patterns` returns
   only the validator module, the registry's derivation + stamping, the test, two components that
   read the row's stored copy (transport), and comments. No second declaration.
2. ✅ `deriveAuthVocabulary` reproduces all seven, asserted as equality against the frozen fixture
   in `deriveAuthVocabulary.test.js` (11/11). Intended differences are asserted case by case.
3. ✅ `--sync-vocabulary` on `rowauth-test` differs only by the designed changes — table in Phase 3.
   Dry run only; `--apply` waits on the `view-page` backfill.
4. ✅ `test-read-auth.js` 30/30 and `test-source-auth.js` 50/50 under BOTH gates (read-auth was
   28/30 under `row` before this task), `npm test` exit 0, every row-auth harness green.
5. A pattern-level `public: ['view-page']` grant on a datasets pattern confers **no** source read —
   the regression from `row-auth-uda.md`, asserted through `allowSourceRead`.
6. ✅ `download-source` alone downloads and does NOT read; `update-source` alone reads and does NOT
   download. Asserted against the real `holdsAny` (`test-row-auth-uda.js` §5), and verified to fail
   on the pre-fix `verbsFor`.
7. A pattern-row grant of `view-page` still loads the pattern row after the `view-pattern` rename —
   the 172 live page grants are the test case, and breaking them breaks every page on the site.
8. `delete-pattern` is offered by `admin` and by no other type, and deleting a pattern asks
   `siteCan`, not `patternCan`.

## Watch for

- **The one-way test is what let this happen.** `permissionDomain ⊆ authVocabulary` cannot catch a
  verb in the wrong scope, nor a vocabulary verb no editor offers (`view-sources`, `create-source`
  today). Equality is the point of Phase 2, not a nicety.
- **`MultiSelect` keeps stored values that are not in its options**, so narrowing an option list
  never drops a saved grant. Changing what is OFFERED is safe; changing what a verb IMPLIES is not.
- **Do not make the server read formats** to "simplify" this. The table is empty and nothing
  populates it; that is a separate piece of work with its own migration.
