# Unified auth API: verbs in the rows, one merge function

**Initiatives:** [dms_data_safety](../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** done · **Created by:** amuro@albany.edu · **Edited by:** —

Superseded 2026-11-04 by [auth-layer-simplification.md](./auth-layer-simplification.md), which took the
remaining items (Phase 2's `sourceReads.js`, Phase 3's level deletion) and replaced the design's
structural-verb merge with the owner walk. Design: [research/unified-auth-api.md](../../research/unified-auth-api.md) ·
Artifact: https://claude.ai/artifact/QKmF4GyzboVHSAVRwJvaCv
Follows [row-auth-uda-unify-api.md](./row-auth-uda-unify-api.md) (Slices A–P), which left the walk,
the merge and the judgment unified and named what had not moved.

## Objective

One authorization question, asked everywhere:

> **Given a row and the grants it carries, may this user do this verb to it?**

The judge already exists. What remains is moving three kinds of knowledge out of CODE and into
ROWS, and changing the one surface that asks by id rather than by row.

## Phases

### Phase 1 — field rules into the vocabulary

A `permissionDomain` entry may name the FIELDS its verb governs:

```js
{ value: 'publish-page', implies: ['read','edit'], fields: ['sections','section_groups','dataSources'] }
{ value: 'edit-page',    implies: ['read','edit','delete'], fields: ['*'] }   // the unclaimed default
```

- [x] `fields` (and one `when` value-predicate) through `deriveAuthVocabulary`
- [x] `impliesMaps` builds a field → verbs map beside the implies map
- [x] `verbsForFields(fields, maps)` — one helper, read by BOTH providers
- [x] the row judge uses it in place of `GRANT_KEYS`
- [x] kind auth's judge uses it in place of `authRules.js` `byKey` / `when` / `onlyKeys`
- [x] delete `GRANT_KEYS` and those three rule forms

**Done when** `test-data-auth.js`'s six attribute clauses stay green with the rules read from data,
and the write differential's `field` reason disappears.

### Phase 2 — UDA asks by row

- [x] `authorize()` — the one question, either call shape (`routes/auth/authorize.js`)
- [x] UDA read call sites ask it by name
- [x] `sourceGuards.js` collapses to one transport helper per transport (`requireCan` / `assertCan`)
- [x] every UDA / DAMA read asks `authorize` — views, listings and quiet capability checks included
- [ ] `sourceReads.js` collapses into the snapshot cache — still open, see below

**Cost to measure first:** five `uda.route.js` sites gate BEFORE fetching.
**Done when** the verdict dump shows zero verdicts lost.

### Phase 3 — auth-row levels become grants

- [x] read-only report: `src/scripts/audit-auth-levels.js`
- [x] run it against the clone's real project (owner granted the auth-DB read)
- [x] write the equivalent grants onto `rowauth-test`'s auth pattern row — 32 groups
- [x] delete `canOrLevel`, `levelCounts`, `levelCoversGroup`, `levelOutranks` — no level decides anything
- [x] the CLIENT stops reading levels too (owner: "the new code should never reference them")
- [ ] the level-MANAGEMENT machinery (the `adjustAuthLevel` route, the token fields, the visibility filters) — left alone by owner's call

⚠ The auth DATABASE is shared across apps. Reads are safe; the only write is to a `rowauth-test`
row in the DMS database.

### Phase 4 — site grants onto the site row

- [x] write the admin pattern's site-wide grants onto the `:site` row of `rowauth-test`
- [x] the `sibling-grants` divergence resolves; the four left under that label were re-pinned, see below

## Constraints

- `rowauth-test` only. Never prod, never a shared DAMA pgEnv.
- No kind/type names in server code; no business logic in the server.
- One source of configuration truth — a verb is declared once, in a format.
- Two flags, and this spends none of the budget.

## Build log

### Phase 1 — field rules into the vocabulary (DONE 2026-11-03)

**The differential's `field` reason is gone**, with all four of its entries, plus the `noChange` one.
That was the done-when.

`permissionDomain` entries now carry `fields` (and one `when` value predicate), declared in the
format that owns the attribute — `page.format.js`, `patternRow.domain.js`, `dmsEnv.format.js`,
`admin.format.js`. `verbsForFields` reads them, and BOTH implementations call it.

#### Four things that were wrong on the first attempt, each caught by a suite

1. **A flat list cannot say what a field rule means.** Two fields in one write need a verb EACH;
   two verbs claiming one field mean EITHER. `filters` is granted by `edit-page` *or*
   `edit-page-params`, and a flat list silently merged that with the all-of case. The helper returns
   **any-of groups**.
2. **The field map has to be SCOPED.** A pattern row's vocabulary carries both: `edit-pattern`
   claims `*` under `self`, `edit-page` claims `*` under `descendants`. Flattened, an ordinary page
   edit asked for "edit-pattern or edit-page" — offering a page editor the pattern's verb and the
   reverse. A row is `self` when it declares its own vocabulary, `descendants` when it inherited one.
3. **Row auth must ask for the NAME, not the implications.** `publish-page` and `edit-page` imply
   the same structural verbs, so asking for implications let any page editor publish — which is
   precisely what the `field` reason recorded. Asking by name works because expansion is additive:
   a merged chain holds `publish-page` itself beside the verbs it conferred.
4. **Any-of alternatives must not log.** Judging a group with `judgeOne` wrote a would-deny for
   every alternative that failed before one passed, so a *granted* publish logged a refusal.
   `judge(..., { raw: true })` returns the rule's own verdict with the mode unapplied; the caller
   applies it once, for the whole group.

#### Two things stayed in code, deliberately

- **The escalation floor.** `['authPermissions','auth','auth_permissions']` still require `grant`
  below the declarations. These are the auth layer's OWN storage keys, not a pattern's business
  logic, and without the floor an app that declares nothing lets anyone holding `edit` grant
  themselves anything. A vocabulary that claims them agrees exactly.
- **The site row's `dms_envs`.** The one clause judged against a DIFFERENT owner's grants
  (datasets, not site). No vocabulary can say that, so `byKey`'s `anyOf`-with-owner form survives
  for it alone — and the fallback is now PER KEY, because all-or-nothing dropped it silently.

#### Verified

All 20 suites 0 failed. Write differential back to its known 4 unexpected; UDA differential 1.
`--sync-vocabulary --apply` on `rowauth-test`: 81/81 pattern rows + 5 env rows rewritten with the
claims, then 81/81 current on a re-run. `--audit-writes` **35 of 10933, unchanged**, cross-check
300/300, and the grant sweep still verifies clean.


### Phase 4 — site grants onto the site row (DONE 2026-11-03)

New: `src/scripts/sweep-site-grants.js` (dry-run / `--apply` / `--verify`). It computes site-level
grants exactly as `dataAuth.siteGrants` does — the admin pattern rows' union, falling back to the
auth pattern's while admin grants nothing — and merges them into the `:site` row's `auth`.

**`--audit-writes` went 35 of 10933 → 0 of 10933.** Every row on `rowauth-test` is now writable by
a grantee rather than by `rowauth-test Admin` alone. Three principals carried over (`AVAIL`,
`DHSES`, `users.1`, all `*`).

**The site row needed a vocabulary too.** It is the ROOT of every chain, so the verbs that govern it
are its OWN. `emit-auth-vocabulary.mjs` now emits `:site` beside `:dmsenv`, derived from the admin
site format; `--sync-vocabulary` pass 1b stamped it with no script change (it already claims every
`:`-prefixed manifest key).

**A modelling correction fell out of it.** `manage-themes` and `manage-tenants` are declared on the
theme and tenant formats, where they govern those ROWS — but the fields they claim (`theme_refs`,
`tenants`) are the SITE row's attributes. Declaring the claims there put them in `descendants`,
where a site-row edit never looks. They are now also declared on the site format itself, claiming
its fields: same verb, two scopes, one meaning.

Six more differential entries resolved, including the `OPEN` **scope collapse** widening — a FLAT
`edit-page` grant on a pattern row also conferred editing the pattern row itself. Phase 1's scoped
field maps fixed that: `edit-page` claims fields only under `descendants`.

#### The 299/300 cross-check, explained and fixed

`--audit-writes` had been reporting its resolver cross-check at 299/300 on about one run in twenty,
recorded as unexplained in row-auth-uda-unify-api.md Slice L. Captured at last: row **#1412073
`test3|test3:view`**. Its instance name equals its parent segment, so the TYPE PATH resolves it to
itself and the chain truncates to nothing — while the audit's SQL walks to the source and sees
grants. Two rows in the app, both views, both with no `parent_id` stamped; `migrate-row-auth`
refused to guess, correctly, because the name `test3` is claimed by both a view and a source.

A `:view`'s parent is the `:source` of that name — unambiguous by KIND, which a name-only lookup
cannot see. Both stamped. **12 consecutive runs at 300/300.**


### Phase 2 — the one question, asked by name (PARTIAL 2026-11-03)

New: `routes/auth/authorize.js`.

```js
authorize({ row,  verb, fields, user, app, controller })   // a DMS row
authorize({ env, sourceId, verb, user, app })              // a datasets source
```

**The two call shapes are not two questions.** They are two ways of NAMING the row, and which one a
caller uses is a fact about that route: `dms.route.js` owns the controller and has the row, UDA
gates before fetching and knows only `(env, id)`. Resolving an address to a row is the auth layer's
job, so it happens there and a route never learns whether a source lives in `data_items` or in a
pgEnv. `uda.route.js`'s `canReadSource` asks `authorize` by name; `dms.route.js` keeps
`readBlocked` / `assertDataWrite`, which are its read and write halves phrased for its call sites.

**Verified on real data:** `authorize` agrees with the surface function it replaced on
**284/284** `(source × principal)` reads on `rowauth-test`.

#### Not done, and why

`sourceReads.js` and `sourceGuards.js` do NOT collapse yet. That needs the UDA routes to fetch the
row BEFORE gating — five call sites in `uda.route.js` read `await canRead(...) ? await fetch() : null`.

The cost IS measured and it is small: a 71-source listing answers in 28.4 ms on a cold snapshot and
1.0 ms warm, and the snapshot already holds every source row, so `sourceRow` is a cache read rather
than a query. What remains is scope — rewriting five live read paths — not a missing number.

(An earlier note here blamed a missing `puppeteer-core` for being unable to start the server. That
was wrong: it resolves, and the server boots. ⚠ But do NOT start it against the repo `.env` — it
joins the PRODUCTION DAMA task queue. Starting it once recovered 6 stalled tasks and claimed and
failed live `nysdos` task 462.)

### Phase 3 — auth-row levels (PARTIAL 2026-11-03)

`canOrLevel` is **deleted** — the transition helper "the permission, OR today's level threshold",
which no route ever called; only its own tests did.

`levelCounts` is **not** deleted, and should not be until the measurement runs. It is live, reached
through `authority().byLevel`, and it is a second authority: an integer ladder answering a question
grants also answer, able to allow what grants refuse.

New: `src/scripts/audit-auth-levels.js` — read-only, reports per user where the level answer and the
grant answer differ, the same shape `sweep-source-grants.js --verify` reports for sources.

#### The measurement, once the owner granted the auth-DB read

`rowauth-test` has no users of its own; the clone's live under the `mitigat-ny-prod` project.

```
   users in the project                              502
   WHO LOSES SOMETHING IF THE LADDER IS REMOVED      392
   GROUPS THAT NEED A GRANT ON THE AUTH PATTERN ROW   32
```

**392 of 502.** Deleting the ladder without writing grants first would have taken user- and
group-management from four fifths of the project.

`--apply` writes the conversion — per GROUP, since that is how both levels and grants are carried —
onto the app's auth PATTERN row in the DMS database. **It never writes to the auth database**,
which is shared by every app on the deployment. After it: **0 lose, 0 groups outstanding.**

#### ⚠ A data error the conversion would have baked in

One of the 32 is **`Allegany County HMP Public` at level 5** — a *Public* group holding the same
user-management level as the county Admin groups. Of the three `% HMP Public` groups in the
project, the other two are level 0. It is almost certainly a mis-set level, and the ladder is
granting user management on it today.

The conversion is faithful by design — it reproduces current access exactly — so it granted that
too. On a test clone that is harmless. **Before any production conversion, that level should be
corrected at the source**, or the error becomes a written grant and much harder to notice.

#### Why `levelCounts` is still here

The measurement says the ladder can go *for `rowauth-test`*, which now carries the grants. Deleting
it is a change to SHARED code: every other app on the deployment would lose the ladder the moment
this deploys, and none of them has been converted. `mitigat-ny-prod` alone is 502 users,
`hazard_mitigation` 440, `NPMRDS` 431.

So the pre-flight is the same shape as `legacyVerbs.js`'s was: run `audit-auth-levels.js` per app,
`--apply` the conversion, and delete `levelCounts` / `authority().byLevel` once every app reports
0. Left for the owner rather than done unasked — the blast radius is who can administer users.


### Phase 2, continued — one question, one guard per transport (2026-11-03)

**`authorize` absorbed the remaining address shapes.** A view is not a thing to be granted, so
`authorize({ env, viewId, verb })` judges it on its source; `quiet: true` asks without reporting,
for the questions whose answer SHAPES a reply rather than refusing it (may this caller see the
secrets in `statistics`, the full grant list) — a `no` there is not a refusal and must not be logged
as one. `uda.route.js`, `uda.colorDomain.route.js`, `tiles.rest.js`, `sourceRedaction.js` and
`dama/datatypes/auth.js` all ask by that one name now.

**Four guards became two.** `requireSourcePermission` / `requirePatternPermission` /
`assertSourcePermission` / `assertPatternPermission` were two transports × two SUBJECTS, and the
subject axis was the fake one — a source and a pattern differ only in which row is being asked
about. Now `requireCan(req, res, { source|pattern, perms })` for Express and
`assertCan(router, { env, source|pattern, perms })` for Falcor, across 14 call sites.

```
sourceGuards   9 → 7 exports
```

#### Three bugs from doing the migration with a regex

1. It rewrote `function registerScheduleRoutes(app)` into `(app })`. A syntax error, so it surfaced
   on the first require — but it is why the diff got read line by line afterwards.
2. It kept the old option name, producing `{ env, source, perms, patternRef }` against a signature
   that destructures `pattern`. **No error, no warning** — the pattern ref was simply dropped and
   external sources stopped inheriting. Seven `test-uda-auth` cases caught it.
3. Two shorthand `{ ..., patternRef }` properties the first fix missed, for the same reason.

The second is the one worth remembering: a renamed option fails silently, where a renamed function
fails loudly.

#### What is still open

`sourceReads.js` keeps 7 exports. `allowSourceRead` / `allowViewRead` / `filterReadableSources` are
now reached THROUGH `authorize`, so the routes no longer name them — but they still exist as the
implementation behind it, together with the mode and the would-deny line. Collapsing them into the
snapshot cache is the last step, and it is a tidy rather than a behaviour change.

**State.** All 20 suites 0 failed; differentials at their pinned 4 and 1; `--audit-writes` 0 of
10933 with the cross-check at 300/300.


### Phase 3, continued — levels stop deciding anything (2026-11-03)

Owner: *"the authlevels are deprecated, the new code should never reference them"*, and *"grants
should only come from DMS auth objects"*.

**Server.** `levelCounts`, `levelCoversGroup`, `levelOutranks` and `levelsByProject` are deleted.
`authority()` returns `byPermission` alone; `authScope()` no longer computes `authLevel`;
`platformAuthority` is `AVAIL` membership. The four `!a.byPermission && !a.byLevel` sites now ask
only the grant.

**Client.** `rankUserGroups` no longer tiebreaks on `authLevel` (it falls back to the name),
`defaultUserState` drops `authLevel`, and three "duplicate this pattern" payloads stop copying
`auth_level`.

#### A protection that was not really about levels

Dropping `levelOutranks` for a plain `byPermission` lost this: *you may not act on a user or group
that also belongs to projects you do not administer.* The level was the mechanism; cross-project
safety was the intent. `test-auth-users.js` caught it — "deletes a plain member; NOT one also in
another project's group" started passing when it should refuse.

Replaced by `coversProjects(db, user, ctx, projects, perm)`: the caller must hold the grant in every
project the target belongs to. Same protection, grants instead of integers, one `authority()` per
project — small sets, administrative routes.

#### Left alone, by owner's call

About seventy `auth_level` references remain, and they are a different category: the machinery for
MANAGING levels rather than obeying them — the `adjustAuthLevel` route, `assignGroupToProject`'s
level column, the `0..10` validation, the pairwise visibility filters in `user.js` / `group.js`,
three `gip.auth_level >= 5` queries in `auth.js`, and `authLevel` in the JWT payload. Removing those
deletes a public endpoint and changes the token shape.

### The differential's reasons, corrected (2026-11-03)

Phase 4 resolved the sibling-grants case itself, and four entries kept its label while having
nothing to do with it. Re-pinned:

| entry | real reason |
|---|---|
| site `dms_envs` | **cross-owner** — a field judged against ANOTHER row's grants, which a vocabulary cannot express. Row auth is LOOSER here. |
| a tenant row, a dmsenv row | **named-create** — a create asks for the structural verb; `fields` gave edits their named verbs but a create has no changed fields to claim |
| a source edit touching only `views` | **no-pattern-lending** — the field claim fires correctly and finds no holder, because the grants sit on the ds pattern and the source states nothing |

A wrong reason is worse than no reason: it makes a live gap look settled.
