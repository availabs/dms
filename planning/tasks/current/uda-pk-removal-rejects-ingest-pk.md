# PK removal rejects the very constraint it exists to remove (`ogc_fid`)

**Status:** NOT STARTED
**Created:** 2026-08-13
**Topic:** dama

## Objective

Let `setPrimaryKeyColumn(..., enable = false)` remove a primary key that was
declared outside DMS — which is the case it was explicitly designed for, and the
one case it currently refuses.

## Scope

**In scope**
- The column-exists guard in `setPrimaryKeyColumn` and how it interacts with the
  removal branch.
- Whatever the client passes for `columnName` when removing, so the call site
  reads like what it does.

**Out of scope**
- Composite primary keys, and auto-generating a synthetic PK — both already out
  of scope in [`set_primary_col_from_meta.md`](./set_primary_col_from_meta.md).

## Current State

`setPrimaryKeyColumn` (`packages/dms-server/src/routes/uda/uda.controller.js:586`)
validates that the named column exists in the source's declared metadata before
it branches on `enable`:

```js
// uda.controller.js:602
if (!cols.some(c => c.name === columnName)) throw new Error(`Column "${columnName}" not found on source ${sourceId}`);
```

The removal branch below it does **not** use `columnName` at all. It looks the
constraint up for real (`uda.controller.js:640`):

```sql
SELECT conname FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'p'
```

That lookup is deliberate. The scope update in `set_primary_col_from_meta.md`
spells out why:

> dropping whatever the table's real PK constraint actually is (looked up via
> `pg_constraint`, not assumed to match this feature's generated name — it may
> predate this feature, e.g. `ogc_fid`)

So the function is built to drop an ingest-declared `ogc_fid` — but the guard in
front of it makes naming `ogc_fid` impossible, because `ogc_fid` is added by the
GIS/CSV upload pipeline and is never in `metadata.columns`.

### How it presents

`getSourcePrimaryKeyInfo` reports the real constraint
(`uda.controller.js:694`), so the UI and any script sees:

```json
{ "hasPkey": true, "pkeyColumn": "ogc_fid", "isDetectedExisting": true }
```

Passing that value straight back — the obvious call — fails:

```
Column "ogc_fid" not found on source 11
```

Hit live on 2026-08-13 while repointing the four WCDB datasets from the ingest's
`ogc_fid` to their semantic keys (`project-planning/wcdb/tasks/completed/migrate-wcdb-datasets-to-pgenv.md`).

### The workaround, and why it is not good enough

Passing the *incoming* column with `enable = false` satisfies the guard and drops
the right constraint anyway, since the branch ignores the name:

```js
await setPrimaryKeyColumn(env, id, 'dj_id', false);  // actually drops ogc_fid
```

It works, and it is what the WCDB migration did. But it reads like a bug at the
call site — the argument names a column that has nothing to do with the
constraint being dropped — and it only works by relying on the parameter being
ignored. Anyone reasoning about the call from its signature gets it wrong.

## Proposed Changes

Pick one; the first is the smallest and matches the existing intent.

1. **Move the guard inside the `enable` branch.** It only protects the ADD path
   (which needs a real column to validate and alter). Removal doesn't use
   `columnName`, so it doesn't need it to exist.
2. **Accept `null`/omitted `columnName` for removal**, and have the client pass
   nothing when removing. Clearest signature — `setPrimaryKeyColumn(env, id, null, false)`
   says "drop the PK" — but it is a call-signature change with client callers.
3. Keep the guard but exempt a name that matches the actual detected constraint
   column. Most conservative, most conditional logic; least attractive.

Whichever is taken, the metadata bookkeeping at the end of the function
(`uda.controller.js:645-660`) already handles a `columnName` that is not in
`cols` — the `.map` simply matches nothing and `isEditable` is still cleared —
so no additional change is needed there.

## Files Requiring Changes

| File | Change |
|---|---|
| `packages/dms-server/src/routes/uda/uda.controller.js` | move/relax the guard at :602 |
| `packages/dms/src/patterns/datasets/pages/dataTypes/gis_dataset/pages/metadata.jsx:50` | only if option 2 — pass `null` when removing |
| `packages/dms-server/tests/test-uda.js` | regression test |
| `src/dms/planning/tasks/current/set_primary_col_from_meta.md` | note the fix against its "removal is in scope" section |

## Testing Checklist

- [ ] A source whose table has an externally-declared PK (`ogc_fid`, no entry in
      `metadata.columns`) can have that PK removed by the documented call —
      **using the column name `pkeyInfo` reports**, not a stand-in.
- [ ] Removal still clears `isEditable`.
- [ ] Removal on a table with no PK at all is a no-op, not an error.
- [ ] The ADD path still rejects a column that genuinely does not exist — the
      guard must not be deleted outright.
- [ ] Set → remove → set again on the same source leaves exactly one PK
      constraint and one `isPrimaryKey` flag.
- [ ] The UI's remove control works against a freshly uploaded GIS/CSV dataset,
      which is the state every ingested source starts in.

## Notes

Found alongside [[uda-source-attribute-set-blanks-objects]] during the same WCDB
migration; they are independent bugs in the same route file.
