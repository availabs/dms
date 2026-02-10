# DMS Server Auth

## Objective

Implement authentication and authorization for dms-server, fully compatible with the auth system in the reference `avail-falcor` server (`references/avail-falcor/auth/`). The implementation should:

- Keep the same external APIs (endpoints, request/response shapes, JWT tokens)
- Use ES modules where possible
- Minimize external dependencies (replace `request-promise-native`, `node-cache` with Node builtins)
- Support both PostgreSQL and SQLite (matching dms-server's dual-database pattern)
- Work with the existing auth database schema (already defined in `src/db/sql/auth/`)

## Reference System Summary

The reference (`references/avail-falcor/auth/`) implements:

### Data Model (User → Group → Project)

- **users**: email (PK), password (bcrypt hash), id, created_at
- **groups**: name (PK), meta (JSON), id, created_by, created_at
- **projects**: name (PK), created_by, created_at
- **users_in_groups**: user_email + group_name (PK), created_by
- **groups_in_projects**: project_name + group_name (PK), auth_level (0-10)
- **signup_requests**: user_email + project_name (PK), state (awaiting/pending/accepted/rejected)
- **logins**: audit log of login events
- **messages / messages_new**: in-app messaging
- **user_preferences**: per-user per-project JSON preferences

### Auth Levels

Auth level is per group-per-project (in `groups_in_projects.auth_level`):
- 0: public/no admin
- 1-4: viewing/limited
- 5+: can create groups, send invites
- 10: full admin (force passwords, delete projects)

A user's effective auth level in a project = `MAX(auth_level)` across their groups.

### JWT Flow

1. User POSTs to `/login` with email + password + project
2. Server verifies credentials, checks project access
3. Returns JWT token (6h expiry) + user object (email, id, groups, projects, authLevel)
4. Client sends token in `Authorization` header on subsequent requests
5. JWT middleware (`jwtAuth.js`) validates token, attaches user to `req.availAuthContext`
6. Falcor router receives `user` object for permission checks

### External Dependencies to Replace

| Reference Dependency | Replacement |
|---|---|
| `request-promise-native` | Not needed (was for external auth API calls; we do local DB) |
| `node-cache` | `Map` with TTL sweep or simple object cache |
| `bcryptjs` | Keep (no lighter alternative for bcrypt) |
| `jsonwebtoken` | Keep (standard JWT library) |
| `nodemailer` | Keep but make optional (email features) |
| `lodash.get` | Native optional chaining |

### API Endpoints (reference)

**Auth** (18 endpoints): login, auth (verify token), signup request/verify/accept/reject/delete, signup assign group, email verify, invite/accept, password set/force/update/reset, get requests, create user, init setup

**Users** (8 endpoints): list users, list by group/project, assign/remove from group, delete user, create fake, get preferences

**Groups** (9 endpoints): list groups, list by project, create, create+assign, delete, assign/remove from project, adjust auth level, update meta

**Projects** (3 endpoints): list, create, delete

**Messages** (4 endpoints): get, post, view, delete

**Preferences** (2 endpoints): get, update

**Stats** (1 endpoint): get logins

## Current State (dms-server)

- Auth is **disabled**: `const user = null` in `src/index.js:52`
- Comment placeholder: `//const { user = null } = req.availAuthContext || {};`
- Auth SQL schemas exist for both PostgreSQL (`src/db/sql/auth/auth_tables.sql`) and SQLite (`src/db/sql/auth/auth_tables.sqlite.sql`)
- Both schemas include seed data (admin user, AVAIL group, avail_auth project)
- Database adapter layer supports both PostgreSQL and SQLite with cross-DB query utilities
- `created_by` / `updated_by` fields exist on `data_items` but are populated with `null`

## Architecture Decisions

### File Structure

```
src/
├── auth/
│   ├── index.js              # Route registration (Express endpoints)
│   ├── jwt.js                # JWT middleware (validate token, attach user)
│   ├── routes/
│   │   ├── auth.routes.js    # Auth endpoints (login, signup, password, etc.)
│   │   ├── user.routes.js    # User management endpoints
│   │   ├── group.routes.js   # Group management endpoints
│   │   ├── project.routes.js # Project management endpoints
│   │   ├── message.routes.js # Messaging endpoints
│   │   └── preferences.routes.js # Preferences endpoints
│   ├── handlers/
│   │   ├── auth.js           # Auth business logic
│   │   ├── user.js           # User business logic
│   │   ├── group.js          # Group business logic
│   │   ├── project.js        # Project business logic
│   │   ├── message.js        # Message business logic
│   │   └── preferences.js    # Preferences business logic
│   └── utils/
│       ├── crypto.js         # Password hashing, JWT sign/verify, token cache
│       ├── queries.js        # Auth database queries (cross-DB compatible)
│       └── email.js          # Email sending (optional, nodemailer)
```

### Key Design Choices

1. **Handlers take `(db, ...)` instead of importing a global**: each handler function receives the database adapter, making it testable and consistent with dms-server patterns
2. **Cross-DB queries**: use `query-utils.js` helpers (jsonExtract, currentTimestamp, etc.) for PostgreSQL/SQLite compatibility
3. **Token cache**: simple `Map` with periodic cleanup (replace `node-cache`)
4. **No Slack integration**: omit `slacker.js` (can be added later if needed)
5. **Email is optional**: handlers work without email configured; email functions are no-ops if not configured
6. **CommonJS**: match existing dms-server style (`require`/`module.exports`) — the server doesn't use ES modules

## Implementation

### Phase 0: Core crypto + JWT middleware — DONE

- [x] Create `src/auth/utils/crypto.js` — bcrypt hash/compare, JWT sign/verify/decode, password generator, JWT_SECRET from env
- [x] Create `src/auth/jwt.js` — Express middleware: extract token from Authorization header, verify + DB lookup for user/groups/authLevel, cache valid tokens (Map + 5min TTL with periodic cleanup), set `req.availAuthContext = { user }`, skip OPTIONS, graceful fallback to `{ user: null }`
- [x] Create `src/db/configs/auth-sqlite.config.json` — SQLite auth DB config (role: "auth")
- [x] Wire JWT middleware into `src/index.js` (after CORS, before `/graph`)
- [x] Uncomment `req.availAuthContext` in `/graph` handler, pass `user` to Falcor routes
- [x] Install `bcryptjs` + `jsonwebtoken` dependencies
- [x] Verified: server starts, all existing tests pass, unauthenticated requests get user=null, valid tokens return full user object (email, id, authLevel, groups, meta, project, authed), token caching works

### Phase 1: Auth database queries — DONE

- [x] Create `src/auth/utils/queries.js` — 40 query functions taking `(db, params)`:
  - Users: `getUserByEmail`, `createUser`, `deleteUser`, `updateUserPassword`, `getUsers`
  - User Groups: `getUserGroups`, `getUserAuthLevel`, `hasProjectAccess`, `getUsersByGroup`, `getUsersByProject`, `assignUserToGroup`, `removeUserFromGroup`
  - Groups: `getGroups`, `getGroupsForProject`, `createGroup`, `deleteGroup`, `updateGroupMeta`, `assignGroupToProject`, `removeGroupFromProject`, `adjustAuthLevel`
  - Projects: `getProjects`, `createProject`, `deleteProject`
  - Signup: `createSignupRequest`, `updateSignupRequest`, `getSignupRequests`, `getAllSignupRequests`, `deleteSignupRequest`, `getSignupRequestByEmail`, `getPendingSignupCount`
  - Logins: `logLogin`, `getLogins`
  - Messages: `getMessages`, `sendMessage`, `viewMessages`, `deleteMessages`
  - Preferences: `getPreferences`, `updatePreferences`
  - Utilities: `getProjectCount`, `isPublicGroup`
- [x] All queries use `$N` parameter style (SQLite adapter auto-converts)
- [x] Refactored `jwt.js` to import from `queries.js` instead of inline SQL
- [x] All existing tests pass

### Phase 2: Auth handlers (core auth) — DONE

- [x] Create `src/auth/handlers/auth.js` — 19 handler functions + 2 helpers:
  - `login`, `auth`, `signupRequest`, `signupRequestVerified`, `signupAccept`, `signupReject`
  - `sendInvite`, `acceptInvite`, `passwordSet`, `passwordForce`, `passwordUpdate`, `passwordReset`
  - `createUser`, `initSetup`, `getRequests`, `getRequestsForProject`, `deleteSignup`, `verifyEmail`, `signupAssignGroup`
  - Helpers: `verifyAndGetUserData`, `buildUserObject` (exported for use by other handlers)
- [x] All handlers validate auth level before privileged operations (auth ≥ 5 for signup management, auth ≥ 10 for createUser/passwordForce)
- [x] Transactional operations use db.beginTransaction/commitTransaction/rollbackTransaction
- [x] Email sending deferred to Phase 5 — handlers include placeholder comments
- [x] Verified: login, auth, initSetup, passwordUpdate, signupRequest, signupAccept, authority checks all work correctly
- [x] All existing tests pass

### Phase 3: Entity handlers (users, groups, projects) — DONE

- [x] Create `src/auth/handlers/user.js` — 8 handlers:
  - `getUsers` (authority-filtered: only see users with ≤ your auth level per project)
  - `getUsersByGroup`, `getUsersByProject` (auth ≥ 10 in project)
  - `assignToGroup`, `removeFromGroup` (authority check per group's projects)
  - `deleteUser` (authority check across all user's projects)
  - `createFake` (avail_auth auth 10), `getUsersPreferences`
- [x] Create `src/auth/handlers/group.js` — 9 handlers:
  - `getGroups` (authority-filtered), `groupsForProject` (filtered by project auth)
  - `createGroup` (avail_auth auth ≥ 5), `createAndAssign` (project auth ≥ 5 and ≥ requested level)
  - `deleteGroup` (cascading: removes from projects with authority, fully deletes if no projects remain)
  - `assignToProject`, `removeFromProject`, `adjustAuthLevel` (project auth ≥ 5 and ≥ target level)
  - `updateGroup` (avail_auth auth ≥ 5, merges meta)
- [x] Create `src/auth/handlers/project.js` — 3 handlers:
  - `getProjects` (auth 10 sees all, auth ≥ 1 sees own), `createProject` (auth 10, auto-assigns AVAIL group), `deleteProject` (auth 10)
- [x] All authority checks verified: low-auth users correctly rejected for create/delete/manage operations
- [x] All existing tests pass

### Phase 4: Messages, preferences, stats handlers — DONE

- [x] Create `src/auth/handlers/message.js` — 4 handlers:
  - `getMessages` (user's messages, filtered by project, excludes soft-deleted)
  - `postMessage` (supports type: user/users/group/project/all, authority checks for group/project/all)
  - `viewMessages` (marks as viewed, only for messages sent to authenticated user)
  - `deleteMessages` (soft-delete, only for messages sent to authenticated user)
- [x] Create `src/auth/handlers/preferences.js` — 2 handlers:
  - `getPreferences` (returns parsed JSON object, null if none)
  - `updatePreferences` (upsert with merge — new keys added to existing preferences)
- [x] Verified: send to user/group/all, view, soft-delete, preferences insert/merge/get
- [x] Authority checks: sendToAll requires AVAIL group, sendToGroup requires >= group auth level
- [x] All existing tests pass

### Phase 5: Express routes + registration — DONE

- [x] Create route files in `src/auth/routes/` — each exports array of `{ route, method, handler }`:
  - `auth.routes.js` — 19 auth endpoints (all POST) — includes `/init/setup`
  - `user.routes.js` — 8 user endpoints
  - `group.routes.js` — 9 group endpoints
  - `project.routes.js` — 3 project endpoints
  - `message.routes.js` — 4 message endpoints
  - `preferences.routes.js` — 2 preferences endpoints
- [x] Create `src/auth/index.js` — `registerAuthRoutes(app, db, basePath)`:
  - Loads all route files (45 total routes)
  - Wraps each handler to inject `db` and extract `req.body`
  - Registers routes with Express app at `basePath` prefix
- [x] Wire into `src/index.js`:
  - Import and call `registerAuthRoutes(app, getDb(authDbEnv))`
  - Auth routes registered BEFORE JWT middleware (login/signup don't need auth)
  - JWT middleware runs after auth routes, before `/graph`
- [x] Create `src/auth/utils/email.js` — optional email sending:
  - `sendEmail(to, subject, text, html)` — uses nodemailer if configured, no-op otherwise
  - `htmlTemplate(body1, body2, href, click)` — email HTML templates
  - Config from environment variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE)
- [x] HTTP smoke tests pass: 20/20 (init setup, login, auth verify, groups, users, preferences, messages, password update)

### Phase 6: Auth database config + integration — DONE

- [x] Create auth database config(s) in `src/db/configs/`:
  - `auth-sqlite.config.json` — SQLite auth DB (existed from Phase 0)
  - `auth-postgres.example.config.json` — PostgreSQL auth DB example template
- [x] Ensure auth schema initializes correctly for both database types
  - `initAuth()` in `db/index.js` runs for role "auth" databases, creates tables from `sql/auth/` scripts
- [x] Wire auth database into route registration (resolve auth DB from config)
  - `DMS_AUTH_DB_ENV` env var (default: `auth-sqlite`) → `getDb(authDbEnv)` → passed to `registerAuthRoutes()`
- [x] Populate `created_by` / `updated_by` on `data_items` writes when user is authenticated
  - Full pipeline verified: JWT middleware → `req.availAuthContext.user` → Falcor router `this.user` → controller `get(user, "id", null)`
  - `createData`: sets both `created_by` and `updated_by` to user.id
  - `setDataById`: sets `updated_by` to user.id, preserves `created_by`
  - `setTypeById`, `setDataByIdOld`: set `updated_by` to user.id
  - Unauthenticated writes: `created_by`/`updated_by` remain null (backward compatible)
  - Integration test (`test-auth-integration.js`): 9/9 pass
- [x] `npm run start` — server starts with auth enabled (45 routes registered)
- [x] `npm test` — all existing tests pass (sqlite, controller, graph, workflow)

### Phase 7: Tests — DONE

- [x] Create `tests/test-auth.js` — 103 integration tests across 14 sections:
  1. Init setup (idempotent project + admin creation)
  2. Login (valid, bad password, unknown email, no project access, missing fields, case-insensitive)
  3. Token verification (valid, invalid garbage token, project switching)
  4. Signup flow (request → auto-verify when email disabled → admin accepts → password reset → login)
  5. Invite flow (send invite → accept with password → login, duplicate invite rejected)
  6. Password operations (update own, wrong current fails, set from token, reset generates new, force requires avail_auth)
  7. Group CRUD (list, by project, create+assign, adjust auth level, remove from project, delete, auth > 10 rejected)
  8. User CRUD (list, by project, by group, assign to group, remove from group, delete, deleted user can't login)
  9. Project CRUD (list/create/delete all require avail_auth auth)
  10. Authority checks (low-auth can't: create group, assign to high-auth group, delete admin, send invite, accept signups)
  11. Messages (send to user, send to self, get, view, soft-delete, unknown type rejected)
  12. Preferences (null initial, set, get, merge preserves existing, per-project isolation)
  13. Signup edge cases (reject + delete flow, signupAssignGroup auto-creates user)
  14. Falcor created_by/updated_by (no-auth=null, auth=user.id, edit preserves created_by)
- [x] Add `test:auth` script to `package.json` — `npm run test:auth`
- [x] All tests pass on SQLite (103/103)
- [x] Bug fix: route error handler now handles string rejections (`e.message || String(e)`)
- [x] Removed superseded smoke test files (test-auth-http.js, test-auth-integration.js)

## Files

| File | Action |
|------|--------|
| `src/auth/utils/crypto.js` | Create — bcrypt, JWT, password generator |
| `src/auth/utils/queries.js` | Create — all auth SQL queries |
| `src/auth/utils/email.js` | Create — optional email sending |
| `src/auth/jwt.js` | Create — JWT middleware |
| `src/auth/handlers/auth.js` | Create — core auth handlers |
| `src/auth/handlers/user.js` | Create — user management handlers |
| `src/auth/handlers/group.js` | Create — group management handlers |
| `src/auth/handlers/project.js` | Create — project management handlers |
| `src/auth/handlers/message.js` | Create — messaging handlers |
| `src/auth/handlers/preferences.js` | Create — preferences handlers |
| `src/auth/routes/auth.routes.js` | Create — auth endpoint definitions |
| `src/auth/routes/user.routes.js` | Create — user endpoint definitions |
| `src/auth/routes/group.routes.js` | Create — group endpoint definitions |
| `src/auth/routes/project.routes.js` | Create — project endpoint definitions |
| `src/auth/routes/message.routes.js` | Create — message endpoint definitions |
| `src/auth/routes/preferences.routes.js` | Create — preferences endpoint definitions |
| `src/auth/index.js` | Create — route registration |
| `src/index.js` | Modify — add JWT middleware, auth routes, uncomment user context |
| `src/routes/dms/dms.controller.js` | Modify — populate created_by/updated_by with user |
| `tests/test-auth.js` | Create — auth integration tests |
| `package.json` | Modify — add bcryptjs, jsonwebtoken deps; add test:auth script |

## Verification

- [ ] Server starts with auth enabled
- [ ] Unauthenticated requests work (user=null, read-only operations)
- [ ] Login returns valid JWT token
- [ ] Token in Authorization header is validated and user attached to requests
- [ ] Falcor routes receive authenticated user object
- [ ] Init setup creates project + admin user
- [ ] Full signup flow works (request → verify email → set password)
- [ ] Full invite flow works (admin invites → user accepts)
- [ ] Password operations work (set, update, reset, force)
- [ ] User/group/project CRUD with authority checks
- [ ] Auth level hierarchy enforced (can't manage higher-level entities)
- [ ] Messages and preferences work
- [ ] `created_by`/`updated_by` populated on data_items writes
- [ ] Existing tests pass (backward compatible)
- [ ] Auth tests pass on SQLite
- [ ] Auth tests pass on PostgreSQL
