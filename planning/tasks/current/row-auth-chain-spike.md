# Row auth 0: measure chain resolution before the resolver's shape is fixed

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** built · **Created by:** amuro@albany.edu · **Edited by:** —

Part of [server-side-auth-general.md](./server-side-auth-general.md) (hub). **Read-only.** Runs before task 1 so the resolver is designed against measured
numbers rather than assumed ones.

## Objective

Answer three questions on a copy of a real app, so the resolver is not designed blind:

1. **How deep are chains, actually?** Expected ~5 (site → dmsEnv → pattern → page → section) and ~4
   for chat. Measure the distribution, not the expectation.
2. **What does set-wise resolution cost?** A recursive CTE over a whole bootstrap result, on Postgres
   and SQLite. `/sync/bootstrap` is today `SELECT * FROM table WHERE app = $1 ORDER BY id`; the
   question is what filtering it by resolved ancestry adds.
3. **How much parentage is derivable today?** Per app: rows with `data.parent`, rows whose type path
   resolves to exactly one row, and rows that resolve to **none or several**. The last number is the
   one that matters — it is the gate on `enforce` (hub, "Running on unmigrated schema").

## Method

`scripts/copy-db.js` to take copies; **`mitigat-ny-prod` first** (largest, most pattern kinds), then
a chat-bearing app. No schema change — derive parentage from `data.parent` and the type path only.

## Done when

- A depth histogram per app, and the max.
- CTE timings against bootstrap-sized result sets on both engines.
- A per-app parent-resolution coverage number, with the unresolvable rows listed by type.
- A recommendation on whether `resolve()` needs a set-wise entry point separate from the single-row
  one, or whether one shape serves both.


## Results (2026-10-27, read-only against `dms-mercury-3`)

App: **`mitigat-ny-prod`**, schema `dms_mitigat_ny_prod`, **541,228 rows** — the largest app on the
server by an order of magnitude (next is `npmrdsv5` at 28,200).

Rows by kind: component 532,864 · page 5,164 · page-edit 2,603 · symbology 259 · view 127 ·
pattern 112 · source 84 · data 4 · theme 4 · dmsenv 4 · page_template 2 · site 1. **98.5% of all rows
are components.**

### Q3 — how much parentage is derivable? **99.2%**

| | rows |
|---|---|
| parent id derivable | **536,699 (99.2%)** |
| …resolves to an existing row | **532,317 (98.4%)** |
| dangling (derivable, target missing) | 4,382 |
| no derivable parent | 4,529 |

**`data.parent` has three encodings in production** — this is the finding that matters for the
migration, and no amount of design would have predicted it:

| encoding | example | rows |
|---|---|---|
| jsonb object | `{"id":"2448361","ref":"mit…"}` | 248,184 |
| **JSON text inside a string** (double-encoded) | `"{\"id\":\"2448361\",…}"` | ~284,319 |
| bare numeric string | `"1300909"` | 4,196 |
| empty / absent | | 4,376 |

Any `parent_id` derivation must handle all three. The working SQL:

```sql
CASE
  WHEN jsonb_typeof(d.data->'parent') = 'object' THEN d.data->'parent'->>'id'
  WHEN d.data->>'parent' ~ '^[0-9]+$'            THEN d.data->>'parent'
  WHEN d.data->>'parent' LIKE '{%'               THEN (d.data->>'parent')::jsonb->>'id'
END
```

**Rows with no derivable parent, by kind:** symbology 259, page-edit ~171, component ~189, page 74.
Small and bounded — these are the rows that would resolve to a truncated chain.

### What `data.parent` actually points at — and why the type path is not enough

```
528,158  component → page
  4,159  page      → page
```

**Nothing points at a pattern.** `data.parent` carries the *within-pattern* hierarchy only; the link
up to the pattern and site comes from the **type path** (`{patternName}|page` → `prod|{name}:pattern`
→ `prod:site`).

This cuts both ways and both matter:

- **The type path alone is wrong for components.** It routes `mitigateny_chenango|component` to its
  *pattern*, skipping the page entirely — so a private page's restriction would **not** reach its
  components. `data.parent` does reach the page.
- **`parent_id` alone is incomplete.** A page's parent chain ends at another page or at nothing; only
  the type path reaches the pattern.

**So the resolver needs both, in this order:** follow `parent_id` while present; when absent, try the
type path; when that fails, stop (chain starts there). Recorded as a correction to the hub's fallback
matrix, which implied they were alternatives rather than a sequence.

### Q1 — depth: **max 5**, concentrated at 4

```
depth 1:   8,911     depth 4: 380,052
depth 2:  30,856     depth 5:   5,056
depth 3: 116,353
```

That is via `data.parent` alone; the type-path hops to pattern and site add two, so **~7 end to end**.
The hub's depth cap of 16 is comfortable and need not change.

### Q2 — set-wise resolution cost: **cheap, and flat**

Recursive CTE over an indexed edge table, resolving full ancestry:

| seed rows | time | chain nodes visited |
|---|---|---|
| 500 | 338 ms | 1,607 |
| 5,000 | 350 ms | 15,282 |
| 50,000 | **521 ms** | 177,394 |
| all 541,228 | 4,142 ms | — |

**Dominated by fixed cost, not row count** — 100× the rows costs 1.5× the time. A bootstrap-sized
page of 50k rows pays about half a second for complete ancestry, and that is cacheable per request.

**One number not to misread:** deriving the edge list from the JSON took **46 seconds** for 541k
rows. That is the *migration* cost, paid once, not a per-request cost. Once `parent_id` is a real
indexed column there is no derivation at all.

### Recommendation to task 1

- **One `resolve()` with a set-wise entry point.** The CTE scales so flatly that a single-row resolve
  is just a set of one; two code paths are not justified.
- **Cap stays 16.** Measured max is 5 (≈7 with the type path).
- **Both parentage sources are required**, in sequence — see above. This is a change to the hub.
- A per-request chain cache is worth having but is not load-bearing at these timings.
