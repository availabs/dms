# Row auth 2: the `auth` and `parent_id` columns, and running without them

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** built · **Created by:** amuro@albany.edu · **Edited by:** —

Part of [server-side-auth-general.md](./server-side-auth-general.md) (hub). Depends on [row-auth-resolver.md](./row-auth-resolver.md) for the shape it feeds.

## Objective

Add the two columns, and make every path work when they are absent — the hub's rule is that the code
runs on unmigrated schema and **falls back to today's behaviour**, not to a default.

## What changes

- `auth jsonb` and `parent_id` on `data_items` (and the per-app split schemas).
- **Capability probes**, memoised once per process in the `hasChangeLog()` style — never per request.
  Two query shapes (column present / absent), chosen from the probe.
- `parent_id` derived from `data.parent` on write; type path (`{parent}|{instance}:{kind}`) as the
  read-time fallback.
- The hub's **fallback matrix** implemented exactly, including: an unresolvable parent means the chain
  **starts at that row**, which only ever widens.

## Watch for

- Legacy `data.authPermissions` is **flat**, and flat already means self + descendants — today's
  `patternCan` (self) and `dms.route.js:83` (descendants) read the same object for both. The
  coalesce therefore reinterprets nothing. Do not "upgrade" legacy values into scoped ones.
- Parent-resolution coverage is the **gate on `enforce`**, not on this task. A row private only by
  inheritance opens up when its parent is unresolvable.

## Done when

Columns exist, probes work, and the resolver returns the same answers with the columns dropped as
with them present on a legacy fixture.


## Built and verified on a clone (2026-10-27)

**No existing app was modified.** A representative subset of `mitigat-ny-prod` was cloned into a new
schema — three patterns' full trees plus every site and pattern row, **33,764 rows**, original ids
preserved so the parentage graph survives:

| | |
|---|---|
| source | `dms_mitigat_ny_prod` (read-only; 541,740 rows, untouched) |
| clone | `dms_rowauth_test`, app `rowauth-test` |

The clone script refuses to run if the target holds rows belonging to any other app.

### The migration, measured

| Step | Result |
|---|---|
| `ADD COLUMN auth jsonb`, `ADD COLUMN parent_id bigint` | 9 ms |
| backfill `parent_id` from all three encodings | 33,529 rows, 4,528 ms |
| backfill `auth` from `data.authPermissions` | 82 rows, 1,467 ms |
| index on `parent_id` | 43 ms |

**Coverage on the clone: `parent_id` set 99.2%, resolving to a real row 97.9%** — matching the
spike's measurement of the full app.

The backfill SQL (all three encodings, the second of which is double-encoded JSON text):

```sql
UPDATE <table> d SET parent_id = NULLIF(CASE
    WHEN jsonb_typeof(d.data->'parent')='object' THEN d.data->'parent'->>'id'
    WHEN d.data->>'parent' ~ '^[0-9]+$'          THEN d.data->>'parent'
    WHEN d.data->>'parent' LIKE '{%'             THEN (d.data->>'parent')::jsonb->>'id'
  END,'')::bigint
WHERE d.data ? 'parent';
```

Note `auth` backfilled only 82 rows of 33,764: most `data.authPermissions` values are `{}` or a
string, not a populated object. Worth knowing before anyone reads coverage numbers as "auth is
widely configured" — it is not, in this app.

### Added 2026-10-28 (owner): the migration must COMPLETE the parentage

The backfill above only materialises what `data.parent` already held — the within-pattern hierarchy.
The migration must also fill the hops it never carried, so the runtime walk is pure `parent_id`:

| hop | source | rows (mitigat-ny-prod) |
|---|---|---|
| top-level page → its pattern | the type's parent segment | 815 |
| pattern → the site | the type's parent segment | 112 |

Both are derivable from the type path at migration time — the same logic the resolver runs today,
moved from per-request to once.

**Report, do not guess, on ambiguity.** 21 instance names in `mitigat-ny-prod` resolve to more than
one row (`"admin"` names two separate `prod|admin:pattern` rows). The runtime resolver takes
first-wins; the migration must list these for a human instead, because picking the wrong parent
silently attaches a row to the wrong grants.

Client code must then **keep `parent_id` set on create** — otherwise the gap reopens for new rows.

### Built: `src/scripts/migrate-row-auth.js` (2026-10-28)

Three passes, dry-run by default:

1. `auth` ← `data.authPermissions` (populated objects only)
2. `parent_id` ← `data.parent`, across all three production encodings
3. `parent_id` ← **the type path**, for the hops `data.parent` never carried

Ambiguity is **reported, never guessed**: pass 3 skips every row whose type names an instance that
resolves to more than one row, and lists them.

**Applied to the clone (33,764 rows):**

| | |
|---|---|
| `auth` ← `data.authPermissions` | 82 |
| `parent_id` ← `data.parent` | 33,510 |
| `parent_id` ← type path | 253 |
| unresolvable (the site row — correctly a root) | 1 |
| blocked by an ambiguous name | 0 |
| ambiguous names reported | 3 — `admin`, `plants_copy`, `mitigateny_county_template_copy`, each naming two `:pattern` rows |

**Coverage after: `parent_id` set 100.0% (33,763/33,764).** 98.6% resolve to an existing row; the gap
is components whose pages lie outside the cloned subset, not a defect.

**And the runtime fallback stops firing.** Walking 300 components on the migrated clone:

```
hops taken from the parent_id column : 1452
hops needing the type-path fallback  :    0
```

So on a migrated app the walk is a pure column follow, and a type-path hit becomes a useful signal
that a migration is incomplete — worth a counter.

### Still to do on this task

- Capability probes (`auth` / `parent_id` present?) memoised in the `hasChangeLog()` style, and the
  two query shapes chosen from them. The resolver already *behaves* correctly without the columns —
  `authOf` and `parentIdOf` fall back to `data` — but nothing yet probes, so callers must still
  project the right columns for their schema.
- Wiring the columns into the write path, so new rows set `parent_id` rather than relying on backfill.


## Duplicate instance names: the guard (2026-10-28)

Owner: the duplicates are errors to resolve, with a strict guard so they cannot recur.

### What they actually are — fewer errors than the first count suggested

Scoping the key to `parent|instance` (what the type grammar really names) only drops **21 → 19**, so
most are duplicated *within their own scope*:

| kind | collisions | |
|---|---|---|
| **pattern** | **3** | `prod\|admin:pattern` exists **twice**, ids 2724987 ("Admin", Sep 30) and 566466 ("admin", Aug 26) — **both on the site's pattern list**, byte-identical types |
| view | 12 | e.g. `capacities_v2\|v1` ×5, all named "version 1" |
| source | 2 | `test_meta_forms_env\|capacities_v2` ×3 |
| data | 2 | `lhmp_ia\|1441681` ×2 |

**Correction (owner, 2026-10-28): sources carry grants too**, so scoping the guard to patterns was
wrong. Measured across the whole app — rows carrying an auth field, and how many hold a real grant:

| kind | carry the field | with real grants |
|---|---|---|
| **component** | 137,900 | **135,491** |
| page | 1,962 | 249 |
| pattern | 86 | 82 |
| **source** | 2 | **2** |
| view | — | 0 |

Two things fall out. Grants are overwhelmingly a **component-level** thing in this app — 135k of
them — which says more about how the chain will be used than anything in the design did. And
**sources do hold grants**, so a duplicate source name can attach a row to the wrong ones.

A kind holding no grants *today* still matters: a `:data` row reaches its source **through its view**,
so a duplicate view can attach data to the wrong source's grants tomorrow. The guard therefore covers
**every container kind**, not a chosen few.

Which duplicates actually carry grants right now:

```
pattern  prod|admin:pattern                            ×2   with grants: 2   ← both
pattern  prod|mitigateny_county_template_copy:pattern  ×2   with grants: 2   ← both
pattern  prod|plants_copy:pattern                      ×2   with grants: 0
…every view / source / data duplicate                       with grants: 0
```

So the immediate auth exposure is the two pattern pairs — but that is today's luck, not structure.

### Two guards, built

**1. Application level — `createData` refuses a duplicate pattern type.** Follows the existing
`tenant` subdomain guard right above it in the same function. Mode-gated by `DMS_ROW_AUTH_MODE` so
hits are visible before anything is refused: `log` (default) warns with a `would-deny create` line,
`enforce` throws, `legacy` skips. The tenant guard is unconditional; this one can follow once the
three production duplicates are resolved. Covered by three cases in `tests/test-row-auth-reads.js`.

**2. Database level — a partial unique index per container kind**, added by
`migrate-row-auth.js --add-uniqueness-guard [kind|all]`:

```sql
CREATE UNIQUE INDEX … ON <table>(app, type) WHERE type LIKE '%:pattern';
--  …and the same for source, view, dmsenv, site
```

Per kind, because each can be cleaned independently and they are in very different states.

This is the one that holds for writes which never go through the application. The script **refuses to
add it while duplicates exist**, listing them with their ids rather than failing with a raw Postgres
error.

### Verified end to end on the clone

```
⚠  cannot add the pattern guard — 3 duplicate pattern type(s):
     prod|admin:pattern  ×2   (ids include 566466, 2724987)
     …
```

then, after resolving them in the clone:

```
pattern guard: unique index added on (app, type) where type is a pattern
RESULT: duplicate insert REFUSED by the database →
  duplicate key value violates unique constraint "data_items_pattern_type_uniq"
```

### Left for the owner

The three production duplicates need a human: **both `prod|admin:pattern` rows are on the site's
pattern list**, so "keep the newest" is a guess, not a fix. Deciding which is live, re-pointing
anything that names the other, and removing it is a data decision. Nothing in `mitigat-ny-prod` was
modified — the resolution above was done in the clone purely to prove the index applies.


## Production audit (read-only, 2026-10-28)

`migrate-row-auth.js --db dms-mercury-3 --app mitigat-ny-prod --add-uniqueness-guard`, **dry run —
nothing written**:

| kind | duplicate types | rows involved | |
|---|---|---|---|
| **pattern** | 3 | 6 | the auth-critical ones; 2 of 3 pairs carry real grants |
| **source** | 2 | 5 | `test_meta_forms_env\|capacities_v2:source` ×3 |
| **view** | 12 | 62 | `form1\|version_1:view` **×28** |
| dmsenv | 0 | — | clean |
| site | 0 | — | clean |

The view duplicates are the large job (62 rows) and the least urgent — none carry grants, and they
look like repeated-publish artefacts in form/test environments. Patterns are the small, urgent job:
3 pairs, 2 of which hold live grants.

**A bug this audit found in the script itself:** it assumed the columns existed and died with
`column "parent_id" does not exist` on an unmigrated app. Now each pass is gated on a capability
probe, so an **unmigrated app can be audited without being touched** — which is the normal first
step, and was impossible before.


## The read-path projection (2026-10-29) — found by running the real app under `enforce`

Hub **Phase A2** asked for `auth` / `parent_id` to be added to the read projection. It was never
built, and no test could have caught the consequence, because every suite builds its own rows.
Running the actual server against the `rowauth-test` clone with all four modes on `enforce` found it
in one request.

**The symptom.** Anonymous GET of `prod|mitigateny_auth:pattern` (#1427078) came back as a
`no-access` stub. That pattern is the **login page** — logged-out visitors could not reach the form
they need in order to stop being logged out.

**The cause.** `DATA_ATTRIBUTES` (`dms.controller.js:35`) is

```js
["id", "app", "type", "data", "created_at", "created_by", "updated_at", "updated_by"]
```

— no `auth`, no `parent_id`. On a **migrated** app that is exactly where the grants and the declared
vocabulary now live (#1427078 has `auth.vocabulary: true` and `data.authVocabulary: false`). So the
gate judged the leaf on a stale `data.authPermissions` and saw no vocabulary at all, which meant
`publicReadOf` — the whole point of Phase 1 — was invisible on the one row that declares it.

Note the shape of the failure: the row's **ancestors** were loaded through `authRowsByIds`, which
*does* select the columns, so the chain was right and only the leaf was wrong. A gate reading a
correct chain and a stale leaf is the hardest version of this to spot by eye.

**The fix, and why it is not where the hub put it.** Widening `DATA_ATTRIBUTES` fixes the one read
path that uses it. `rowAuthGate.judge()` instead re-loads any batch whose rows arrive without the
columns, through the loader it already has:

- one batched query for the whole set, not one per row;
- in the single place that knows which columns the decision needs;
- it covers **every** surface at once — the alternative is auditing each read path by hand and
  getting it wrong again the next time someone adds one.

It is skipped entirely when `controller.hasAuthColumns(app)` says the table is unmigrated, so an
unmigrated app pays nothing. `hasAuthColumns` is the memoised `rowAuthCaps` probe, like every other
capability check here.

**Verified live** (server on :4444, `DMS_ROW_AUTH_MODE` / `DMS_DATA_AUTH_MODE` / `DMS_READ_AUTH_MODE`
/ `DMS_SOURCE_AUTH_MODE=enforce`, `DMS_WRITE_GATE=row`, `DMS_UDA_GATE=row`), all anonymous:

| row | before | after | why |
|---|---|---|---|
| `prod\|mitigateny_auth:pattern` #1427078 | refused | **served** | declares `publicRead` |
| `prod\|admin:pattern` #2724987 | refused | **served** | declares `publicRead` |
| `mitigateny_chenango\|page` #2546059 | served | served | its pattern grants `public: ['view-page']` |
| `…county_template_copy\|component` #2231675 | — | `data` refused | stated chain, no public grant |
| `…county_template_copy\|page` #2231618 | — | `data` refused | stated chain, no public grant |

The refusals are per-attribute: `type` is served and `data` comes back as `no-access`. That is the
existing refusal shape, not a new one.

**This is why `--diff-reads` output predating 2026-10-29 is stale.** `diff2.txt` lists #1427078,
#2724987 and #2546059 as TIGHTER; all three now agree. Any TIGHTER/LOOSER count quoted from before
this fix, Phase 1's `publicRead`, and the string-encoded-grant repair must be re-measured before it
is used as evidence for deleting the kind-auth branch.
