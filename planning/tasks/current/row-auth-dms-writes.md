# Row auth 5: replace `judge()` with the resolver, keeping everything around it

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** doing · **Created by:** amuro@albany.edu · **Edited by:** —

Part of [server-side-auth-general.md](./server-side-auth-general.md) (hub). Depends on tasks 1–3. **Coordinate — this file is actively worked on.**

## Objective

Replace **kind-based enforcement with parent/child row-based enforcement** on the DMS write path,
without disturbing the machinery `permissions_move` built around it.

## What goes, what stays

| Goes | Stays |
|---|---|
| `judge()` — the eleven-case switch (`dataAuth.js`) | `assertDataWrite` and its three call sites (`dms.route.js`, `sync.js`, `dama/upload/auth.js`) |
| the per-kind grant-source lookups | `planEdit` — the changed-key diff, and "only write what was judged" |
| | `assertRowUnchanged` — the in-transaction TOCTOU re-judge |
| | `DMS_DATA_AUTH_MODE` `legacy \| log \| enforce` |

Roughly 317 lines out of the branch's ~4,400 implementation lines; everything else on the branch
guards surfaces this design cannot reach and is untouched.

## Verb mapping

`create` resolves against the **parent** (no row exists yet); `edit` and `delete` against the row;
a write naming the `auth` column needs `grant`. The branch's escalation guard
(`uda.route.js:193`'s payload sniff, and `dataAuth.js`'s `keys.includes('authPermissions')`)
becomes structural — the write either names the column or it does not.

## Coordination

`test-data-auth.js` (28 cases) tests `judge()`. Decide with its author whether it is rewritten
against the resolver or kept green alongside until the resolver is proven. **Do not delete it as part
of this task.**

## Done when

Writes decide through the resolver, the 28 existing cases have an agreed disposition, and the
regression suites the branch lists stay green.

## Built 2026-10-29: the row judge, behind `DMS_WRITE_GATE`

**`dataAuth.js` is untouched and still the default.** Owner's call: "keep the rowAuth and kindAuth
separate. I will remove kind auth when the time is right."

The row write surface lives in **`rowAuthGate.js`**, not in a file of its own — the owner's
requirement is that this become "the file that all auth goes through", and task 7's completion test
is "one decision module". Reads already come through `judge`; writes now come through
`assertDataWrite`; both end at the same `verdict`.

| | |
|---|---|
| the three call sites | `dms.route.js`, `sync/sync.js`, `dama/upload/auth.js` — old `require` commented out, not deleted |
| `DMS_WRITE_GATE` | `kind` (default) delegates to `dataAuth.js`; `row` runs the new judge |
| `DMS_DATA_AUTH_MODE` | unchanged as the write rollout flag — moving writes here must not drag them under the READ flag |
| exports | `assertDataWrite`, `dataAuthMode`, `createJudge`, `planEdit` — same names, same signatures |

`planEdit` is carried over verbatim: it is the one part of `dataAuth.js` with no kind knowledge in
it. `createGate` gained a `mode` override so the write surface can share the gate while staying on
its own flag.

`.siteCan` / `.patternCan` are **re-expressed as row judgments** (owner, 2026-10-29): `judgeOne(row,
verb)` instead of reading the pattern row's `authPermissions` directly. The admin/auth special case
is gone — a pattern with no grants of its own now inherits its site's. `rowCan` re-reads the leaf
through `authRowsByIds` because `getPatternRows` selects `id, type, data` only, so judging its rows
as given would miss the `auth` column and `parent_id`.

### Built: the two suites, and why there are two

| | |
|---|---|
| `tests/test-data-auth.js` | **KIND auth's contract.** Not ours. Green at 49/49 on the default flag, untouched. |
| `tests/test-row-auth-writes.js` | **ROW auth's contract**, asserted positively — 26 cases: what a create is judged against, claim validation, the strict defaults, the escalation guard, verbs. |
| `tests/test-row-auth-diff.js` | **The differential.** Runs the kind suite under `DMS_WRITE_GATE=row` and compares the failing set to `fixtures/row-auth-expected-diff.json`. |

The differential is the piece worth the effort, and the reason a fresh row-auth suite does not
replace it: **a fresh suite is green by construction and can never tell you something was given
up.** Its semantics:

- a disagreement not in the fixture **fails** — it is a new finding (verified: removing one pinned
  entry exits 1 and names it);
- a pinned disagreement that starts **passing is reported, never failed** — closing one is progress
  and must not break the build; the entry gets deleted;
- every fixture entry carries a **written reason**. An entry without one is the thing the fixture
  exists to prevent, so the names may be regenerated mechanically and the reasons never.

Current: **26 pinned, 0 unexpected, 1 marked `OPEN`.** The `OPEN` marker is the gate — the runner
prints *"must close before `DMS_WRITE_GATE=row` goes to enforce"*.

### The expected diff, fully accounted for (2026-10-29)

`test-data-auth.js` is **kind auth's contract**, and it stays that way — green at 49/49 on the
default flag, untouched. Running it against the row judge is a DIFFERENTIAL, not a pass/fail gate:
every disagreement is now explained, so a NEW one is a finding.

Measured by running a probe copy with the test suite's own cleanup bug fixed (see below):
**26 passed, 23 failed.**

| n | cause | status |
|---|---|---|
| **13** | `nothing stated — writes need a grant`, plus one anon case | **Decided.** Kind auth: signed-in ⊕ no grants ⇒ open. Row auth: strict (hub). Every app with unconfigured patterns loses editing on the flip — the Phase D audit script is a prerequisite, not a nicety. |
| **3** | kind refuses, row allows, on a FIELD | **Accepted, won't fix** — see below. May be revisited later (owner, 2026-10-29); it is a deliberate omission, not a gap. |
| **3** | the three race tests | **Harness.** All three drive the race by hooking `controller.getPatternRows`, which is kind auth's pattern-grant lookup. The row judge never calls it, so the concurrent edit never fires and the write correctly succeeds. The protection they test — `expect` + `assertRowUnchanged` — is in the ROUTE, is gate-independent, and is unchanged; `a judged edit of a row that does not exist still writes nothing` exercises it and passes. They need a different injection point. |
| **2** | `missing create` | **Accepted** — see "What a create is judged against". |
| **1** | **SCOPE COLLAPSE — see below** | **Open. The one real finding.** A first fix was drafted and **withdrawn** — scoping the shim's verbs is wrong, see below. |
| **1** | `log allows a refused write` | **Cosmetic.** Behaviour is right (allowed, one line logged); the assertion matches `[data-auth] … missing edit-page` and the row gate writes `[row-auth] … reason=missing edit`. |

#### A bug in the suite itself, found on the way

`test-data-auth.js`'s race test (line ~153) restores `docsPage.authPermissions` AFTER its
`try/finally`, so any assertion failure inside leaks a `users: { 10: ['edit-page'] }` grant into
every later test — three of them then fail for reasons of their own. It bit us, and it will bite the
other author the first time that test fails for their own reasons. **Not fixed here** (their file);
worth raising. Moving those two lines into the `finally` took the count 26 → 23.

#### SCOPE COLLAPSE: a page grant confers editing the pattern

The one finding that is neither decided nor cosmetic.

```js
docs pattern authPermissions: { groups: { Editors: ['edit-page'], PatEditors: ['edit-pattern'], … } }
```

Kind auth asks for `edit-pattern` to edit the pattern ROW, so `Editors` is refused. Row auth maps
**both** `edit-page` and `edit-pattern` to the structural verb `edit`, and a legacy grant is FLAT —
it governs the row *and* its descendants — so `Editors`, a grant written to govern this pattern's
PAGES, also confers editing the pattern itself (its name, its settings; not its grants, which
`GRANT_KEYS` still holds behind `grant`).

`authVocabulary.js` anticipates exactly this and names the mirror case: *"a vocabulary that could not
tell them apart would let `edit-pattern` on a pattern leak edit rights to every page under it"*. The
fix is the `self` / `descendants` split, which is **built** (task 3) and which no pattern has
declared yet — until one does, `legacyVerbs.js` expands flat and both directions leak.

##### Corrected 2026-10-29: it is not a `legacyVerbs` problem, and not a server fix

Two drafts were withdrawn before the right answer. Recorded because both are the obvious move:

1. ~~Scope the shim's verbs~~ — wrong layer AND wrong rule. Scope is not a property of a verb:
   `edit-page` on a pattern means descendants, on a page means self. Measured: on `rowauth-test`
   every group grant sits on a PAGE row, so a descendants-only `edit-page` would stop a page-level
   grant conferring edit on its own page — a worse regression than the widening.
2. ~~Fix it in `legacyVerbs.js` at all~~ — `authOf` is
   `maps ? expandWithVocabulary(raw, maps) : expandAuth(raw)`. A declared vocabulary **wins**, and
   all **81 pattern rows on `rowauth-test` declare**, so a migrated app never reaches the shim. The
   vocabulary is already correctly scoped (`edit-pattern` under `self`, `edit-page` under
   `descendants`).

The collapse is in the **grant**: a flat grant expands against the union (`maps.flat`), because flat
has always meant both. The fix is to write the grant scoped, and it needs no server change —
[row-auth-scoped-grants.md](./row-auth-scoped-grants.md).

**This also means the differential has a blind spot.** `test-data-auth.js`'s fixtures declare no
vocabulary, so `test-row-auth-diff.js` only ever exercises the SHIM path — not the path production
takes. Covered instead by `test-row-auth-writes.js`'s "a DECLARED vocabulary" section (6 cases),
which pins the collapse, proves the scoped form fixes it, and shows an undeclared verb confers
nothing even when the shim knows it.

### The original measurement: `DMS_WRITE_GATE=row npm run test:data-auth` → **22 passed, 27 failed**

Not a bug list. Three of the four causes are decisions the hub already made.

| n | cause | what has to happen |
|---|---|---|
| **11** | `nothing stated — writes need a grant` (10) + one anon case | **Decided difference.** Kind auth: signed-in ⊕ no grants ⇒ open (owner, 2026-10-23). Row auth: writes need a grant (hub, "strict defaults"). The *test expectations* change, not the code — but every app with unconfigured patterns loses editing on the flip, so the audit script in Phase D is a prerequisite, not a nicety. |
| **5** | kind auth refuses, row auth allows | **ACCEPTED — won't fix.** See "Field-level rules are out of scope" below. |
| ~~3~~ **2** | `missing create` (2) | **Not a mapping gap — see "What a create is judged against" below.** `missing delete` is **FIXED**: `edit-page` now confers `delete` (approved 2026-10-29), matching kind auth, which requires exactly `edit-page` to delete a page. |
| **~8** | equality assertions and two race cases | **Not yet diagnosed.** Start with "a page grant revoked between the check and the write refuses the edit" — it went through, and a check/write race is the one shape here that is security-relevant rather than policy. |

Nothing above is reachable with `DMS_WRITE_GATE` unset: `npm test` is green, `test-data-auth` is
49/49, `test-sync` 95/95.

## What a create is judged against (2026-10-29)

A create has no row of its own, so it is judged against its parent's chain. Two ways to know the
parent, and the second cannot tell the cases apart:

```
docs|page       -> parent segment "docs" -> the PATTERN row
docs|component  -> parent segment "docs" -> the PATTERN row
docs|page-edit  -> parent segment "docs" -> the PATTERN row
```

The type path can never do better, because **pages carry no instance name** — `getInstance('docs|page')`
is `null`, so nothing in a component's type can name its page. That is the founding premise of
[row-auth-parentage.md](./row-auth-parentage.md).

So the claim is the answer, and it was already half built:

| | claims `parent_id`? | |
|---|---|---|
| sync path, `api/index.js:545` | **yes** | adding a section to an existing page is judged against that page |
| falcor path, `updateDMSAttrs.js` | **yes, as of 2026-10-29** | one line, same rationale, passed `id` from the caller |
| a brand-new parent | **cannot** | children are written first so their ids can go in the parent's array |

**The third row is accepted, not fixed** (owner, 2026-10-29). A page created *with* its sections is
one user action — "add a page to this pattern" — so judging it at the pattern is right, not a
concession. The two remaining `missing create` cases in `test-data-auth.js` are therefore expected,
and their expectations should change rather than the code.

**Security fix found while building this.** `parentRowFor` trusted the raw claim. `validateParentId`
runs in `createData`, AFTER the guard has already allowed the write — so a caller could name ANY row
in the app (another container's page, a sibling component, the site row) and be judged against its
grants; the claim was then dropped and the row landed with no parent at all. The gate now runs
`isPlausibleParent` with the declared `ownerKind` before trusting a claim, and falls back to the
container when it fails. `tests/test-row-auth-writes.js`, 14 cases, two of which assert the refused
rows ARE permissive so the refusals cannot pass trivially.

**The clamp limits the mitigation.** Merge rule 3 means a page can only grant `create` to a
principal no ancestor has named — see the hub's rule 3 and its two consequences.

## Built: `--audit-writes`, and a third grant encoding it found

The hub's Phase D asked for "an audit script: which rows would become uneditable if the flag were
turned on, and who holds `edit` today". Built as `migrate-row-auth.js --audit-writes`. **Read-only,
and it needs no migration** — the unstated-chain question resolves through the same `data` fallback
the resolver already has, so this is the one piece of the programme that can measure PRODUCTION
before the cutover touches it.

Four sections: **A** the unstated-chain census by kind, **B** who states anything today, **C** the
most recently edited of the affected rows (the ones that would be noticed), **D** a cross-check of a
random sample through the REAL resolver.

It walks DOWN from the grant-bearing rows rather than up from every row — the seed is small and the
stated set is its subtree, one scan instead of N recursive walks. The up-edge is `parent_id` when
the column exists, else the type path, which is the sequence `rowAuth.js` follows.

### Section D earned its place immediately

A first version computed the seed in SQL (`auth->'groups' <> '{}'`) and **disagreed with the
resolver on 4 of 200 sampled rows**. The cause is a **third shape for stored grants** that nobody
had written down — keyed by subdomain, with the value a JSON *string*:

```json
{"*": "{\"users\":{\"1\":[\"*\"]},\"groups\":{\"AVAIL\":[\"*\"]}}"}
```

`resolveAuthPermissions` has always handled it; a SQL predicate reading the top-level shape silently
skipped every row using it. The seed is now computed by `rawAuthOf` — the real code — with SQL
reduced to a deliberately INCLUSIVE filter ("has any auth content at all"), which can only add
candidates and never drop a grant-bearing row. Section B had the same bug and the same fix.

The correction moved the headline from 96.7% to **66.2%**. An audit that can disagree with the thing
it audits is worse than no audit, which is the whole reason D exists.

### Measured on `rowauth-test`

| | |
|---|---|
| rows that would lose writes | **22,475 of 33,967 (66.2%)** — component 66.3%, page 63.7%, pattern 22.2% |
| rows that state something | 105, of 8,713 carrying any auth at all |
| principals | 20, incl. per-county `… County HMP Admin` groups |
| cross-check | resolver agrees on **300/300** |

So on the migrated clone a flip would take write access away on two thirds of rows. That is the
number the strict-default decision actually costs, and it is why the audit is a prerequisite for
task 8 rather than a nicety.

### Measured on `mitigat-ny-prod` — READ-ONLY, unmigrated, 2026-10-29

**87,268 of 333,789 rows (26.1%)** would become writable by `mitigat-ny-prod Admin` only.
Cross-check: resolver agrees on **300/300**.

| kind | would lose writes |
|---|---|
| component | 84,636 of 328,030 (25.8%) |
| **page** | **2,138 of 5,164 (41.4%)** |
| **source · view · symbology · data · dmsenv · theme** | **100% — every row** |
| pattern | 14 of 81 (17.3%) |

Two findings the total hides:

- **The datasets side has no grants at all.** Every source, view and symbology on prod would go
  read-only for everyone but an app admin. That is not a tuning problem, it is an unconfigured
  subsystem, and it has to be granted before any flip — or datasets writes stay on kind auth
  while dms writes move, which the per-surface flags allow.
- **Write access hangs off ONE group.** `LHMP Template Editor` states **78,965 of the 79,681**
  rows that state anything. That is why 26% is as low as it is, and it is a single point of
  failure worth knowing about independently of this work: one bad edit to that group's grants
  changes write access across a quarter of a million rows.

Section C's list is dominated by `test_meta_forms_env` sources and views created 2026-10-28/29 —
i.e. the rows that would be noticed first are the ones someone is actively working on right now.

## Field-level rules are out of scope (owner, 2026-10-29)

> "I think the rowAuth approach is correct for the moment simpler and its ok that it can't enforce
> row level stuff. I don't want business logic in the server"

Row auth stays **five structural verbs on a row**. It does not learn which attribute needs which
verb, and the `fieldVerbs` design sketched during this session is **not built**.

The reasoning, and it is the architecture's own: "`sections` means publishing" is a product fact,
not a security one. Encoding it server-side makes dms-server know what a page *is* — the thing
`src/dms/CLAUDE.md` exists to forbid. The server guards rows; the pattern decides what its fields
mean.

**What that costs, stated plainly so nobody rediscovers it as a bug.** Under `DMS_WRITE_GATE=row`,
these stop being enforced server-side:

| | kind auth | row auth |
|---|---|---|
| `sections` / `section_groups` / `dataSources` / `published` | `publish-page` | plain `edit` |
| `filters` | `edit-page-params` or `edit-page` | plain `edit` |
| source `auth_permissions` | `edit-source-permissions` | `grant` (kept — see below) |
| split `:data` rows | `edit-source-data` | plain `edit` on the row's chain |

So **anyone who may edit a page may publish it**. The separation of duty between drafting and
publishing becomes a client-side rule only. That is a real reduction, and it is less of one than it
first looks: the server never understood publishing in the first place. It guarded the NAME of a
field — `publish-page` authorised writing arbitrary content into `sections`, never "copy the drafts
into live". The guarantee being given up was already the weaker half of the one people assume.

The five `test-data-auth.js` cases that fail under `DMS_WRITE_GATE=row` are therefore **expected**,
not a to-do. Do not "fix" them by teaching the server field rules.

### The one exception: changing the grants themselves

`GRANT_KEYS` (`authPermissions`, `auth`) stays key-sensitive in the row judge, requiring `grant`
rather than `edit`. It is not the same kind of rule:

- `grant` is already one of the five structural verbs — it exists for exactly this.
- The auth object is not business data. It is the permission system's own state, so a rule about it
  is not knowledge of any pattern.
- Without it, anyone holding `edit` can grant themselves anything. That is privilege escalation, a
  security property rather than a product one, and the one thing the server must own whatever else
  it delegates.
