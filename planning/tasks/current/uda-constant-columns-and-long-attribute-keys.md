# UDA: constant-valued columns vanish on ungrouped-aggregate cards; one attribute key came back mutated

> **Status:** 🔍 DIAGNOSED, NOT FIXED (2026-08-24). Two independent defects in the UDA
> query/Falcor-attribute path, both isolated from live responses on `tsmo2/home`. Both look
> **additive and BC** to fix. Symptom is worked around at the page level (see "Current workaround"),
> so nothing is blocked — but the defects are silent, so other pages will keep hitting them.
> **Origin:** TransportNY control-room ticket **2214562** (filed while resolving **2214516**, where
> three Data Freshness cards silently rendered no note text at all).

## Objective

Make the UDA layer return what the author configured, in two cases where it currently returns
nothing and reports no error:

1. A column whose expression evaluates to a **constant**, on a Card with **no GROUP BY column**.
2. A column whose expression came back with a **mutated Falcor attribute key** (trigger not yet isolated — see below).

Both currently produce a **blank cell with no console error, no network error, and no server error**
— the worst possible failure mode for an author, who has no signal that anything is wrong.

## Scope

**In scope**
- The UDA query builder path that decides which columns are emitted for an aggregate query
  (`ungroupedAggregate: true`).
- The Falcor attribute-path key encoding for calculated columns.

**Out of scope**
- The Card render layer. It was ruled out (see Evidence) — `visibleColumns.map` in
  `ui/components/Card.jsx` is unconditional and emits a cell for every visible column.
- Page-level content fixes on `tsmo2/home`. Already done under ticket 2214516.

## Current state

### Bug 1 — constants come back as empty atoms in `ungroupedAggregate` mode

When a Card has no GROUP BY column, the request carries `ungroupedAggregate: true`. In that mode a
column whose expression evaluates to a constant is returned as a Falcor atom **with no `value`**:

```json
"'Probe speeds arrive on a ~2-week lag; corridor grids and bottleneck ranks follow.' as note":
  { "$type": "atom" }
```

…while a sibling aggregate in the same row returns normally:

```json
"concat('Through ', max(date)) as through": "Through 2026-08-09"
```

**Three variants all fail identically** (all tested live on section 2193273):

| Expression | Result |
|---|---|
| `'text' as note` | empty atom |
| `max('text') as note` | empty atom |
| `case when max(date) is not null then 'text' else '' end as note` | empty atom |
| `min(date)::text as note` | **works** — returned `2017-01-01` and rendered |

The last row is the control that localises the bug: a genuine aggregate over a source column, in the
**same second cell position**, works. So this is not cell position, not the render loop, and not the
visibility filter.

**Grouped cards are unaffected.** Section 2193248 renders a bare literal note (`'time lost below
speed-limit-based thresholds · all NY roads with probe data' as note`) correctly — it carries a
`year` GROUP BY column, so it never enters `ungroupedAggregate` mode. That contrast is the cleanest
statement of the bug: *the same column config works or silently blanks depending only on whether a
group column happens to be present.*

### Bug 2 — an attribute key came back mutated (trigger NOT yet isolated)

⚠ **Do not trust a simple length explanation.** The first read of this was "keys truncate at ~185
chars", and that is contradicted by a counterexample on the very same card: the `pm3_sub` column on
section 2193250 is a **~700-character** expression and resolves correctly. Length alone is therefore
not the trigger. What is *established* is the mutation itself, on one specific key.

A 196-character note expression came back keyed like this:

```
"'The period our delay measurements cover. … published once a year_'"
```

Two mutations, precisely: the sequence `.'` became `_'`, and the ` as note` alias was **dropped
entirely**. `ui/components/Card.jsx` resolves cell values as:

```js
source?.[attr.normalName] ?? source?.[attr.name]
```

so a mutated key can never be matched even if a value were present — and the failure is **silent**.

The two *shorter* notes on sibling cards end with the identical `.' as note` pattern and were **not**
mutated, so the trailing pattern alone is not the trigger either. **Isolating the actual trigger is
part of this task.** Candidates worth bisecting against the working ~700-char `pm3_sub`: the length
of the single-quoted literal itself (this note is by far the longest quoted string on the page, while
`pm3_sub` is a long expression made of *short* literals), the `;` inside it, or total length
interacting with one of those. Until it is isolated we cannot say which columns are at risk.

This bug also **masks investigation of bug 1**: an early `max('…')` experiment on the long note
looked like it disproved the aggregate-wrapper theory, when in fact the key was coming back mutated.
Any future debugging here should use a **short** expression to avoid conflating the two.

## Proposed changes

1. **Bug 1** — in the ungrouped-aggregate branch of the query builder, emit constant-valued
   expressions instead of dropping them (a constant is trivially valid in an aggregate `SELECT`).
   Failing that, detect the case and surface an authoring error rather than returning an empty atom.
2. **Bug 2** — isolate the trigger first (the ~700-char `pm3_sub` counterexample rules out a plain
   length cap). Then either encode/hash the affected keys (keeping a stable client-side mapping so
   `Card.jsx`'s lookup still resolves) or reject the shape loudly at author time. The silent
   mutation is the part that must go.
3. Consider a **shared guard**: when a requested attribute comes back as an atom with no value, log
   a one-line warning naming the section id and the column. Both defects would have been obvious in
   minutes instead of requiring response capture.

## Files requiring changes

- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`
  — column emission for aggregate queries; note line 893 already excludes
  `origin === "static"` / `type === "formula"`, which is the pattern to extend.
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/getData.js`
  — request assembly / attribute-key construction (see the `columnsToFetch` and static-column
  handling around lines 415–430, 487–490).
- Falcor attribute-path encoding wherever the `as <alias>` key string is built for the `dataByIndex`
  request (the truncation point for bug 2 — locate before changing).
- `src/dms/packages/dms/src/ui/components/Card.jsx` — no change expected; listed because line ~409
  (`source?.[attr.normalName] ?? source?.[attr.name]`) is the consumer whose contract must keep
  holding. NB that line was already the subject of an earlier BC fix
  (`card-zero-value-renders-blank.md`); do not regress `??` back to `||`.

## Current workaround (already shipped, and the right pattern regardless)

Fixed prose belongs in a **static column**, not in SQL:

```js
{ name: `static_note_<id>`, display_name: "note", staticValue: "…", origin: "static", show: true }
```

`buildUdaConfig.js:893` excludes `origin === "static"` from the query entirely and `Card.jsx:405`
renders `staticValue` directly. This sidesteps both defects plus the PG/ClickHouse dialect
differences. Applied to sections 2193272, 2193273, 2193274 on `tsmo2/home` under ticket 2214516.

Worth noting in whatever docs cover Card authoring: **static text should never go through SQL** — it
costs a query column and exposes it to both defects above.

## Testing checklist

- [ ] Bug 1 repro: Card, no group column, second column = `'text' as note` → cell renders the text.
- [ ] Bug 1 regression: the same card WITH a group column still renders (section 2193248 shape).
- [ ] Bug 1 variants: `max('text')` and `case when <agg> then 'text' end` also return values.
- [ ] Bug 2: **first isolate the trigger** by bisecting against the working ~700-char `pm3_sub`
      counterexample (section 2193250) — vary total length, literal length, and punctuation
      independently.
- [ ] Bug 2 repro: once isolated, the offending shape resolves and the key is not silently mutated.
- [ ] Bug 2 boundary: confirm no `.`→`_` mutation and no dropped ` as <alias>` either side of
      whatever boundary turns out to be real.
- [ ] Static columns still bypass the query entirely (no regression from change 1).
- [ ] `0` / `""` / `false` cell values still render (guards `card-zero-value-renders-blank.md`).
- [ ] Existing UDA test suite passes.
- [ ] Live check on `tsmo2/home` Data Freshness band: notes render. **Allow ~40s to settle with
      `data: []` cleared** — a shorter wait reports the sections as absent from the DOM and reads as
      a regression.

## Notes

- Reproduce by capturing the `uda` responses in the browser and reading `dataByIndex["0"]`; the row
  keys are the **raw SQL expression strings**, which is what makes both defects visible.
- Page-level symptom tickets: **2214516** (resolved via static columns) and **2214495** (its note
  rewrite was invisible until 2214516 landed).
