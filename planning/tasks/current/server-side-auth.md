# Server-Side Auth

## Objective

Enforce pattern and page-level `authPermissions` on the server so that unauthorized users can't read restricted content, even by replaying network calls directly against `/graph`.

## Scope

**Phase 1 (done):** Pattern-level and page-listing auth in `dms-server`.  
**Phase 2 (next):** Per-page `authPermissions` in listing routes (length/byIndex filter individual rows).  
**Phase 3:** Sources and views — same mechanism extended to those row kinds.

## Phase 1 — COMPLETE (2026-05-25/26)

### Key implementation

**`src/routes/dms/auth.js`** (new)
- `isUserAuthed({ user, reqPermissions, authPermissions })` — server mirror of client logic
- `resolveAuthPermissions(rawAuth)` — handles flat + subdomain-aware `{ "*": {...} }` format
- Critical: unauthenticated users always get `'public'` in effective groups (mirrors `defaultUserState`)

**`dms.controller.js`** — `getPatternAuthPermissions(app, patternParent)`
- SQL: `WHERE app = $1 AND type LIKE '%|' || $2 || ':pattern' ORDER BY id DESC LIMIT 1`
- Returns `null` (unrestricted) for `pattern_type === 'auth'` patterns — login page must always load
- Returns resolved `authPermissions` object or `null` if pattern row not found

**`dms.route.js`** — `dataByIdResponse(rows, ids, atts, app, user)`
- `user = undefined` (default) → skip auth check (CALL routes: edit, create, type.edit)
- `user = null` → unauthenticated GET; `user = {...}` → authenticated GET
- Now `async` (uses `for...of`); all CALL routes converted to `async/await`
- `kind === 'pattern'`: checks `row.data?.authPermissions`; skips if `pattern_type === 'auth'`
- `kind === 'page'`: awaits `getPatternAuthPermissions`, merges with `row.data?.authPermissions`:
  ```js
  mergedAuth = {
    groups: { ...patternAuth?.groups, ...pageAuth?.groups },
    users:  { ...patternAuth?.users,  ...pageAuth?.users  },
  }
  ```
  Page-level entries override pattern-level per key.

**Page listing routes** (length + byIndex + options.length + options.byIndex + opts.byIndex)
- For `getKind(type) === 'page'`: calls `getPatternAuthPermissions(app, getParent(type))`
- Returns 0 / null if not authed
- NOTE: these routes only check pattern-level auth (Phase 2 will add per-row filtering)

**`src/index.js`** — CSRF guard (`X-Requested-With` header check before `/graph`) — currently commented out

### Auth pattern exemption
Auth patterns (`data.pattern_type === 'auth'`) are always publicly accessible:
- In `dataByIdResponse`: skipped by `pattern_type !== 'auth'` guard
- In `getPatternAuthPermissions`: returns `null` when `data.pattern_type === 'auth'`
- `null || {}` → empty authPermissions → `isUserAuthed` returns `true` (allow all)

---

## Phase 2 — Per-page auth in listing routes — COMPLETE (2026-05-26)

Per-row auth filtering was implemented via a different approach than originally planned — `options.byIndex` now fetches `data` for page-type keys via `fetchAttributes` and checks each row's `authPermissions` merged with the pattern's. The `dataByIdResponse` function was also extended to handle pages (not just patterns).

### What was done

**`dms.route.js` — `options.byIndex` route:**
- `hasPageKey` flag: if any key is a page type, `fetchAttributes` always includes `'data'` so `row.data` is available for auth checks
- `isPage` flag per key loop
- `patternAuth` fetched once per key; per-row merge check: `{ groups: {...patternAuth.groups, ...pageAuth.groups}, ... }`
- Response loops use `attributes` (not `fetchAttributes`) so `data` is stripped if not originally requested

**`dms.route.js` — `dataByIdResponse`:**
- Extended to handle `kind === 'page'`: awaits `getPatternAuthPermissions`, merges pattern + page auth, blocks if not authed

**Length routes:** Still check pattern-level only (Option B — raw count). Acceptable given restricted-page scenarios are typically small.

**Gap remaining:** `opts.byIndex` (returns `$ref`s → `byId`) does not do per-row filtering — `byId` handles page auth inline so those are covered. `length` routes return raw counts.

### UDA `clearData` side-task (2026-05-26)

`ClearDataBtn` in `version.jsx` previously used `options.byIndex` via `apiLoad` to fetch IDs then delete individually. This was replaced with a proper UDA CALL route:
- `uda.controller.js`: `clearViewData(env, view_id)` — TRUNCATE/DELETE split tables (valid + invalid-entry)
- `uda.route.js`: `uda.viewsById.clearData` CALL route
- `version.jsx`: `ClearDataBtn` now uses `falcor.call(['uda', 'viewsById', 'clearData'], [env, view_id])`

---

## Phase 3 — Sources and views

Same pattern as pages:
- Sources: look up parent dmsEnv's authPermissions (or pattern's, depending on config)
- Views: look up parent source's authPermissions
- Gate `uda` routes (length/byIndex) the same way dms page routes are gated

Deferred until Phase 2 is verified in production.

---

## Todo checkbox (planning/todo.md)

- [ ] Server-side auth Phase 2: per-page auth in listing routes
- [ ] Server-side auth Phase 3: sources + views
- [ ] Subdomain-aware `resolveAuthPermissions` — pass `Host` header subdomain into route context

## Files

| File | Role |
|------|------|
| `src/routes/dms/auth.js` | `isUserAuthed`, `resolveAuthPermissions` |
| `src/routes/dms/dms.controller.js` | `getPatternAuthPermissions` |
| `src/routes/dms/dms.route.js` | Auth gates — byId + listing routes |
| `src/index.js` | CSRF guard (commented out) |
