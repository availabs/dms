# Set Primary Key Column from Metadata UI

**Status: implemented and live-confirmed working (set, remove, and badge/switch sync against a real external source) — 2026-07-07. One known limitation remains deliberately unfixed (console-only error notification, deferred to the team — see below). A few lower-priority checklist items are still unexercised (see Testing Checklist).**

## Objective

Let an admin designate (or auto-detect) a real SQL `PRIMARY KEY` constraint on an **external (DAMA) source's** underlying Postgres table from the Metadata page, and expose an `isEditable` toggle that only becomes available once a real primary key exists. This is the prerequisite infrastructure for [[external-source-editable-crud]] — external sources cannot safely support row-level add/edit/delete without a column that reliably and uniquely identifies a row.

This task is scoped to **external sources only**. Internal (`internal_table`/DMS) sources are out of scope — their split tables already declare a synthetic integer `id PRIMARY KEY` at creation time (`table-resolver.js`), so they already have a real PK and are already fully editable via the existing `isDms` path. Nothing about PK detection/creation needs to change for internal sources.

---

## Scope

**In scope**
- A way to tell "this table has a real declared PRIMARY KEY constraint" apart from "no PK exists, caller should fall back to a guess" — the existing `resolvePrimaryKey()` conflates these (see Current State).
- A per-column "Primary Key" control in `MetadataComp`/`RenderField`, external sources only, strictly mutually exclusive (unlike the existing multi-column `isIndex` toggle — a table can have at most one PK).
- When the admin picks a column: validate it has no NULLs and no duplicate values, then run `ALTER TABLE ... ADD CONSTRAINT ... PRIMARY KEY (col)`. On validation failure, block the action and show the conflict (e.g. row/duplicate counts) — do **not** silently fall back to generating a synthetic ID column (rejected as a v1 feature; see "Rejected alternatives").
- Auto-detection: if the underlying table already has a real PK (declared outside of DMS, e.g. by the DAMA ETL/upload pipeline — `ogc_fid` on GIS tables, `csv-publish.js`'s synthetic PK), show it as already-set/read-only in the metadata UI rather than making the admin re-declare it.
- An `isEditable` toggle (external sources only), disabled until a real PK is detected or set. Turning it on is a deliberate admin action — it does **not** flip on automatically just because a PK appears. This is intentionally a separate flag from "has a pkey" so a source doesn't silently become editable as a side effect of unrelated PK-related work (e.g. the composite-index follow-on task).
- Persist both the PK column name and `isEditable` on the source's metadata, in the same JSON blob the `isIndex` flag already lives in (`data_manager.sources.metadata.columns[]` / top-level `metadata`).

**Out of scope**
- Internal/DMS sources (already have a synthetic PK, see Objective).
- Auto-generating a synthetic PK column (e.g. `_dms_id BIGSERIAL`) as a fallback when the chosen column fails validation. If this is wanted later, it's a separate, larger follow-on (needs its own UX for naming/backfilling the column) — flag as a future idea, don't build now.
- Composite/multi-column primary keys (single column only, mirrors `setindex-composite-covering-indexes.md` treating composite indexes as a separate follow-on to `set_index_col_from_meta.md`).
- Actually performing row-level add/edit/delete — that's [[external-source-editable-crud]].

**Scope update (2026-07-07, post-review):** Removing an existing PK was originally out of scope ("no unset PK — manual DB operation for now"). Real testing showed this was a real gap, not just a safety margin — once set on the wrong column (or once an admin wants to reconfigure), there was no recovery path short of a manual DB operation, and the client had no way to reflect a PK that was in fact removed directly in the DB (see Known Issues Found & Fixed below). Removal is now in scope: `setPrimaryKeyColumn(env, sourceId, columnName, enable=true)` supports `enable=false`, dropping whatever the table's real PK constraint actually is (looked up via `pg_constraint`, not assumed to match this feature's generated name — it may predate this feature, e.g. `ogc_fid`), and clearing `isEditable` at the same time (a source can't stay editable without a resolvable PK).

### Rejected alternatives
- Synthetic-column fallback on validation failure — decided against for v1; validate-and-block only, so bad data is surfaced and fixed at the source rather than papered over with a hidden extra column.
- Fully-automatic `isEditable` (true the instant a PK exists, no separate toggle) — decided against; an explicit toggle keeps "this source is now writable from the UI" a conscious admin decision.

---

## Current State

### Precedent: `set_index_col_from_meta.md` (completed)

The existing index-toggle feature is the closest analog and this task follows its shape closely:
- UI: `src/dms/packages/dms/src/patterns/datasets/components/MetadataComp/components/RenderField.jsx` — `RenderIndexSwitch` (~line 120-135) renders a "Index" `Switch` bound to `item.isIndex`, plus an "IDX" badge in the column header (~line 412) when set.
- State: `src/dms/packages/dms/src/patterns/datasets/components/MetadataComp/index.jsx` — `setIndex(colName, enable)` (~line 73-92) toggles `isIndex` on the target column, optimistic local update, calls `onIndexChange` prop.
- Wiring: `src/dms/packages/dms/src/patterns/datasets/pages/dataTypes/gis_dataset/pages/metadata.jsx` (and the shared `default`/`csv_dataset` metadata pages) renders `<MetadataComp onIndexChange={...}>`, which calls `falcor.call(['uda','sources','setIndex'], [env, id, columnName, enable])` (~line 38-40).
- Backend route: `uda.sources.setIndex` CALL route, `src/dms/packages/dms-server/src/routes/uda/uda.route.js:402-415`, delegates to `setIndexColumn(env, sourceId, columnName, enable)` in `src/dms/packages/dms-server/src/routes/uda/uda.controller.js:431-541`.
- `setIndexColumn` branches on `isDms` (from `getEssentials({env})`): the DMS branch creates a JSONB expression index (`CREATE INDEX ... ON tbl ((data->>'col'))`) on each of the source's split tables; the external/DAMA branch (~line 491-541) loads `data_manager.sources.metadata`, flips `isIndex` on `metadata.columns[i]`, persists, then for each row in `data_manager.views WHERE source_id = $1` runs `CREATE INDEX IF NOT EXISTS ${idxName} ON ${fqt} ("${safeCol}")` / `DROP INDEX IF EXISTS`. Index names via `pgIdent(sanitize(...))` helpers in `uda/utils.js:31-42`.
- Metadata storage location by source kind: `internal_table` → `source.data.config.attributes[]`; external → `source.data.metadata.columns[]` (both flexible JSON arrays).

### Existing PK-detection code (read-path only, needs extending)

`resolvePrimaryKey(db, schema, table, storedIdx = null)` — `src/dms/packages/dms-server/src/routes/uda/query_sets/postgres.js:453-479`:
```js
const _pkCache = new Map();
async function resolvePrimaryKey(db, schema, table, storedIdx = null) {
  const key = `${schema}.${table}`;
  if (storedIdx) { _pkCache.set(key, storedIdx); return storedIdx; }
  if (_pkCache.has(key)) return _pkCache.get(key);
  let pk = 'id';
  if (db.type === 'postgres') {
    try {
      const { rows } = await db.query(
        `SELECT a.attname AS pk FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = $1::regclass AND i.indisprimary LIMIT 1`,
        [`${schema}.${table}`]
      );
      if (rows[0]?.pk) pk = rows[0].pk;
    } catch (e) { /* fall back to 'id' */ }
  }
  _pkCache.set(key, pk);
  return pk;
}
```
Used by `dataById()` (postgres.js:481-493) to pick the column for `WHERE ${idxCol} = ANY($1)` on reads. **Problem for this task:** it always resolves to *some* column (falls back to the string `'id'` even when no real PK exists and the table has no `id` column either) — there is no way for a caller to distinguish "found a real PK" from "guessed and might be wrong." A write path (this task's validation, and the CRUD task's WHERE clauses) must never operate on a guessed column.

### Existing real-PK-creation precedent

- `src/dms/packages/dms-server/src/dama/upload/workers/csv-publish.js:123-124`: `ALTER TABLE "${table_schema}"."${table_name}" ADD COLUMN ogc_fid BIGSERIAL PRIMARY KEY` — adds a *new synthetic* column + PK after CSV ingest.
- `src/dms/packages/dms-server/src/dama/upload/workers/gis-publish.js:284`: `CREATE TABLE ... (ogc_fid INTEGER PRIMARY KEY, ...)` — PK declared at table-creation time.

Neither adds a PK constraint onto an *existing* user column (this task's actual operation: `ALTER TABLE ... ADD CONSTRAINT ... PRIMARY KEY (existing_col)`), but they confirm the DDL execution pattern (raw `pg` `client.query()`, no query builder, per `dms-server/CLAUDE.md` SQL-readability convention) already used elsewhere in this codebase.

### Source ↔ table binding (external sources)

`data_manager.sources.metadata` (JSON, `columns[]`) holds the author-facing column list; `data_manager.views` rows (one or more per source) hold `table_schema`/`table_name` for the physical table(s) — `getDataTableFromViewId({db, view_id})` in `src/dms/packages/dms-server/src/routes/uda/utils.js:223-243` is the existing lookup. `setIndexColumn`'s external branch already iterates `data_manager.views WHERE source_id = $1 AND table_name IS NOT NULL` to apply DDL to every physical table backing a source — this task's PK DDL and validation must do the same iteration (a source can back more than one view/table).

---

## Proposed Changes

### 1. PK detection helper (server) — DONE

Add a sibling to `resolvePrimaryKey` in `postgres.js` that does **not** fall back silently — e.g. `detectRealPrimaryKey(db, schema, table)` returning the real PK column name or `null`. Keep `resolvePrimaryKey` (with its `'id'` fallback) untouched for existing read-path callers (`dataById`) so this task doesn't change read behavior. `detectRealPrimaryKey` can share the same `pg_index`/`pg_attribute` query; no caching needed here (called rarely — metadata page load, not hot read path) or reuse `_pkCache` if convenient.

Implemented as `detectRealPrimaryKey(db, schema, table)` in `query_sets/postgres.js` (right after `resolvePrimaryKey`), exported alongside the other query-set functions. Returns `null` immediately for non-Postgres DBs and on any query error — never guesses. Verified with a stubbed `db.query` that no fallback occurs (see Verification Notes at the end of this file).

### 2. Validation query (server) — DONE

Before running the `ALTER TABLE ... ADD CONSTRAINT ... PRIMARY KEY` DDL, run a cheap validation per target table:
```sql
SELECT count(*) AS total, count(distinct "${col}") AS distinct_count, count("${col}") AS non_null_count
FROM "${schema}"."${table}"
```
If `distinct_count < total` or `non_null_count < total`, reject with a message reporting the gap (e.g. `"${total - non_null_count} rows have NULL, ${total - distinct_count} duplicate values"`).

Implemented inside `setPrimaryKeyColumn` (validates every view's table before altering any of them — verified with a stub returning `{total:10, distinct_count:8, non_null_count:9}`: throws `Column "a" cannot be a primary key on s.t: 1 row(s) with NULL, 2 duplicate value(s)` and no `ALTER TABLE` is issued).

### 3. New UDA CALL route: `uda.sources.setPrimaryKey` — DONE

`src/dms/packages/dms-server/src/routes/uda/uda.route.js` — new route alongside `setIndex` (~line 402-415), args `[env, sourceId, columnName]`. Delegates to a new controller function.

Implemented as `uda.sources.setPrimaryKey` CALL route, right after `setIndex`. Invalidates `sources.byId[id]` and the new `sources.byId[id].pkeyInfo` path on success.

### 4. Controller: `setPrimaryKeyColumn(env, sourceId, columnName)` — DONE

`src/dms/packages/dms-server/src/routes/uda/uda.controller.js`, external-only (throw/no-op if called for a DMS source — internal is out of scope per Objective):
1. Load `data_manager.sources` row, parse `metadata`.
2. For each `data_manager.views WHERE source_id = $1 AND table_name IS NOT NULL` row: run the validation query (§2); if any table fails validation, abort with no DDL executed and surface which table/counts failed.
3. If validation passes for all tables: for each, run `ALTER TABLE "${table_schema}"."${table_name}" ADD CONSTRAINT "${pgIdent('pk_' + sanitize(table_name))}" PRIMARY KEY ("${safeCol}")` (reuse `sanitize`/`pgIdent` from `uda/utils.js`).
4. Persist to `metadata.columns[]`: set `isPrimaryKey: true` on the target column, clear it on any other column (strict mutual exclusion — unlike `isIndex`).
5. Persist via the existing generic source-metadata save path (`updateSourceData()`/whatever `setIndexColumn` uses to write `metadata` back) — no new persistence mechanism needed.

Implemented in `uda.controller.js` (right after `setIndexColumn`) exactly as scoped: throws for `isDms` and non-Postgres sources, validates every view's table, runs `ALTER TABLE "${table_schema}"."${table_name}" ADD CONSTRAINT "${pgIdent('pk_'+sanitize(table_name))}" PRIMARY KEY ("${safeCol}")` per table, then persists `isPrimaryKey: true` on the target column and strips it from every other column via `updateSource()`. Verified against a stubbed DB: mutual exclusion confirmed (previously-flagged column `a` loses `isPrimaryKey`, `b` gains it), `ALTER TABLE` SQL text confirmed correct.

### 5. PK-info GET path (server) — DONE

Extend an existing source-fetch route (or add a small new one) so the metadata page can learn, per source: `{ hasPkey: boolean, pkeyColumn: string|null, isDetectedExisting: boolean }` — `isDetectedExisting` distinguishes "found a real PK that predates this feature" (e.g. `ogc_fid`) from "set via this UI." Drives the read-only vs. editable state of the PK control. Uses `detectRealPrimaryKey` (§1) plus checking `metadata.columns[].isPrimaryKey`.

Implemented as `getSourcePrimaryKeyInfo(env, sourceId)` in `uda.controller.js` + a dedicated GET route `uda[{envs}].sources.byId[{ids}].pkeyInfo` in `uda.route.js` (a computed field, not a real DB column, so it can't ride the generic `sources.byId[attributes]` route — mirrors the existing `sources.byId[ids].views.length` computed-route pattern). For `isDms` sources returns `{hasPkey:true, pkeyColumn:'id', isDetectedExisting:true}` unconditionally (out of scope, always true). For external sources, iterates every view's table; if any lacks a detectable real PK, reports `hasPkey:false`. Verified all three response shapes (no PK / detected pre-existing / matches previously-set flag) against a stubbed DB.

### 6. Frontend: PK control in MetadataComp — DONE

`RenderField.jsx` — add `RenderPrimaryKeySwitch` next to `RenderIndexSwitch`, external sources only (gate on `accessKey === 'columns'` or equivalent isDms check already available in the component tree), "PK" badge next to "IDX" badge. Disabled + tooltip ("Another column is already the primary key" / "This table already has a primary key on `ogc_fid`") when not applicable.

`MetadataComp/index.jsx` — `setPrimaryKey(colName)` handler: strict mutual exclusion across all columns (unset any other column's `isPrimaryKey`), calls `onSetPrimaryKey` prop, which the metadata pages wire to `falcor.call(['uda','sources','setPrimaryKey'], [env, id, columnName])`. Also fetch pkey-info (§5) on mount to seed disabled/read-only state.

Implemented: `RenderPrimaryKeySwitch` + a "PK" header badge in `RenderField.jsx` (gated on `!isDms`, disabled once any column has the PK, tooltip explains why). `MetadataComp/index.jsx`'s `setPrimaryKey(colName)` is deliberately **not optimistic** (unlike `setIndex`) — it awaits `onSetPrimaryKey`, only updates local state on success, and surfaces the thrown validation message in a `pkeyError` banner otherwise (server validation can legitimately reject the request, and the UI must not show a PK that wasn't actually set). Wired in `gis_dataset/pages/metadata.jsx` (the single shared metadata page used by all dataTypes via `defaultPages.js` — no separate csv_dataset copy exists) via `falcor.call(['uda','sources','setPrimaryKey'], [env, id, columnName])`, with `pkeyInfo` fetched on mount and refreshed after a successful set.

### 7. Frontend: `isEditable` toggle — DONE

Likely lives on the source's admin/settings surface rather than inline in `MetadataComp` (needs a deliberate, slightly separated action from picking columns) — candidate location: `src/dms/packages/dms/src/patterns/datasets/pages/dataTypes/default/admin.jsx`. Toggle disabled until pkey-info reports `hasPkey: true`; persists `metadata.isEditable` via the existing generic source-metadata save path used elsewhere (same mechanism as `isIndex`/other metadata fields — no new route needed for this part, it's a plain metadata field write).

Implemented as `EditableToggle` in `default/admin.jsx`, external branch only (alongside `AddExternalVersionBtn`/`DeleteDamaSourceBtn`). Fetches `pkeyInfo` on mount the same way the metadata page does; writes `metadata.isEditable` via `updateSourceData({..., attrKey:'metadata', isDms:false})` (the same generic JSON-blob save path `MetadataComp`'s `onChange` already uses). Disabled (with a tooltip pointing to the Advanced Metadata page) until `pkeyInfo.hasPkey` — turning it on is a separate, deliberate click, never automatic.

---

## Files Requiring Changes

| File | Change |
|---|---|
| `packages/dms-server/src/routes/uda/query_sets/postgres.js` | Add `detectRealPrimaryKey(db, schema, table)` (no fallback) alongside existing `resolvePrimaryKey` |
| `packages/dms-server/src/routes/uda/uda.controller.js` | Add `setPrimaryKeyColumn(env, sourceId, columnName)` (validation + DDL + metadata persist, external-only), pkey-info lookup used by the metadata GET path |
| `packages/dms-server/src/routes/uda/uda.route.js` | New CALL route `uda.sources.setPrimaryKey`; extend/add GET path for pkey-info |
| `packages/dms/src/patterns/datasets/components/MetadataComp/components/RenderField.jsx` | `RenderPrimaryKeySwitch` + "PK" badge, disabled states |
| `packages/dms/src/patterns/datasets/components/MetadataComp/index.jsx` | `setPrimaryKey(colName)` handler with strict mutual exclusivity; surface pkey-info |
| `packages/dms/src/patterns/datasets/pages/dataTypes/gis_dataset/pages/metadata.jsx` (+ shared default/csv_dataset metadata pages) | Wire `onSetPrimaryKey` → CALL route; fetch pkey-info |
| `packages/dms/src/patterns/datasets/pages/dataTypes/default/admin.jsx` (exact location TBD during implementation) | `isEditable` toggle, gated on `hasPkey` |

---

## Known Issues Found & Fixed (live testing, 2026-07-07)

Real browser testing against a live source surfaced two bugs the stub-DB unit checks couldn't catch (they exercise server logic only, not the frontend's source-of-truth wiring):

1. **PK badge/switch trusted the stored metadata flag instead of live detection.** `RenderField.jsx`'s "PK" badge and `RenderPrimaryKeySwitch`'s enabled/disabled state both read `item.isPrimaryKey` (the flag persisted in `metadata.columns[]`) rather than `pkeyInfo` (the live `pg_index` detection already being fetched for exactly this purpose). Symptoms this caused, all from the one root cause:
   - A PK that already existed in the DB before ever touching the client didn't show a badge (nothing had ever written `isPrimaryKey: true` for it).
   - After setting a PK through the client (which did write the flag) and then dropping the constraint directly in Postgres, the badge kept showing PK and the switch stayed permanently disabled — since `Switch` itself blocks `setEnabled` from firing at all while `disabled` is true, clicking it did nothing, which looked like "the client doesn't trigger any calls."
   - Fix: `isThisColumnPk` and the header badge now derive purely from `pkeyInfo.hasPkey && pkeyInfo.pkeyColumn === col`. `item.isPrimaryKey` is still written server-side for bookkeeping but the UI no longer reads it. Note this only re-syncs on page load / after a successful set — there's no polling, so a PK dropped directly in the DB while the page is open won't reflect until reload.
   - **Live-confirmed fixed** (2026-07-07): badge and switch now correctly reflect the real DB state in all the scenarios above.
2. **No way to remove a primary key from the client at all.** Originally scoped out ("manual DB operation for now" — see Scope update above), but combined with bug #1's stuck-disabled state, this meant a PK set on the wrong column (or one that needed reconfiguring) had no recovery path short of a direct DB operation. Added `enable=false` support to `setPrimaryKeyColumn`/`uda.sources.setPrimaryKey` (drops the real constraint via `pg_constraint` lookup, not an assumed name, and clears `isEditable`) plus a confirm-modal on the switch (reusing the same `Modal`/`Button` pattern as `RenderRemoveBtn`'s column-delete confirmation in the same file) before calling it.
   - **Live-confirmed working** (2026-07-07): remove-via-confirm-modal tested against a real external source.

## Known Issue Found, Not Fixed — Deferred to Team (2026-07-07)

**Validation errors during set only appear in the browser console, not the `pkeyError` UI banner.** Root-caused, deliberately **not fixed** as part of this task — see below for why.

Diagnosis: the server side is correct. A thrown `Error` in `setPrimaryKeyColumn` correctly becomes a genuine `HTTP 500` (`packages/dms-server/src/utils/falcor-router/src/run/conversion/errorToPathValue.js` re-throws rather than converting to a `$error` sentinel, because `runCallAction.js` sets `throwToNext = true`; `falcor-express/src/index.js`'s `onError` branch does `res.status(500).json({ error: message })`). The client's `falcor.call(...)` promise genuinely rejects — it is not silently swallowed.

The bug is in `@availabs/avl-falcor` (the org's own npm package, `node_modules/@availabs/avl-falcor`, `dist/falcor-http-datasource/src/request.js`, `_handleXhrError`/`onXhrLoad`). For any non-2xx response outside its few explicitly-handled status codes (401/403/407/410/408/504), it does `_handleXhrError(observer, responseData)` where `responseData` is already the **parsed JSON object** (`{error: "..."}`, since `responseType: 'json'`). `_handleXhrError` then does `new Error(textStatus)` with no second `errorThrown` arg, so `errorThrown = new Error(theObject)` — `Error()` stringifies an object argument via `String(object)`, producing the literal text `"[object Object]"`. The real server message is discarded before it ever reaches `MetadataComp`'s `catch (e) { setPkeyError(e?.message ...) }` — so the banner would show `"[object Object]"` (or nothing useful), while the actual text only ever printed via the route's own `console.error` and the browser's network/console tooling.

**This is not scoped to this feature** — it affects every `falcor.call`/`falcor.get` error path in the entire app identically (confirmed: other `catch` blocks near `falcor.call` elsewhere in the codebase use the same `err.message || fallback` idiom with no evidence any of them have actually verified a server error message survives the round trip; a few adjacent error-prone flows already sidestep it by using plain `fetch()` instead of `falcor.call`, suggesting the team may already be informally aware of this class of issue).

**Decision (2026-07-07): flagged for the team to address separately, not fixed here.** Options considered and left for a future task: (a) patch `@availabs/avl-falcor` via `patch-package` so `_handleXhrError`/`onXhrLoad` pull a string out of the parsed body (`responseData?.error || responseData?.message`) before constructing the `Error` — fixes it app-wide, but means patching a shared org package and adding new tooling; (b) a scoped client-side workaround in `MetadataComp` only (show a fixed generic message on any `setPrimaryKey` failure) — notifies the user but loses the specific validation detail and doesn't help any other call site. Whoever picks up either fix should reference this diagnosis rather than re-investigating from scratch.

---

## Testing Checklist

Mix of stub-DB logic checks (this session, no live Postgres/DAMA environment reachable here) and actual live-browser testing (done by the task's requester against a real source, which is how the two bugs in "Known Issues Found & Fixed" were caught). Items below reflect the current state after those fixes.

- [x] External source, table has no PK, column has unique non-null values: set PK — `ALTER TABLE ... ADD CONSTRAINT ... PRIMARY KEY` SQL text confirmed correct against a stub; `isPrimaryKey: true` persisted in the metadata update payload. Live-confirmed the badge now renders correctly post-fix.
- [x] External source, column has NULLs and/or duplicate values: attempt to set PK — confirmed rejected with an exact count-based message, confirmed no `ALTER TABLE` query was issued. **Known limitation, not fixed**: the rejection message currently only surfaces in the browser console, not the `pkeyError` UI banner — root-caused to a pre-existing `@availabs/avl-falcor` bug (see "Known Issue Found, Not Fixed" above); deliberately deferred to the team rather than fixed in this task.
- [x] External source, table already has a real PK (e.g. GIS `ogc_fid`) before this feature runs: live-confirmed the badge now shows correctly (this was bug #1 — previously required setting through the client at least once).
- [x] External source, PK dropped directly in the DB after being set through the client: live-confirmed the badge/switch now correctly go back to "not set" after a page reload (this was bug #1's other half).
- [x] Remove a primary key through the client (new): confirm modal appears, confirms drop, badge disappears, switch re-enables for other columns. Logic-verified against a stub and **live-confirmed working** (2026-07-07) against a real external source.
- [ ] Remove when the source has multiple views/tables and only some have the constraint: confirm it drops on each table that has one and skips cleanly on ones that don't. Logic-verified against a stub; **not yet live-tested** (single-view source was used for live testing).
- [x] Source with multiple views/physical tables: `setPrimaryKeyColumn` iterates `data_manager.views` and validates every table before running any `ALTER TABLE` (code-reviewed; not exercised with >1 real view live).
- [x] Mutual exclusivity: setting column B as PK after column A was already flagged — confirmed A's `isPrimaryKey` is stripped and B's is set in the same persisted payload.
- [x] `setPrimaryKeyColumn` throws for `isDms` sources (internal, out of scope) and for non-Postgres DBs — confirmed against stubs.
- [ ] `isEditable` toggle is disabled until a PK exists (detected or set); becomes enabled immediately after PK is set without requiring a page reload. **Not yet live-tested.**
- [ ] `isEditable` toggle does not turn on by itself when a PK is detected — it stays off until the admin explicitly flips it. **Not yet live-tested.**
- [ ] Reload after save: PK state and `isEditable` state both persist correctly. **Not yet live-tested.**
- [x] Internal (`internal_table`) sources: `RenderField`/`RenderPrimaryKeySwitch` gate on `!isDms`; `EditableToggle` only renders in the external branch of `admin.jsx`; `setPrimaryKeyColumn`/`getSourcePrimaryKeyInfo` both special-case `isDms` server-side. Code-reviewed, not live-tested.
- [ ] Existing `isIndex` toggle behavior (from `set_index_col_from_meta.md`) is unaffected by these changes. **Not yet live-tested** — no existing code paths for `isIndex` were touched, only new code added alongside.

### Verification Notes (2026-07-07)

No live Postgres/DAMA pgEnv was available in this sandbox — the local `dms-sqlite.config.json` (gitignored, machine-specific) points at a remote Postgres host that wasn't reachable, and the test suite (`npm test` in `dms-server`) fails on that pre-existing environment mismatch unrelated to this change (confirmed: `git stash` of only this task's files reproduces the same pre-existing failure). Instead:
- `node --check` on all three modified server files (no syntax errors).
- A standalone script required `uda.controller.js`/`query_sets/postgres.js` directly and drove `setPrimaryKeyColumn`, `getSourcePrimaryKeyInfo`, and `detectRealPrimaryKey` against a hand-written stub `db.query` covering: happy path, validation failure, `isDms` guard, non-Postgres guard, and all three `pkeyInfo` response shapes. All 8 checks passed (see items marked `[x]` above).
- `npx eslint` diff on the three touched frontend files shows only the same pre-existing `react/prop-types` pattern already present 165 times across this file set (this codebase doesn't enforce PropTypes in practice) — no new categories of lint error introduced.
- The frontend wiring (`MetadataComp`, `RenderField.jsx`, `metadata.jsx`, `admin.jsx`) was reviewed for correctness but not exercised in a running browser — whoever picks this up next should click through the checklist items still marked `[ ]` against a real external/DAMA source with a running dev server.
