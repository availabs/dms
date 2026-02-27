# Fix `/groups/byproject` Response Shape in dms-server

## Objective

Align the dms-server `/groups/byproject` response with the shape the auth pattern client expects. Currently the handler returns a plain array, but the client expects `{ groups: [...] }`.

## Discrepancy

### Client expects (auth pattern `api.js`)

The `getGroups` function in `getAPI()` (line 101) accesses `groups?.groups`:
```javascript
getGroups: async ({ user = {} }) => {
  const groups = await callAuthServer(`${AUTH_HOST}/groups/byproject`, { ... })
  if(!(groups?.groups || []).some(g => g.name === 'public')){
    groups.groups = [{name: 'public'}, ...groups.groups];
  }
  return groups;
}
```

And `authGroups.jsx` (line 24) accesses `res.groups`:
```javascript
setGroups(res.groups || [])
```

**Expected shape:**
```json
{
  "groups": [
    { "name": "public" },
    { "name": "App Admin", "meta": null, "created_at": "...", "created_by": "...", "num_members": "1", "projects": [...] },
    { "name": "App Public", ... }
  ]
}
```

### dms-server returns

`auth/handlers/group.js` `groupsForProject()` returns a plain array:
```json
[
  { "name": "App Admin", "meta": null, "created_at": "2026-02-10 19:53:11", "created_by": "init_setup_script", "num_members": 1, "projects": [...] },
  { "name": "App Public", ... }
]
```

### Specific differences

| Aspect | Auth server (reference) | dms-server (current) | Fix needed |
|--------|------------------------|---------------------|------------|
| Top-level wrapper | `{ "groups": [...] }` | Plain array `[...]` | Wrap in `{ groups }` |
| "public" group | Included as `{ "name": "public" }` | Not included | Add synthetic public entry |
| `num_members` type | String (`"1"`) | Number (`1`) | Minor — client handles both, but match for consistency |
| `created_at` format | ISO 8601 (`"2026-01-26T22:01:59.647Z"`) | Space-separated (`"2026-02-10 19:53:11"`) | Minor — display-only field |

## Files

| File | Change |
|------|--------|
| `src/auth/handlers/group.js` | Wrap `groupsForProject` return in `{ groups: [...] }`, add public group |
| `tests/test-auth.js` | Update assertions (response is object with `.groups`, not plain array) |

## Implementation

### Phase 1: Fix response shape — DONE

- [x] In `groupsForProject()` (`handlers/group.js` line 103), wrapped return:
  ```javascript
  return { groups: [{ name: 'public' }, ...visible] };
  ```
- [x] Updated test assertions (`test-auth.js` lines 320-323):
  - `Array.isArray(groupsByProj.groups)` — checks wrapper
  - `groupsByProj.groups.some(g => g.name === 'public')` — checks public group
  - `groupsByProj.groups.filter(g => g.projects).every(...)` — skips public (no projects) for filter check
- [x] `npm run test:auth` — 104 tests pass (was 103, +1 for public group assertion)

### Phase 2: Audit other group endpoints — DONE

Auth middleware (`src/auth/index.js` line 36) wraps all handler returns:
```javascript
res.json(typeof result === 'string' ? { message: result } : result);
```
So handlers returning plain strings (e.g., `deleteGroup`, `adjustAuthLevel`) automatically become `{ message: "..." }`. Errors are caught and wrapped as `{ error: "..." }`.

Endpoint-by-endpoint audit:

| Endpoint | Handler returns | After middleware | Client expects | Status |
|----------|----------------|-----------------|----------------|--------|
| `/groups/byproject` | `{ groups: [...] }` | `{ groups: [...] }` | `res.groups` | FIXED (Phase 1) |
| `/groups` | `[...]` array | `[...]` array | **Never called by client** | N/A |
| `/group/create` | `{ message }` | `{ message }` | `res.error` check | OK |
| `/group/create/project/assign` | `{ message }` | `{ message }` | `res.error` check | OK |
| `/group/delete` | `string` | `{ message }` | `deleteGroup.message` | OK (middleware wraps) |
| `/group/project/assign` | `{ message }` | `{ message }` | `res.error` check | OK |
| `/group/project/remove` | `{ message }` | `{ message }` | `removeFromProj.message` | OK |
| `/group/project/adjust` | `string` | `{ message }` | `adjust.message` | OK (middleware wraps) |
| `/group/meta/update` | `{...meta}` | `{...meta}` | `metaUpdate.error` check | OK |

Client files checked:
- `api.js` — `getGroups` and `getUsers` both call `/groups/byproject` and `/users/byProject` (never `/groups`)
- `utils.js` — duplicate `getGroups` also calls `/groups/byproject`
- `authGroups.jsx` — `setGroups(res.groups || [])` — only uses `/groups/byproject`
- `authUsers.jsx` — calls `/groups/byproject`, `/user/group/assign`, `/user/group/remove`
- `profile.jsx` — calls `/groups/byproject`, accesses `res.groups`

**Conclusion:** No remaining mismatches. The only endpoint with a shape problem was `/groups/byproject`, fixed in Phase 1. The `/groups` endpoint returns a plain array but is never called by the client.

## Testing

- [x] `npm run test:auth` passes (104/104)
- [ ] Manual: auth pattern group management page loads and shows groups correctly
- [ ] Manual: "public" group appears in the list
- [ ] Manual: group member counts display correctly
