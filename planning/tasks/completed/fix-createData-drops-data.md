# Bug: createData ignores data argument, causing sections to have empty data

**Status:** Completed (2026-01-28)

## Problem

When creating sections via the Falcor `dms.data.create` route, the section data (element, trackingId, group, is_draft, parent) is being dropped. This causes draft_sections to appear empty and "disappear" from the UI.

## Root Cause

In a recent refactor of `dms.controller.js`, the `createData` function was changed to always use an empty object `{}` for the data column, ignoring any data passed by the client.

**Current (broken) code at line 536-548:**
```js
createData: (args, user) => {
  const [app, type] = args;  // <-- args[2] (data) is ignored!
  const sql = `
    INSERT INTO data_items(app, type, data, created_by, updated_by)
    VALUES ($1, $2, $3, $4, $4)
    RETURNING ...
  `
  const userId = get(user, "id", null);
  const values = [app, type, {}, userId];  // <-- Always empty {}!
  return dms_db.promise(sql, values);
},
```

**Original (working) code:**
```js
createData: (args, user) => {
  const sql = `...`
  args.push(get(user, "id", null));
  return dms_db.promise(sql, args);  // args = [app, type, data, userId]
},
```

The original code passed `args` directly to the query. When the client calls:
```
dms.data.create("app", "type", {element: {...}, trackingId: "...", is_draft: true, ...})
```

The `args` array is `[app, type, dataObject]`, and the original code correctly inserted that data.

## Evidence from Logs

### SQLite (broken) - seq 14 create section:
- **Request args:** `["avail-sqlite4", "...cms-section", {"element":{...}, "trackingId":"...", "group":"default", "is_draft":true, ...}]`
- **Response:** `"data":{"$type":"atom","value":{}}` - **DATA IS EMPTY!**

### SQLite - seq 9 query sections:
- `"160":{"data":{"$type":"atom","value":{}}}` - **EMPTY**
- `"161":{"data":{"$type":"atom","value":{}}}` - **EMPTY**

### PostgreSQL (working) - seq 20 query draft section:
- `"1697221":{"data":{"$type":"atom","value":{"group":"default","element":{...},"is_draft":true,...}}}` - **HAS DATA**

The PostgreSQL log was captured against a production database that had data created BEFORE the bug was introduced.

## Fix

Change `createData` to preserve the data argument:

```js
createData: (args, user) => {
  const [app, type, data = {}] = args;  // Preserve data, default to {} if not provided
  const sql = `
    INSERT INTO ${tableName('data_items')}(app, type, data, created_by, updated_by)
    VALUES ($1, $2, $3, $4, $4)
    RETURNING id, app, type, data,
      ${typeCast('created_at', 'TEXT', dbType)}, created_by,
      ${typeCast('updated_at', 'TEXT', dbType)}, updated_by;
  `
  const userId = get(user, "id", null);
  const values = [app, type, data, userId];
  return dms_db.promise(sql, values);
},
```

## Testing

1. Write a regression test that creates a section with data and verifies the data is returned
2. Run existing tests to ensure nothing else breaks
3. Test the full workflow: create section with element data, verify it persists

## Files Changed

- `src/routes/dms/dms.controller.js` - Fixed createData function (line 536-549)
- `tests/test-graph.js` - Added regression test `testCreateWithData()`

## Resolution

The fix was applied as documented above. Added regression test that:
1. Creates a section with data (title, trackingId, element with element-type and element-data)
2. Retrieves the section and verifies all data fields were persisted
3. Cleans up the test section

All tests pass including the new regression test.
