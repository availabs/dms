Page patterns, Pages use permissions to allow or block access. this is done on client side now.
this needs to also happen on server. the issues is, on server,
while requesting pages, which are just rows in the same db as patterns,
we can't see pattern's permissions. the type column in the db may help us derive it. 

look at md files to understand how permissions work. understand how permissions are enforced. device a plan to implement them on server.

note: the same db is used to store everything. patterns, pages, envs, sources, views. 

this server side auth will be extended for sources and views too. 
but for now, it should not affect them. ideally, in dmsSiteManager, 
the length and index route should not return patterns the user isn't authed for. 
same for pages. device a plan, and create md files in planning. update this file if you need to as well.

some files you may be interested in (feel free to explore more. this is not the full list): 
src/dms/packages/dms/src/api/index.js
src/dms/packages/dms-server/src/routes/uda/uda.route.js

---

## Findings (2026-05-25)

### How permissions work

`authPermissions` is a JSON object stored in the `data` column of pattern rows:
```json
{ "groups": { "public": ["view-page"], "admin": ["*"] }, "users": { "42": ["*"] } }
```
Subdomain-aware sites wrap this under a `"*"` key:
```json
{ "*": { "groups": { ... } } }
```

Client-side: `isUserAuthed()` in `packages/dms/src/patterns/page/auth.js` checks the user's groups + per-user permissions against `reqPermissions` (e.g., `['view-page']`).

### How patterns/pages are loaded

**Patterns** are NOT fetched via length/byIndex. They are:
1. Site row (`dms.data[app+siteType].byIndex[0]`) is loaded
2. Site's `data.patterns` contains `[{ ref, id }, ...]` refs
3. `loadDmsFormats` in `processNewData.js` follows each ref via `dms.data[app].byId[id]`

So pattern filtering must happen at the **byId** level.

**Pages** ARE fetched via length/byIndex:
- `dms.data[app+patternInstance|page].options[filter].length`
- `dms.data[app+patternInstance|page].options[filter].byIndex[...]`

Type `my_docs|page` → `getParent('my_docs|page')` = `'my_docs'` → pattern lookup: `type LIKE '%|my_docs:pattern'`

### User context on server

`this.user` is available in ALL Falcor route handlers (set in `routes/index.js` constructor from `req.availAuthContext.user` set by `createJwtMiddleware`). Previously only CALL routes used it; GET routes ignored it.

### Replay protection

Added `X-Requested-With` header check before `/graph` in `src/index.js`. The Falcor client always sends this; raw curl/Postman won't by default.

### Implementation

See task file: `planning/tasks/current/server-side-auth.md`

Key files changed:
- `src/routes/dms/auth.js` (new) — `isUserAuthed`, `resolveAuthPermissions`
- `src/routes/dms/dms.controller.js` — `getPatternAuthPermissions(app, patternParent)`
- `src/routes/dms/dms.route.js` — auth gates on byId + all length/byIndex routes
- `src/index.js` — CSRF X-Requested-With guard
