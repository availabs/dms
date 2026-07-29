# Length query fails on a calculated group-by under comparison series

**Status:** DONE — both consequences fixed, SQL-verified against live ClickHouse, and
**live-confirmed by the user 2026-07-27** ("looks good"). Postgres path and the
hour/weekday/month resolutions remain unexercised (see Verification). Own task per `feedback_isolate_shared_code_changes` — this is shared UDA
query-layer code, not report-specific.

## Symptom

Any report graph on a calculated resolution 500s from ClickHouse:

```
Code: 47. DB::Exception: Unknown expression or function identifier 'quarter_hour' in scope
SELECT countDistinct(concat(toString(quarter_hour))) FROM npmrds.s583_v982_NPMRDS_V6 WHERE ...
```

Historically this surfaced client-side only as a benign-looking **"Error getting length"** console
message with the graph rendering permanently empty and no data `/graph` request ever firing — which
is why `skills/creating-routes-and-reports.md` (since split into `creating-reports.md` +
`creating-routes.md`, with this now-stale "just use Resolution: 5 Minutes" advice removed since the
fix below) used to advise "just use Resolution: 5 Minutes."

**Blast radius is wider than 15-minutes.** Of the six vocabulary resolutions, only the two backed by
a *plain physical column* work — `5-minutes` (`epoch`) and `day` (`date`). All four calculated ones
fail: `15-minutes` (`intDiv(epoch, 3)`), `hour` (`intDiv(epoch, 12)`), `weekday`
(`toDayOfWeek(date, 1)`), `month` (`toStartOfMonth(date)`). It applies to **any** calculated
group-by column under comparison series, not just resolutions.

## Root cause: one payload field, two incompatible scoping contexts

`buildUdaConfig.js`'s `mappedGroupBy` sends the **bare SELECT alias** (`quarter_hour`) instead of the
expression whenever `activeComparisonSeries && isCalculatedCol(col)`. That was introduced
deliberately by **`b1193814`** (2026-07-21, "Extend section menu… fix some query bugs") for a real
reason its own comment states: the fan-out wraps each arm as `SELECT * FROM (<arm>) AS fanout` and
applies GROUP BY on the **outer** query, where `intDiv(ds.epoch, 3)` fails because `ds` is out of
scope. So the alias is **correct for the data query.**

But `mappedGroupBy` feeds two consumers with opposite needs:

| consumer | context | needs |
|---|---|---|
| `simpleFilter` (data) | wrapped `AS fanout`, group-by columns projected | the **alias** |
| `simpleFilterLength` | bare `count()` over the base table, nothing projected | the **expression** |

`b1193814` touched **zero server files**, so the length query was left expecting the old
(expression) contract. The server cannot recover the expression on its own: `simpleFilterLength`
never receives `attributes` (verified — 0 occurrences in its parameter list).

### Why it went unnoticed for six days

dms-template has been on post-`b1193814` commits since 2026-07-21, but nobody exercised a calculated
resolution there. Live report work was happening on **transportNY**, pinned at `dd0a7bee`, which
predates `b1193814` and still sent expressions — so 15-minute graphs worked there (user viewed them
2026-07-24, with Integer tick labels). Bumping transportNY's submodule to `4e8a1511` on 2026-07-27
exposed it. Confirmed via `git merge-base --is-ancestor`: `dd0a7bee` does NOT contain `b1193814`;
`ef220c57` and `4e8a1511` both do.

## Fix: send the expression alongside the alias, for the length query only

New optional options field **`groupByAliasExprs`** — a map of `alias → defining expression`,
populated only for entries where the two differ. `simpleFilterLength` substitutes it;
`simpleFilter` ignores it. **The data request is unchanged** (user's explicit requirement), and an
absent/empty map reproduces previous behavior exactly, so an older client against a newer server is
safe.

- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js` —
  build `groupByAliasExprs` in the **same pass** as `mappedGroupBy` so a key can never drift from
  the alias actually sent; add it to `options` only when non-empty.
- `packages/dms-server/src/routes/uda/query_sets/clickhouse.js` — destructure it in
  `simpleFilterLength`; `resolveGroupByExpr()` applied at both `sanitizedGroupBy` and the fan-out
  `armCountExpr`.
- `packages/dms-server/src/routes/uda/query_sets/postgres.js` — same bug at its own fan-out
  `countExpr`; same fix.

### Naming hazard hit while implementing

The field was first called `groupByExprs`, which **collides with an existing local** of that name in
both query sets (`postgres.js:130`, `clickhouse.js:256/389`) holding the sanitized group-by *array*.
In `postgres.js` that local lives in `simpleFilterLength` itself, so the destructured binding was a
redeclaration `SyntaxError`, and the lookup would have indexed an array by string and silently
no-opped. Renamed to `groupByAliasExprs`. **Do not reintroduce the shorter name.**

### Why the expression resolves in the length query

`refName` carries a table-alias prefix (`ds.`) exactly when a join is present, and
`simpleFilterLength`'s own FROM aliases the base table `ds` exactly when joining — so the two agree
in both cases. (`travelTime` has `requiresJoin: []`, hence the bare `intDiv(epoch, 3)` in the
verification below.)

## Second consequence of the same root cause: difference mode collapsed to one bar

Found live 2026-07-27 immediately after the length fix landed: with the 500 gone, every calculated
resolution rendered as a **single bar at x=0** labeled `0:00` (5-minutes, a plain column, was fine).
Not a labeling bug — the x value came back 0 for every row.

`simpleFilter`'s difference-mode branch classifies each projected attribute as either a join key
(aligned across arms) or a value column (differenced), by testing whether the group-by list contains
the attribute's **expression**:

```js
const keyExprSet = new Set(armGroupByExprs.map(g => String(g).trim()));   // = {'quarter_hour'} post-b1193814
(keyExprSet.has(exprOf(attr)) ? keyNames : valueNames).push(outName(attr));
// attr 'intDiv(epoch, 3) as quarter_hour' -> exprOf -> 'intDiv(epoch, 3)' -> MISS
```

Post-`b1193814` the group-by holds the alias, so the x-axis attribute missed the key test, fell to
`valueNames`, and was emitted as `anchor.quarter_hour - compare.quarter_hour`. The arms are INNER
JOINed on equal bucket values, so that expression is **identically 0** — the x column differenced
against itself, collapsing every bucket into one.

Fix: match **either** form. `isCoveredByAttr` (for `syntheticGroupBys`) and `isJoinKeyAttr` (for the
key/value split) now accept a group-by that equals an attribute's expression *or* its output name.
Verified both directions via stubbed-db SQL capture — alias form and pre-`b1193814` expression form
both produce `compare.quarter_hour = anchor.quarter_hour` as the join key with only the real value
column differenced. Postgres needs no counterpart: it has no `keyExprSet`/`syntheticGroupBys`,
difference mode is ClickHouse-only.

**Lesson for this file's own fix:** the length query was the *loud* consequence of the alias switch
(a 500). This was the *quiet* one — a silently wrong chart. When a shared payload field changes
meaning, grep every consumer rather than fixing the one that threw.

## Verification

- [x] Both patched files pass `node --check`
- [x] Generated SQL inspected via a stubbed `ctx.db`: with the map → `count(DISTINCT
      concat(toString(intDiv(epoch, 3))))`; without → unchanged bare-alias SQL (backward compat)
- [x] **Executed against live ClickHouse** with the user's real filters (3 TMCs, 2025-01-01 →
      2025-02-28): bare alias reproduces `Code: 47` byte-for-byte; inlined expression returns
      **96** — exactly the 15-minute buckets in a day (24 × 4), so the count is semantically right,
      not just non-erroring. `dbq.py chprocs` clean afterwards (no stray scans).
- [x] Live browser confirmation on a report page — user confirmed 15-minutes renders with
      correct tick labels 2026-07-27
- [ ] `hour` / `weekday` / `month` resolutions spot-checked (same code path, untested)
- [ ] Postgres path exercised — the PG fix is symmetric and reasoned, but **not** executed; no PG
      report section was tested. Needs a calculated group-by + comparison series on a PG-backed view.
- [ ] Regression check beyond reports: any section with a calculated group-by + comparison series
- [ ] Port to transportNY (manual-copy only — `research/npmrds-reports/reportroutelist-cross-repo-sync.md`)

## Progress log

- **2026-07-27** — Reported by the user live (switching a report graph to 15-minute resolution).
  Initially misdiagnosed by me as pre-existing; the user correctly pushed back that 15-minute data
  fetching already worked and nothing about the data request should need to change. Tracing
  `git log -L` on `mappedGroupBy` found `b1193814` and the submodule-bump timing, which explains it
  fully. Fixed client + both query sets, SQL-verified live. Live browser check still pending.
