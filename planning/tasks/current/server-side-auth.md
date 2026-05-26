# Server-Side Auth

## Objective

Enforce pattern and page-level `authPermissions` on the server so that unauthorized users can't read restricted content, even by replaying network calls directly against `/graph`.

## Scope

**Phase 1 (this task):** Pattern-level and page-listing auth in `dms-server`.  
**Phase 2:** Per-page `authPermissions` overrides (a page more restricted than its pattern).  
**Phase 3:** Sources and views — same mechanism extended to those row kinds.

## Current State

- Permissions exist only on the client: `isUserAuthed` in `patterns/page/auth.js` hides routes and pages in the React router, but the server returns all data regardless.
- Anyone who copies a `POST /graph` request from DevTools can fetch any content without auth.

## Root Cause

The Falcor routes (`dms.route.js`) never check `this.user` in GET handlers. Only CALL routes (edit, delete, create) use user context.

## Phase 1 Changes

### New file: `src/routes/dms/auth.js`
- `isUserAuthed({ user, reqPermissions, authPermissions })` — port of client logic
- `resolveAuthPermissions(rawAuth)` — handles flat and subdomain-aware `{ "*": {...} }` formats

### Controller: `dms.controller.js`
Added `getPatternAuthPermissions(app, patternParent)`:
- Queries: `WHERE app = $1 AND type LIKE '%|' || $2 || ':pattern'`
- Returns resolved authPermissions for the pattern, or `null` if not found

### Route: `dms.route.js`
**Pattern filtering (`byId`):**
- `dataByIdResponse` gains a `user` param
- If the fetched row has `type` and `getKind(type) === 'pattern'`:
  - Check `isUserAuthed({ user, reqPermissions: ['view-page'], authPermissions: resolveAuthPermissions(row.data?.authPermissions) })`
  - If not authed → return `null` for all requested attributes of that ID
- Note: `type` is only available when `loadDmsFormats` requested it (which it always does for site pattern refs)

**Page listing filtering (length + byIndex):**
For `appKey` with `getKind(type) === 'page'`:
1. `getParent(type)` → pattern instance name
2. `controller.getPatternAuthPermissions(app, patternParent)`
3. If not authed → return `0` / `null` entries

Routes covered:
- `dms.data[appKeys].length`
- `dms.data[appKeys].byIndex[...]`
- `dms.data[appKeys].options[options].length`
- `dms.data[appKeys].options[options].byIndex[...][...]`
- `dms.data[appKeys].opts[options].byIndex[...]`

### CSRF guard: `src/index.js`
Middleware before `/graph` that rejects requests without `X-Requested-With` header → 403.  
The Falcor client always sends this header. Raw curl/Postman replays won't.

## Files Changed

| File | Change |
|------|--------|
| `src/routes/dms/auth.js` | **NEW** |
| `src/routes/dms/dms.controller.js` | Added `getPatternAuthPermissions`, imported `resolveAuthPermissions` |
| `src/routes/dms/dms.route.js` | Auth gates on byId + all length/byIndex routes for page types |
| `src/index.js` | CSRF X-Requested-With guard |

## Testing

1. Create a pattern with `authPermissions` restricting `view-page` to a group
2. Unauthenticated: `byId` for that pattern returns null attributes; page `length` returns 0
3. User in the allowed group: normal data returns
4. `POST /graph` without `X-Requested-With` → 403
5. `npm test` in `packages/dms-server` — all existing tests pass

## Phase 2 Notes

Per-page `authPermissions` overrides require filtering individual page rows in `filteredDataByIndex` / `dataByIndex`. Approach:
- After fetching rows for a page type, for each row parse `data.authPermissions`
- Merge with pattern-level auth using same logic as client (`siteConfig.jsx` lines 138–148)
- Filter out rows where user fails the check

## Progress

- [x] `auth.js` created
- [x] `getPatternAuthPermissions` added to controller
- [x] Route auth gates (byId patterns + page length/byIndex)
- [x] CSRF guard
- [ ] Phase 2: per-page auth overrides
- [ ] Phase 3: sources + views
