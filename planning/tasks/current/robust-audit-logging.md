# Robust Audit Logging

## Objective

Replace the thin `created_by` user-id field in `change_log` with full request context — IP address, user agent (browser/OS/script detection), and auth state — so that every mutation is attributable even when no user is logged in. Add a separate page-visit log table. Motivated by June 28 2026 incident where 9 pages were deleted by an unauthenticated caller with no trace beyond a blank `created_by`.

## Root cause of the gap

- `change_log.created_by` is nullable and only stores a user ID — blank when the request has no JWT.
- The Falcor delete route (`dms.data.delete`) has **no auth guard** — any HTTP client can delete rows without a token.
- The sync push endpoint (`POST /sync/push`) also accepts deletes and only requires auth if `DMS_SYNC_AUTH=1`.
- No IP, user agent, or request metadata is captured anywhere.
- No page-visit log exists.

## Phase 1 — Enrich `change_log` with request context

### Schema change

Add columns to `dms.change_log` (and `change_log` in SQLite mode):

```sql
ALTER TABLE dms.change_log
  ADD COLUMN IF NOT EXISTS ip         TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS auth_state TEXT;   -- 'authenticated' | 'unauthenticated' | 'sync'
```

SQLite: add columns to `change_log.sqlite.sql` init script.

### Server changes

**`src/routes/dms/dms.route.js`**
- Pass `req` (or extracted metadata) into the controller's `deleteData`, `setDataById`, `createData` calls alongside `user`.

**`src/routes/dms/dms.controller.js`**
- Add `reqMeta` param to `appendChangeLog(itemId, app, type, action, data, userId, reqMeta)`.
- Write `reqMeta.ip`, `reqMeta.userAgent`, `reqMeta.authState` to the new columns.

**`src/routes/sync/sync.js`**
- Same enrichment on the `INSERT INTO change_log` in the push handler.

**`src/index.js`**
- Add an IP extraction helper that checks `X-Forwarded-For` → `X-Real-IP` → `req.socket.remoteAddress`.

### What gets captured

| Field | Source | Notes |
|---|---|---|
| `ip` | `X-Forwarded-For` / `req.socket.remoteAddress` | Real IP behind proxies |
| `user_agent` | `User-Agent` header | Browser, curl, Node script, etc. |
| `auth_state` | `req.availAuthContext.user` | `'authenticated'` / `'unauthenticated'` |

From `user_agent` alone you can distinguish:
- Browser (Chrome, Firefox, Safari)
- OS (Windows, macOS, Linux, Android, iOS)
- Script/bot (curl, python-requests, Node fetch, etc.)

No additional parsing library needed — the raw UA string is sufficient for forensics.

## Phase 2 — Page visit log

### New table

```sql
CREATE TABLE IF NOT EXISTS dms.page_visits (
  id          BIGSERIAL PRIMARY KEY,
  app         TEXT        NOT NULL,
  page_id     BIGINT,
  url         TEXT,
  ip          TEXT,
  user_agent  TEXT,
  user_id     INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_visits_app_created ON dms.page_visits (app, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_visits_page_id ON dms.page_visits (page_id);
```

SQLite equivalent in `change_log.sqlite.sql`.

### Server changes

Add a REST endpoint (not Falcor — fire-and-forget from the client):

```
POST /track/visit
Body: { app, pageId, url }
```

- No auth required (visits from public users are valid data).
- Extract IP + User-Agent server-side from the request headers.
- Insert into `dms.page_visits`.
- Returns `204 No Content`.

### Client changes

In `src/dms/packages/dms/src/patterns/page/`, fire a visit on page navigation (inside the route loader or a `useEffect` on page ID change):

```js
fetch('/track/visit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ app, pageId: item.id, url: window.location.pathname })
})
```

Keep it non-blocking — don't await, don't show errors to users.

## Phase 3 — Auth guard on delete routes

While not strictly "logging", this closes the vector that caused the June 28 incident:

- `dms.data.delete` Falcor route: add `isUserAuthed` check before calling `deleteData`. Return an error path if unauthenticated.
- `POST /sync/push` with `action: 'D'`: require auth unconditionally (not just when `DMS_SYNC_AUTH=1`), or at minimum log a clear warning when deleting without auth.

## Files to change

- `src/db/sql/change_log.sql` — add `ip`, `user_agent`, `auth_state` columns
- `src/db/sql/change_log.sqlite.sql` — same
- `src/db/sql/change_log.sql` — add `page_visits` table
- `src/db/sql/change_log.sqlite.sql` — add `page_visits` table (SQLite)
- `src/routes/dms/dms.controller.js` — enrich `appendChangeLog`
- `src/routes/dms/dms.route.js` — pass req metadata + add delete auth guard
- `src/routes/sync/sync.js` — enrich change_log insert + harden delete auth
- `src/index.js` — IP extraction helper + `/track/visit` route
- `src/dms/packages/dms/src/patterns/page/` — fire visit on navigation

## Status

- Phase 1 ✅ DONE (2026-06-30) — `ip`, `user_agent`, `auth_state` columns added to `change_log` (PG + SQLite). Migration in `initSync` handles existing databases. `appendChangeLog` and all 4 mutation paths (create/edit/type-edit/delete) pass `reqMeta`. `reqMeta` extracted in `src/index.js` from `req.clientIp` + `User-Agent` header, passed through `falcorRoutes` → `TestRouter`.
- Phase 2 ✅ DONE (2026-06-30) — `page_visits` table in `dms.page_visits` (PG + SQLite) with columns: `id, app, page_id, url, action, ip, user_agent, user_id, created_at`. `action` values: `'view'` | `'edit'` | `'denied'`. Migration in `initSync` creates table + `action` column on every startup (idempotent; `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`). `POST /track/visit` endpoint in `src/index.js` (no auth required, accepts `{ app, pageId, url, action }`). Client fires in `view.jsx` and `edit/index.jsx` `useEffect` on `[item?.id, user?.isAuthenticating]`; skips while auth is loading; sends `'denied'` when `item.id === 'no-access'` or auth check fails; URL includes search params (`pathname + search`). Non-blocking fire-and-forget.
- Phase 3 ✅ DONE (2026-06-30) — Auth guard added to `dms.data.delete` Falcor route (throws if `!this.user`). Sync push D action now requires auth unconditionally (returns 401 if unauthenticated). Test harness updated with default mock user so all tests still pass.

## Testing checklist

- [x] Delete route rejects unauthenticated request — `throw new Error('Authentication required to delete items')` in dms.route.js
- [x] Sync push D action rejects unauthenticated request — 401 before transaction in sync.js
- [x] All existing graph/workflow/sync tests pass with updated test harness
- [ ] Unauthenticated DELETE to `/graph` → `change_log` row has `ip`, `user_agent`, `auth_state='unauthenticated'` (manual verify on mitigat-ny-prod after deploy)
- [ ] Authenticated DELETE → `created_by` + `ip` + `user_agent` all populated (manual verify)
- [ ] Sync push delete → same enrichment (manual verify)
- [ ] Page visit fires on navigation, inserts row with correct `page_id`, `ip`, `action` (manual verify)
- [ ] Denied visit (no-access or insufficient perms) records `action='denied'` with null `page_id` where applicable (manual verify)
- [ ] Edit page access records `action='edit'` (manual verify)
