# Row auth 7: retire the per-kind auth logic, leaving one decision module

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

Part of [server-side-auth-general.md](./server-side-auth-general.md) (hub). **Depends on tasks 3, 4,
5 and 6**, and should not start until at least one real app runs the resolver under `enforce`.

## Why this task exists

The hub requires that all reads and edits for dms, uda and sync go through one function. Tasks 4–6
each move their *surface* onto the gate, but none of them **removes** what was there before — so the
count has gone up, not down:

| | decision points |
|---|---|
| before this work | 5 |
| after task 4 | **6** |

Task 4 was deliberately additive. `dataByIdResponse` now reads:

```js
if (kind === 'pattern')              { …inline isUserAuthed…        }   // unchanged
else if (kind === 'page')            { …inline pattern ⊕ page merge… }  // unchanged
else if (rowAuthMode() !== 'legacy') { …the gate…                    }  // added
```

That was right for safety — it is why the auth/admin exemption survived untouched, and why a
resolver fault cannot take the read path down. But consolidation is still entirely ahead, and
nothing in tasks 4–6 schedules it. This task does.

## Objective

Delete the per-kind logic so the gate is the only decision point:

- `dms.route.js` `dataByIdResponse` — the `pattern` and `page` branches (~lines 46–98)
- `dms.route.js` — the four other inline `isUserAuthed` call sites (`length`, `byIndex`,
  `options.length`, `opts.byIndex`)
- `dataAuth.js` — whatever task 5 leaves behind
- `uda/readAuth.js`, `uda/sourceAuth.js` — whatever task 6 leaves behind

## This is the riskiest edit in the programme

The `pattern` / `page` branch is the gate protecting **every pattern and page read in production**.
It also carries two things the client depends on and the resolver knows nothing about:

1. **The auth/admin exemption** — auth and admin pattern rows stay publicly readable so a logged-out
   visitor can load the login page and build routes. Under the hub's principle this should become a
   declared capability on those patterns rather than a `pattern_type` name check — see
   `src/dms/CLAUDE.md`, "DMS Interprets Data".
2. **The `no-access` stub shape** — a refused pattern row returns `base_url`, `pattern_type`,
   `subdomain`, `locations`, `retired_subdomains`, `name`, `theme`, `public`. Every field is there
   for a reason recorded in the comments at `dms.route.js:100`; dropping one silently breaks
   routing, branding or the login redirect. **Preserve it exactly.**

## Done when

1. **A verdict diff on a production copy proves equivalence.** For every row of a cloned app, for a
   representative set of users (anonymous, signed-in-no-grants, a grantee, `${app} Admin`), the old
   branch and the resolver return the **same** allow/deny. Any divergence is explained or fixed
   before the old code goes. This is the gate on the whole task — build the harness first.
2. The `no-access` stub is byte-identical for a refused pattern row.
3. The auth/admin exemption still holds, expressed as a capability rather than a name check.
4. `grep` for auth decision points finds **one module**. That is the hub's completion test.

## The plan (2026-10-29)

### Surveyed: what is actually left to retire

| where | what | shape |
|---|---|---|
| `dms.route.js:58-80` | `kind === 'pattern'` branch | inline `isUserAuthed`, carries the auth/admin exemption |
| `dms.route.js:80-104` | `kind === 'page'` branch | inline pattern ⊕ page merge |
| `dms.route.js:259, 320, 353, 385` | four LISTING sites | pattern-level `view-page` pre-check → `length: 0` / empty page |
| `dms/dataAuth.js` | the whole kind write judge | live by default; `DMS_WRITE_GATE=row` switches away |
| `uda/sourceAuth.js`, `uda/readAuth.js` | `decideSource`, `decidePattern`, `legacyAllows`, `decideFrom` | live by default; `DMS_UDA_GATE=row` switches away |

**The four listing sites are a different animal** and should NOT ride along. They are a coarse
pattern-level pre-check that answers `length: 0` wholesale — the hub's "`length` lies". Making
`length` return the AUTHORISED COUNT is a behaviour change (hub Phase B), not a consolidation, and
mixing it into the riskiest edit in the programme is how both go wrong. Consolidate them to ask the
gate about the PATTERN row; leave authorised-count as its own task.

### The seam that makes this survivable

`blocked` is computed in the if/else chain; the `no-access` stub is assembled **separately**, under
`if (blocked)`. So consolidation replaces *how `blocked` is computed* and touches nothing that
builds the stub. That is what makes "the stub is byte-identical" a property of the diff rather than
a thing to re-verify by hand.

### Phase 0 — make the old logic CALLABLE, then prove equivalence

Nothing is deleted in this phase and no behaviour changes.

1. **Extract** the `pattern` and `page` branches into one function —
   `legacyReadVerdict({ row, kind, user, subdomain, patternAuth, pageAuth }) -> blocked`. Pure
   refactor: the route calls it, the result is identical. This is what lets anything compare the
   two rules, which today is impossible because the old rule only exists inline.
2. **Build the harness**: `migrate-row-auth.js --diff-reads`, sibling of `--audit-writes` and the
   same shape — read-only, needs no migration, so it runs against **production** as well as the
   clone. For every row, for a representative set of callers (anonymous, signed-in with no grants,
   a grantee, `${app} Admin`), compare `legacyReadVerdict` with `gate.judgeOne(row, 'read')`.
   Report divergences by kind, with examples, and a cross-check section the way `--audit-writes`
   has one.

**Phase 0 is the gate on the whole task** — "Done when" 1. It is also safe to do now, before any of
the preconditions below, and it is the thing that turns "riskiest edit in the programme" into a
number.

### Phase 0 — DONE 2026-10-29

**The extraction.** `routes/dms/kindReadAuth.js` holds the `pattern` and `page` branches verbatim;
`dms.route.js` calls `kindReadBlocked` with the same branches in the same order, so those kinds
still never reach the gate. Every suite unchanged. The old rule previously existed only inside a
Falcor route handler, which is why "prove equivalence before deleting it" had never been attempted:
it was not merely undone, it was unattemptable.

**The harness.** `migrate-row-auth.js --diff-reads` — read-only, needs no migration, so it runs
against production too. It calls BOTH rules rather than reimplementing either: `kindReadBlocked` is
the route's own branch and the gate is the same `createGate` the route builds.

> One bug in the harness itself, worth remembering: the gate's default mode is `log`, which coerces
> every verdict to allow. A harness that did not override it would have reported **zero divergence,
> forever**, while spamming a would-deny line per row — and that result would have licensed deleting
> the branch guarding every page read in production. It now passes `mode: 'enforce'`.

#### Result on `rowauth-test` — every divergence explained

| caller / kind | rows | agree | TIGHTER | LOOSER |
|---|---|---|---|---|
| anonymous · component | 33,414 | 28,114 | **5,300** | 0 |
| signed-in · component | 33,414 | 28,114 | **5,300** | 0 |
| grantee (DHSES) · component | 33,414 | 28,138 | **5,276** | 0 |
| anonymous / signed-in · pattern | 81 | 79 | **2** | 0 |
| app admin · page | 471 | 421 | 0 | **50** |
| app admin · pattern | 81 | 76 | 0 | **5** |

**TIGHTER 15,880 · LOOSER 55 · unexplained 0.** Three buckets:

1. **component ×5,300** — a kind **nothing gated on read** before task 4. The gate refusing some of
   them is the feature, not a divergence.
2. **pattern ×2** — `prod|mitigateny_auth:pattern` and `prod|admin:pattern`: the **auth/admin
   exemption**, which the gate does not know about. This is Phase 1's whole job, and the diff
   confirms it must land before the branch is deleted.
3. **LOOSER ×55, app admin only** — `verdict` passes `${app} Admin` by design (hub: "the bootstrap
   escape"); the route's page branch never did. The gate is more permissive for admins, deliberately.

#### Re-measured 2026-10-29, after Phase 1 and the read-path projection fix

The table above is the measurement that **motivated** Phase 1; it is not the current state. Re-run
against the same 33,967 rows once `publicRead` was declared, the string-encoded grants were decoded
(8,397 rows store them as a JSON string) and `rowAuthGate.judge()` began re-loading rows handed to it
without the `auth` column (see `row-auth-schema.md`, "The read-path projection"):

| caller / kind | rows | agree | TIGHTER | LOOSER |
|---|---|---|---|---|
| anonymous · component | 33,414 | 27,336 | **6,078** | 0 |
| signed-in · component | 33,414 | 27,336 | **6,078** | 0 |
| grantee (LHMP Template Editor) · component | 33,414 | 32,296 | **1,118** | 0 |
| anonymous / signed-in · **page** | 471 | **471** | **0** | 0 |
| anonymous / signed-in · **pattern** | 81 | **81** | **0** | 0 |
| app admin · page | 471 | 421 | 0 | **50** |
| app admin · pattern | 81 | 76 | 0 | **5** |

**TIGHTER 13,274 · LOOSER 55 · unexplained 0.**

The line that matters for this task: **`page` and `pattern` no longer diverge at all** for anonymous
or signed-in callers — they drop out of the disagreement table entirely. Bucket 2 above (the
auth/admin exemption, ×2) is **closed**, by data rather than by a name check, which was Phase 1's
stated goal. Only two buckets remain:

- **component** — still the previously-ungated kind; refusing some of them is the feature. The counts
  moved (anonymous 5,300 → 6,078, grantee 5,276 → 1,118) because decoding the string-encoded grants
  changed which rows have a *stated* chain: a grantee now inherits grants that were invisible before,
  and anonymous is correspondingly refused more.
- **LOOSER ×55, app admin only** — unchanged, and unchanged in cause.

Note the grantee is now `LHMP Template Editor`, not `DHSES`: the harness picks the top-stating group,
and decoding the string grants moved that title (`--audit-writes` shows it stating 78,965 rows).

"Done when" 1 — every LOOSER explained — therefore holds on the current code, not just on the run
that motivated the phase.

#### THREE BUGS, found only by running it against real data

None would have been produced by a unit test, and one was introduced the same day.

1. **Migration pass 2 skipped string-encoded grants.** Its predicate was
   `jsonb_typeof(data->'authPermissions') = 'object'`, and **8,434 rows of `rowauth-test` store the
   grants as a JSON string** — the same double-encoding `data.parent` had. 68 rows ended up with an
   EMPTY `auth` column while `data` held real grants. Pass 2 now parses the string shape: 8,503
   rows where it saw 69.
2. **`rawAuthOf` treated any non-null column as a statement.** With `{vocabulary, childRefs}` it
   returned `{childRefs: …}` — no principals — so those 68 rows resolved to "nothing stated", i.e.
   **publicly readable under `enforce`**. It now strips `childRefs` as well and falls through to
   `data` when the column names no principal, while still honouring an EXPLICITLY empty column
   (`{groups:{},users:{}}`), which is someone clearing grants rather than a failed copy.
3. **The fix for (2) broke subdomain-keyed columns** — checked for `groups`/`users` keys BEFORE
   resolving, and `{"*": "<json string>"}` has none of them until `resolveAuthPermissions` picks the
   subdomain entry and parses it. Three `mitigateny_*` pages lost their pattern's
   `public: view-page` grant. Now resolves first and asks whether the RESULT states anything.

(3) is the argument for this harness in one line: it passed every unit test, shipped the same hour,
and only a diff against 33,967 real rows caught it. It also showed up as an unexplained **TIGHTER**
— which is why the gate is "explain every divergence", not "LOOSER is zero".

#### A side effect to know about

Pass 3 briefly reported `dropped: no such row 120` after `refIdsOf` was widened to accept
single-valued reference attributes. Those are refs that resolve to nothing and are dropped —
harmless, but newly visible rather than new.

### Phase 1 — the auth/admin exemption becomes a capability

Today: `['auth', 'admin'].includes(pattern_type)` — a name check, which `src/dms/CLAUDE.md` forbids
and which no third pattern can opt into.

Declare it instead, in the same channel `authVocabulary` and `childRefs` already use: a
`publicRead` capability on the auth and admin pattern types, emitted into the manifest, transported
on the pattern row, read by the gate. A pattern that needs to be readable logged-out says so.

Independent of phases 2-4 and shippable on its own.

### Phase 2 — collapse the per-row branches

Only after Phase 0 reports no unexplained divergence. Delete the two branches; every kind goes
through the gate. The stub is untouched by construction (see the seam).

#### ⚠ THE REAL PRECONDITION, found 2026-10-29 — it is not the `legacy` flag

Phase 2 was written as though the risk were `DMS_ROW_AUTH_MODE=legacy` leaving pattern and page
reads ungated. The flag is a detail; the shape underneath it is not:

| | today | after Phase 2 |
|---|---|---|
| `pattern` / `page` reads | **enforced ALWAYS** — kind auth has no rollout mode | enforced **only under `enforce`** |
| every other kind | gate, so allowed under `log` | unchanged |

`judge()` returns `allow` for everything under `log` **and** under `legacy` — they differ only in
whether a would-deny line is written. So the moment the kind branch is deleted, a deployment on
`log` — **which is the default, i.e. every deployment today** — stops enforcing page and pattern
reads entirely. A private page becomes readable by anyone.

That is a security regression inherent to the collapse, not to any flag, and no amount of `legacy`
removal addresses it.

**So Phase 2 can only ship to an app that is already running `DMS_ROW_AUTH_MODE=enforce`.** For
`rowauth-test` that is available today (owner, 2026-10-29). For production it is not, and cannot be
until the app is migrated — which binds Phase 2 to task 8 far more tightly than this plan assumed.

Three ways to decouple them, for the owner:

1. **Accept the coupling.** Phase 2 lands behind `enforce`, so it reaches prod only at the cutover.
   Honest, and it means the kind branch survives in the tree until then.
2. **Give READS no rollout mode** — the gate decides reads unconditionally, as kind auth does now.
   Preserves today's behaviour for pattern/page exactly, but simultaneously switches on enforcement
   for the nine kinds that were never gated: measured on `rowauth-test`, **6,078 component reads
   refused for an anonymous caller**. That is a large change shipped with no reporting period.
3. **Enforce reads per KIND** — pattern/page always, others by mode. Preserves the status quo
   precisely, and reintroduces exactly the kind distinction this task exists to remove.

(1) is the only one that changes no behaviour. (2) is the only one that finishes the job now. (3)
is a contradiction worth naming so nobody proposes it later as a compromise.

#### DONE 2026-10-29 — option (1), the coupling made explicit

```js
if ((kind === 'pattern' || kind === 'page') && rowAuthMode() !== 'enforce') { …kind auth… }
else if (rowAuthMode() !== 'legacy')                                        { …the gate…  }
```

| mode | `pattern` / `page` | every other kind |
|---|---|---|
| `legacy` | kind auth, enforced — unchanged | ungated — unchanged |
| `log` *(default)* | kind auth, enforced — unchanged | gate reports, allows — unchanged |
| **`enforce`** | **the gate — one decision path for every kind** | gate — unchanged |

So nothing changes for any deployment that is not already on `enforce`, and an app that IS gets the
consolidation today. `kindReadAuth.js` and the branch go when every target runs `enforce` —
production's at task 8's cutover.

#### ⚠ A DEPLOYMENT ORDERING REQUIREMENT this exposed

Under `enforce` the auth pattern's exemption comes from the `publicRead` DECLARATION, and a row only
carries it after `--sync-vocabulary`. **Flip `enforce` before syncing and the login page stops
rendering for logged-out visitors** — a granted auth pattern is refused, because the gate has no
reason to exempt it. Task 8's runbook already syncs (step 4) before flipping (step 9); this is why
that order is load-bearing rather than tidy.

Pinned in `tests/test-row-auth-reads.js`: a granted auth pattern is refused without the
declaration, readable with it, and a granted NON-declaring pattern stays refused (`publicRead` is
opt-in, never a default).

#### A test defect found on the way, worth more than the feature

`test-row-auth-reads.js`'s `refused()` helper was `d === 'no-access'`. A refused PATTERN does not
answer that string — it answers `$atom({ id: 'no-access', base_url, subdomain, theme, … })`, so the
client can still build the route and redirect to login. The helper therefore returned `false` for
**every pattern, blocked or not**, which made the two assertions guarding the auth/admin
exemption — the login page — **incapable of failing**. They had never tested anything.

Suite went 10 → 13 cases, and the two old ones now assert something.

#### And the CLIENT rejected the declaration outright (found 2026-10-29)

`publicRead: true` was added at the top level of the auth and admin vocabularies, which is where the
server's `publicReadOf()` reads it. But `packages/dms/src/patterns/authVocabulary.js`
`validateAuthVocabulary` treated **every** top-level key as a scope:

```
registerPatternTypes: "auth" authVocabulary: unknown scope(s) publicRead — expected self / descendants
```

`registerPatternTypes` runs at import, so this threw before React mounted: the entire app rendered a
blank page. Not the login page — *no* page.

The fix names the distinction the shape had been missing. `DECLARATIONS = { publicRead: 'boolean' }`
lists the top-level keys that are statements **about** the vocabulary rather than scopes of verbs;
the scope check skips them, and each is type-checked, so a `publicRead: 'yes'` typo throws loudly
instead of failing closed the way the server's `=== true` would have it fail silently.
`flattenAuthVocabulary` already iterated `SCOPES` by name, so nothing leaks into the Access editor.

Two things are worth keeping from this:

1. **The existing suite already covered it and was already red.** `authVocabulary.test.js`'s "auth
   validates" / "admin validates" cases fail without this fix — verified by reverting it: 6 failures,
   2 of them those pre-existing cases. So the client suite had been broken since Phase 1 landed, and
   the breakage was absorbed into the "~12 pre-existing vitest failures" background count. It was
   really 14, 2 of which were ours. Now 12, and the remaining ones are themes / userMenus /
   syncDelta, none of them row-auth.
2. **Phase 1 was declared done on server evidence alone.** The server suites, the gate suite and
   `--diff-reads` all passed, because every one of them builds its own rows and none of them imports
   the client registry. A declaration that two packages must agree on cannot be validated inside one
   of them.

`authVocabulary.test.js` 19 → 25 cases, covering the declaration directly: accepted at the top
level, not counted as a scope, rejected when not a boolean, a genuine unknown scope still rejected,
absent from the flattened options, and the two real vocabularies importing without throwing.

#### Phase 1 verified in the running application

See `row-auth-schema.md` for the read-path projection bug found in the same run. With both fixes in,
against `rowauth-test` on a local server with `DMS_ROW_AUTH_MODE` / `DMS_DATA_AUTH_MODE` /
`DMS_READ_AUTH_MODE` / `DMS_SOURCE_AUTH_MODE=enforce`, `DMS_WRITE_GATE=row`, `DMS_UDA_GATE=row`,
driving a real Chrome with **no session**:

| page | result |
|---|---|
| `/auth/login` | **renders fully** — SIGN IN, email, password, forgot, sign up. The exemption works end to end. |
| `/` | app boots, 0 console errors |
| `chenango.localhost/` | **full county landing page** — status, approval dates, nav, all four sections |
| `chenango.localhost/the_plan/jurisdictional_annexes/select_jurisdiction` | **renders only its headings — see the UDA finding below.** The tables draw their headers with no rows. |

Of 81 patterns, **5 are refused to an anonymous caller** — 572433 `bild`, 2304223
`Schenectady_Draft`, 2323808 `Delaware_Draft`, 2860547 `QA`, 2885758 `MitigateNY Admin` — and those
are exactly the five whose grants state a `public` key with no verbs, or name only private groups.
Every other pattern is either unstated (rule 5: read-allowed) or grants `public: ['view-page']`.
Nothing is refused that should be served, and nothing public is withheld.

**The console error on that page was a red herring, and chasing it found something real.** The page
logs either `` `null` is not allowed in branch key positions `` (falcor `invalidatePathSet`) or
`Error getting length`; both come from the same block, `api/index.js:273` and `:283`. Run the page
four times in ONE mode and the two alternate — 2 and 2 under `enforce`, same rendered length every
time. So "legacy showed one, enforce showed the other" was a coin flip, not a signal. It is the
`dataWrapper` stale-fetch race the server CLAUDE.md already documents.

What the repeat runs did show is a **content difference that is not noise**:

| | rendered characters |
|---|---|
| legacy, anonymous (4 runs) | 16,649 – 17,056 |
| **enforce, anonymous (4 runs)** | **4,768, every run** |
| enforce, signed in | 17,354 |

327 lines of public content vanish under `enforce` for a logged-out visitor — the jurisdiction
narrative, the jurisdictional profile, the building-stock and critical-facility tables with their
dollar values — and the jurisdiction's NAME never resolves, which is why the dropdown shows the bare
GEOID `3601700353`. **This is recorded against task 6; see `row-auth-uda.md`.**

### Phase 3 — DONE 2026-10-29

One `listingBlocked(controller, {app, type, user, subdomain})` replaces five identical inline lines
at four routes — `length`, `byIndex`, `options[o].length`, `opts[o].byIndex`. Coupled to `enforce`
exactly as Phase 2 is, and for the same reason: the inline rule had no rollout mode, the gate allows
everything under `log`, so an unconditional swap would drop the listing gate everywhere not already
on `enforce`.

New: `controller.patternRowForPages(app, parentKey)` — the gate judges a ROW, where
`getPatternAuthPermissions` returns only resolved grants. Same lookup, same admin/auth skip, with
the row-auth projection.

**One behaviour change under `enforce`, pinned not discovered:** the gate passes `${app} Admin`
(the hub's bootstrap escape) and the inline rule never did, so an app admin now sees listings they
were previously refused. Same shape as the 55 LOOSER rows `--diff-reads` reports on the per-row
path. `tests/test-row-auth-reads.js` asserts both halves — refused under `log`, allowed under
`enforce` — so the difference cannot drift silently.

**What stayed out, deliberately.** The check is coarse and pattern-level: a caller who passes gets
the full count and every ref, including pages they cannot read (the per-row gate then stubs each
one). So `length` still lies in both directions — 0 when some pages were readable, the total when
most are not. Making it the AUTHORISED count needs per-row resolution across a whole listing and
changes what clients see rather than who may see it; the hub files that under Phase B. Keeping them
apart means a regression in one cannot be mistaken for the other.

Suite: `test-row-auth-reads.js` 13 → **20 cases**.

### Phase 4 — delete the kind modules

`dataAuth.js`, and the kind halves of `sourceAuth.js` / `readAuth.js`. Flip `DMS_WRITE_GATE` and
`DMS_UDA_GATE` to default `row` first, run on that for a while, then delete.

**This phase has hard prerequisites that are not task 7's to satisfy:**

- the `OPEN` scope-collapse entry ([row-auth-scoped-grants.md](./row-auth-scoped-grants.md));
- the grant sweep (10 external + 76 internal, [row-auth-uda.md](./row-auth-uda.md));
- the differential fixtures emptied or explained — deleting the kind side also deletes the suites
  the differentials run, so their value has to be preserved another way first. **Decide that before
  Phase 4, not during it.**

### The precondition — SETTLED (owner, 2026-10-29)

> "lets call it in this case the real app is rowauth-test, we can run the server locally with that
> set and all flags on and turn enforce on"

`rowauth-test` **is** the real app for this precondition: a 33,967-row clone of `mitigat-ny-prod`,
migrated, verified, with every flag available. The evidence is a local server run against it with
all of them on:

```
DMS_DB_ENV=dms-mercury-3   # the clone lives here; the app is `rowauth-test`
DMS_ROW_AUTH_MODE=enforce  DMS_DATA_AUTH_MODE=enforce
DMS_WRITE_GATE=row         DMS_UDA_GATE=row
DMS_READ_AUTH_MODE=enforce DMS_SOURCE_AUTH_MODE=enforce
```

That resolves the standoff with the cutover rule: no PRODUCTION app is migrated until task 7 is
done, and task 7's "real app under enforce" is satisfied by the clone.

**What to expect when it is run, so nothing is mistaken for a fault.** `--audit-writes` measured
this app at **22,475 of 33,967 rows (66.2%) writable by `rowauth-test Admin` only**. A heavily
locked-down app under `enforce` is the MEASUREMENT, not a bug — the grant sweep is what changes it.
Reads are the thing to watch: a page that should be public going blank is a real finding.

**Phases 0 and 1 need no evidence at all** — a pure refactor, a read-only harness and a
declaration — so they start immediately. Phases 2-4 wait on the run above.

## Sequencing note

Do not start before task 3. Consolidating onto a vocabulary that cannot yet express today's grants
would mean the single remaining decision point is the one that denies reads wherever someone
configured access — measured on a migrated clone: with no vocabulary mapping, reads were allowed on
exactly the 28 of 40 sampled rows that carried **no grants at all**.
