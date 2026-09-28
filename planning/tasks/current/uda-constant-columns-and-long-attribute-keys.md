# UDA: constant-valued columns vanish on ungrouped-aggregate cards; one attribute key came back mutated

**Initiatives:** [dms_author_primitives](../../../../../planning/initiatives/dms_author_primitives.md) · **Status:** next (was: "🔍 DIAGNOSED, NOT FIXED (2026-08-24).") · **Created by:** amuro@albany.edu · **Edited by:** rdubowsky@albany.edu

> **Status:** 🔍 ROOT-CAUSED, NOT FIXED (updated 2026-09-24). Bug 1 is **not** about
> ungrouped-aggregate mode — it is the server's `sanitizeName` injection guard rejecting whole column
> expressions (see "Root cause" directly below; it supersedes the 2026-08-24 "Current state" framing
> and proposed change 1). It was **live on published client pages**: three TSMO notes rendered
> blank — reworded without `;` 2026-09-24, published + verified by the owner the same day.
> **This is now a DMS-core-only task.** Control-room ticket 2214562 was RESOLVED 2026-09-24 (owner call) for
> the client-facing symptoms; the library defect lives only here. Scope reminder: only columns whose text
> reaches SQL (Card/data columns) are affected — rich-text (lexical) sections and `origin:"static"` columns
> never do (e.g. incident_view's "How one incident is measured" lexical section contains `;` and renders fine). Bug 2 is still unisolated, but the same guard is the lead suspect.
> **Origin:** TransportNY control-room ticket **2214562** (filed while resolving **2214516**, where
> three Data Freshness cards silently rendered no note text at all).

## Root cause (2026-09-24) — supersedes the bug-1 analysis below

`dms-server/src/routes/uda/utils.js` `sanitizeName()` (lines 23–36) returns `false` for any string
that contains one of `select|create|drop|update|delete|insert|alter|exec|union|cast` as a whole word
(`\bkw\b`, case-insensitive) **or a `;` anywhere** — including inside a quoted string literal. The
row-data queries run every requested attribute through it and silently drop the rejects:
`query_sets/postgres.js:228/342/567`, `query_sets/clickhouse.js:213/348/591`
(`sanitizeName(attributes).filter(f => f)`). A dropped attribute is answered as an empty Falcor atom
`{"$type":"atom"}` → blank cell, no error anywhere.

The 2026-08-24 "grouped cards are unaffected" contrast was coincidence: the grouped card's text had no
keyword/`;`, the Data Freshness notes read `…closures update continuously…`. Grouping is irrelevant.

**Live replay** (2026-09-24, local dms-server, `uda.npmrds2.viewsById.1947.options.{}.dataByIndex[0]`,
one request, three literal columns):

| Attribute | Result |
|---|---|
| `'Interim 20 per veh-hr, class-weighted' as s_plain` | value |
| `'Interim 20 per veh-hr; class-weighted' as s_semi` | empty atom |
| `'closures update continuously' as s_kw` | empty atom |

**Blast radius** (every `columns[]` entry on a section referenced by a page's `sections`/
`draft_sections` in `dms_npmrdsv5`, skipping `origin:"static"`/`type:"formula"`, same test as
`sanitizeName`): 16 sections on 5 pages.
- **Client-facing, published, blank today (all `;` inside prose):** `tsmo2/incident_view` sections
  2197456 (`note`: "Only timestamps present on the TRANSCOM record…; all-lanes-open on ~43%…") and
  2197460 (`s`: "Interim $20/veh-hr; class-weighted VOT…"); `tsmo2/workzones_v2` section 2198170
  (`foot`: "…on the backfill list; durations from estimated_duration_mins."). Draft twins:
  2197402, 2197406, 2198064.
- `sandbox2/lehd_od` + `sandbox2/test`: scalar subqueries `(SELECT … FROM gis_datasets…)` in
  calculated columns. This is the guard doing its intended job — the fix must keep rejecting these.
- `status/issue_tracker` section 2174053 (+ draft 2172711): a Spreadsheet column named `Delete` —
  rejected on the bare name. Not yet checked whether that column is actually queried.

**Browser-verified** (2026-09-24, `/tsmo/incident_view?event_id=ORI1237738292`, local): the Estimated
cost stat card renders `ESTIMATED COST / $414 k` then an empty 20px cell where the subtitle belongs —
its two sibling stat cards both show captions, so the gap is plain once pointed out; the Response
Timeline card ends after the timestamps with no footnote. `/graph` returned `{"$type":"atom"}` for
both attributes. Nobody had noticed: a missing caption doesn't read as broken.

**Page-level workaround applied 2026-09-24 (owner call — the library fix is still open):** the three
TSMO notes were reworded without `;` in their owning builders and the drafts rebuilt
(`build_tsmo2_incident_view.mjs`, `build_tsmo2_workzones_v2.mjs`; each note section's `data` snapshot
cleared, since it held `null` for the note). Isolation replay: each note as written → empty atom, the
same text with only `;`→`,` → value, so `;` was the sole trigger (`$`, `—`, `~`, `%`, `/`, parens are
fine). New wording: "…events, and all-lanes-open on ~43%." · "Interim $20/veh-hr — class-weighted…" ·
"…on the backfill list. Durations from…". Server returns all three. **Published + verified by the owner
2026-09-24.** Replay gotcha: two attributes with the SAME alias in one request let a
rejected one borrow its sibling's value (response rows are keyed by alias) — give every probe column its
own alias.

**Bug 2 lead:** this task's own description of the mutated 196-char note says it contained a `;`, and
the ~700-char `pm3_sub` counterexample that works contains none. So that note was certainly rejected
by the guard; whether the guard also explains the *mutated key* (`.'`→`_'`, alias dropped) is not
yet verified. Re-test bug 2 only after the guard fix lands.

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

1. **Bug 1 (revised 2026-09-24 — the original "ungrouped branch" change would have fixed nothing)** —
   in `sanitizeName`, blank out properly terminated single-quoted literals (`'…'`, honouring `''`
   escapes) before the keyword and `;` checks; an unterminated quote stays a reject. Content inside a
   terminated literal cannot execute, so this does not weaken the guard: `(SELECT …)` subqueries and
   bare keywords are still rejected. Keep it additive — every other caller (group by, order by,
   table/schema names) gets the same, strictly more permissive-only-inside-literals behaviour.
   **Safety constraints — the stripper must never think text is inside a literal when the database
   thinks it is outside**, or it opens a bypass that today's guard blocks:
   - **Backslashes.** ClickHouse (and PG `E'…'`) treat `\'` as an escaped quote. `'x\'' ; drop …'`
     is one literal to a naive `''`-aware stripper but ends after `x\''` to ClickHouse, putting
     `; drop …` outside. Rule: a literal whose body contains `\` is not blanked (checked as today).
   - **Comments.** `/* ' */ ; drop … /* ' */` — a stripper sees one literal, PG sees two comments
     and a live `; drop`. Rule: if the expression contains `--` or `/*` anywhere, don't strip at all
     (behave exactly as today).
   - Dollar-quoting (`$$…$$`) and double-quoted identifiers are never stripped (checked as today).
   Net: never less strict than today; more permissive only for plain terminated `'…'` literals.
   NB the guard is a keyword blacklist over author expressions interpolated verbatim, so it is not a
   real security boundary (e.g. `pg_read_file('…')` passes it today) — out of scope here, but the fix
   must not weaken it further.
   Then make a rejection visible instead of an empty atom (at minimum a server log line naming the
   attribute; ideally an error the section can show).
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
