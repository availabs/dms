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

### Phase 3 — the four listing sites

Replace the inline `isUserAuthed` with a gate call on the pattern row. Same coarse semantics,
one decision function. Authorised-count stays out.

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
