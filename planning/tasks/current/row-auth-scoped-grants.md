# Row auth: grants carry a scope, so a page grant stops governing the pattern

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

Closes the one `OPEN` entry in `tests/fixtures/row-auth-expected-diff.json`, which gates
`DMS_WRITE_GATE=row` going to `enforce`. Found while building
[row-auth-dms-writes.md](./row-auth-dms-writes.md); vocabulary machinery is
[row-auth-vocabulary.md](./row-auth-vocabulary.md) (task 3, built).

## The defect

A grant of `edit-page` written on a PATTERN row also confers editing **the pattern row itself** —
its name and settings. Kind auth refuses that (it asks for `edit-pattern`). Row auth allows it. It
is a widening, which is the dangerous direction, and nobody decided it.

## It is not what it looks like, twice over

**Not a `legacyVerbs.js` problem.** `authOf` is `maps ? expandWithVocabulary(raw, maps) :
expandAuth(raw)` — a declared vocabulary WINS and the shim is never consulted. All **81 pattern rows
on `rowauth-test` declare**, so a migrated app does not use the shim at all.

**And the declared vocabulary is already correctly scoped**, as synced:

```
self:        edit-pattern, edit-pattern-permissions, delete-pattern
descendants: view-page, edit-page, create-page, edit-page-permissions, …
```

The collapse is in the **grant**, not the vocabulary and not the server:

```js
if (auth.self || auth.descendants) { /* honour the scope */ }
return expandFlat(auth, maps.flat);     // a FLAT grant expands against self ∪ descendants
```

Flat has always meant both — `patternCan` read `data.authPermissions` for `edit-pattern` and the
page gate read the same object for pages. So a flat grant is not wrong, it is ambiguous, and the
ambiguity is what the scope split exists to remove.

## The fix is data

```js
{ descendants: { groups: { Editors: ['edit-page'] } } }   // the pattern row is untouched
{ self:        { groups: { Editors: ['edit-pattern'] } } } // its pages are untouched
```

Verified in `tests/test-row-auth-writes.js`, section "a DECLARED vocabulary": the flat form confers
edit on the pattern (the collapse, pinned as current behaviour), the scoped form does not, and a
`self` verb appearing inside a `descendants` grant confers nothing.

**No server change.** Which is the point — this is the shape the owner has asked for throughout:
the pattern declares, the grant states its scope, the server infers nothing.

## What has to happen

- [ ] **The Access editor writes scoped grants.** Today it writes a flat `{groups, users}`. It needs
      to know which scope a verb belongs to — which the vocabulary already says, per verb, on the
      pattern row it is editing.
- [ ] **Decide about existing flat grants.** Two options, and the owner picks:
      - **Leave them.** Flat keeps meaning both, as it always has. New grants are unambiguous; the
        widening persists on old data until someone re-saves. Zero risk, no backfill.
      - **Backfill.** Convert each flat grant by splitting its verbs on the vocabulary's own
        self/descendants lists. Closes it everywhere, but it REINTERPRETS stored data — a verb that
        today reaches both would stop reaching one of them. Needs the same dry-run/verify treatment
        as `migrate-row-auth.js`.
- [ ] Remove the `OPEN` entry from `row-auth-expected-diff.json` when the differential stops
      reporting it.

## Measured, so the urgency is known

| | |
|---|---|
| exposure on `rowauth-test` today | **zero** — no group grants on pattern rows at all |
| where grants actually sit | every group grant is on a PAGE row (`*` ×19, `view-page` ×9) |
| the bound | ordinary fields only; grants themselves stay behind `grant` (`GRANT_KEYS`) |

So this is not urgent on measured data — it is a correctness gate for `enforce`, not an incident.

## Also worth knowing

**Any row can declare.** `mapsForChain` walks leaf → root and takes the first row carrying a
vocabulary, so a page could override its pattern's for its own subtree. Nothing here is
pattern-specific.

**The differential has a blind spot this explains.** `test-data-auth.js`'s fixtures declare no
vocabulary, so `test-row-auth-diff.js` only ever exercises the SHIM path — not the path a migrated
app takes. The declared path is covered in `test-row-auth-writes.js` instead.
