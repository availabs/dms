# Bug: SQLite searchOne returns null for root page, breaking route `/`

**Status:** Completed (2026-01-28)

## Problem

When navigating to `/` (the root route) with the SQLite adapter, the page does not display. The `searchOne` Falcor route returns `null` instead of a `$ref` to the page. The page data exists in the database with `index: 0` — this is a code bug, not a data issue.

## Root Cause — Two Bugs

### Bug 1: `dataByIdResponse` uses `||` which drops falsy values like `0`

**File:** `src/routes/dms/dms.route.js:31`

```js
const value = row[getAtt] || null;
```

The `||` operator treats `0`, `""`, and `false` as falsy. When `index` is `0` (integer), `0 || null` evaluates to `null`. This is why the API response shows `"data ->> 'index'": null` even though the database has `index: 0`.

Evidence from logs: Page 212 has `"data ->> 'index'": 1` (truthy, works). Page 7 has `"data ->> 'index'": null` (actually `0`, but `0 || null` = `null`).

**Fix:** Use nullish coalescing `??` instead of `||`:
```js
const value = row[getAtt] ?? null;
```

### Bug 2: SQLite `->>` preserves JSON types, breaking string comparisons

**File:** `src/routes/dms/dms.controller.js` — `dataSearch` function

The `defaultSearch` SQL from the client contains:
```sql
data ->> 'index' = '0'
```

In PostgreSQL, `->>` **always returns text**. So `data ->> 'index'` returns `'0'` (text), and `'0' = '0'` is true.

In SQLite, `->>` **preserves the JSON type**. So if `index` is stored as JSON number `0`, `->>` returns integer `0`. Then the comparison `0 = '0'` (integer vs text) is **always false** in SQLite, because SQLite considers values of different storage classes to never be equal (integers are always "less than" text).

This means any `searchOne` defaultSearch comparing a numeric JSON value against a string literal will silently fail in SQLite.

## How searchOne Works

The client sends a `searchOne` request to find the page for a given URL:

```json
{
  "wildKey": "data ->> 'url_slug'",
  "params": "",
  "defaultSearch": "data ->> 'index' = '0' and (data ->> 'parent' = '' or data ->> 'parent' is null) and (data ->> 'template_id' is null)"
}
```

This generates SQL:
```sql
-- Part 1: Match by url_slug
SELECT id FROM data_items
WHERE app = $1 AND type = $2
AND data ->> 'url_slug' = $3           -- $3 = '' (empty string for root route)
UNION ALL
-- Part 2: Fallback for root page
SELECT id FROM data_items
WHERE app = $4 AND type = $5
AND data ->> 'index' = '0'
AND (data ->> 'parent' = '' OR data ->> 'parent' IS NULL)
AND (data ->> 'template_id' IS NULL)
LIMIT 1
```

- **Part 1** fails because url_slug is `"page_0"`, not `""`.
- **Part 2** fails because SQLite integer `0` ≠ text `'0'` (Bug 2).
- **Result:** `null` — no page found for route `/`.

## Evidence from Logs

### SQLite (`requests-2026-01-28T18-06-45-324Z.jsonl`)

**seq 8** — searchOne returns `null`:
```json
"searchOne": { "{...}": null }
```

**seq 8** — opts.byIndex finds the page (byId[7]) but `index` appears null due to Bug 1:
```json
"data ->> 'index'": null
```

Page 212 (with `index: 1`) shows correctly because `1` is truthy:
```json
"data ->> 'index'": 1
```

### PostgreSQL (`requests-2026-01-28T17-49-48-120Z.jsonl`)

**seq 8** — searchOne returns a valid ref:
```json
"searchOne": { "{...}": {"$type":"ref","value":["dms","data","byId",1697220]} }
```

**seq 8** — page has `index` as text `"0"` (PostgreSQL `->>` always returns text):
```json
"data ->> 'index'": "0"
```

## Fix

### Bug 1 Fix — `dms.route.js:31`

Change `||` to `??` (nullish coalescing):

```js
// Before (broken — drops 0, "", false)
const value = row[getAtt] || null;

// After (correct — only drops undefined/null)
const value = row[getAtt] ?? null;
```

### Bug 2 Fix — SQLite `->>` type compatibility

The `defaultSearch` SQL comes from the client as raw SQL text. The server interpolates it into the query. The fix needs to ensure that SQLite `->>` comparisons work the same as PostgreSQL.

**Option A: CAST in the SQL** — For SQLite, wrap `->>` expressions with `CAST(... AS TEXT)` so they behave like PostgreSQL. This could be done in the `dataSearch` function by transforming the `defaultSearch` and `wildKey` strings for SQLite:

```js
// In dataSearch, for SQLite, wrap ->> in CAST:
if (dbType === 'sqlite') {
  // Transform "data ->> 'field'" to "CAST(data ->> 'field' AS TEXT)"
  searchkeyJSON.wildKey = searchkeyJSON.wildKey.replace(
    /(data\s*->>\s*'[^']*')/g,
    'CAST($1 AS TEXT)'
  );
  if (searchkeyJSON.defaultSearch) {
    searchkeyJSON.defaultSearch = searchkeyJSON.defaultSearch.replace(
      /(data\s*->>\s*'[^']*')/g,
      'CAST($1 AS TEXT)'
    );
  }
}
```

**Option B: Fix at the adapter level** — Make the SQLite adapter's query processing convert `->>` to always return text. This is cleaner but more invasive.

**Option C: Store values as strings** — Ensure the DMS page pattern stores `index` as string `"0"` instead of number `0`. This avoids the type mismatch but doesn't fix the general issue and is fragile.

**Recommended: Option A** — It's contained in the `dataSearch` function, matches PostgreSQL behavior, and doesn't require client-side changes.

## Files to Change

- `src/routes/dms/dms.route.js` — Fix `dataByIdResponse` falsy check (Bug 1)
- `src/routes/dms/dms.controller.js` — Fix `dataSearch` for SQLite `->>` type comparison (Bug 2)

## Testing

1. Fix Bug 1 and verify `data ->> 'index'` returns `0` (not `null`) for page 7
2. Fix Bug 2 and verify `searchOne` returns a `$ref` for the root page
3. Run existing tests (`npm run test:graph`, `npm run test:workflow`)
4. Add regression test: create a page with `index: 0` (integer) and verify `searchOne` finds it
5. Replay the SQLite request log and verify `searchOne` succeeds

## Resolution

Both fixes applied and verified. Also fixed a second `|| null` on line 55 (format response handler).

Regression test `testSearchOneWithIntegerIndex()` added to `tests/test-graph.js` which:
1. Creates a page with `index: 0` (integer)
2. Verifies `getDataById` returns `0` not `null` (Bug 1)
3. Verifies `searchOne` with `defaultSearch` condition `data ->> 'index' = '0'` finds the page (Bug 2)

All tests pass (`npm test` — sqlite, controller, graph, workflow).
