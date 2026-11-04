# Access log: the guards' refusals, counted, for `${app} Admin`

**Initiatives:** [dms_permissions_move](../../../../../planning/initiatives/dms_permissions_move.md) (primary), [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** done (later items optional) · **Created by:** ssangdod@albany.edu · **Edited by:** —

From the hub [auth-levels-to-permissions.md](./auth-levels-to-permissions.md), "Next work (2026-10-30)" item 2
("Access log admin page (option 1)").

## Objective

The guards (`DMS_SOURCE_AUTH_MODE`, `DMS_DATA_AUTH_MODE`, `DMS_READ_AUTH_MODE`) report what they would refuse
(`log`) only as `console.warn` lines, which on mercury means container logs. Before any guard flips to `enforce`,
a site's admins need to see who would lose what. Owner chose (2026-10-27) **option 1, a server-owned table**
over a DMS internal source (which would pass through the guards it reports on, land in change_log, sync to every
client, and need its grants locked down per site).

## Design (option 1, as proposed 2026-10-27)

- **Table** `access_log` (`dms.access_log` on Postgres), in the DMS db next to `change_log`: `app`, `guard`,
  `outcome` (`would-deny` | `refused`), `kind`, `target`, `perms`, `principal` (user id or `anon`), `user_id`,
  `user_email`, `groups`, `reason`, `count`, `first_seen`, `last_seen`; unique on
  (app, guard, outcome, kind, target, perms, principal).
- **Writes**: one recorder, `dms-server/src/access-log/index.js` `record()`, called where each guard already
  logs. It counts in memory and upserts once a minute, one row per distinct refusal (a route refused 10,000 times
  is one row with a count). Plain SQL on the DMS adapter: never through dms.data, never in change_log or sync.
- **Under `enforce`** the same calls record `refused`, so the page keeps working after the switch.
- **Reads**: `GET /dms-admin/:app/access-log`, `${app} Admin` and `AVAIL` only.
- **Retention**: rows unseen for `DMS_ACCESS_LOG_DAYS` (default 90) are deleted, at most daily. (The proposal said
  "as change_log's compaction"; rows are per distinct refusal, so an age cut is enough.)

## Progress

**2026-11-02: server built, mockup drawn; client page waits for the owner's mockup confirmation.**
- [x] Table: `sql/dms/change_log.sql` / `.sqlite.sql` (fresh dbs) and `migrate_dms_core.sql` / `.sqlite.sql`
      (existing ones), as `page_visits`. `test-schema-drift` 23/23. (Also fixed: `change_log.sqlite.sql`'s last
      statement had no `;`, which broke appending.)
- [x] Recorder `src/access-log/index.js`: `record`, `flush`, `query`, `appOf`, `registerAccessLogRoutes`.
      **Design note (safety):** it writes only after the server registers the route (`index.js`, after the JWT
      middleware) or a test hands it a db. Scripts and tests that load a guard only count in memory: the local
      fallback config `dms-sqlite` points at prod dms3, and `getDb` would run its init and migrations there.
      `DMS_ACCESS_LOG=off` turns recording off.
- [x] Call sites (guard → `guard` value):
  - `routes/uda/sourceAuth.js` `logWouldDeny` (source, pattern, read, route) → `source`; `enforce` refusals in
    `isUserAuthedForSource`, `isUserAuthedForPattern`, `readerAllowed`, `requireUserOrOpen`. App: the env's
    (`app+instance`), else the client-named pattern's (`accessLog.appOf`). A pattern check with no pattern now
    reads `(no pattern named)`, not `undefined/undefined` (cosmetic note from 10-21).
  - `routes/dms/dataAuth.js` `logWouldDeny` + the `enforce` throw in `assertDataWrite` → `data` (kind
    `<op> <row kind>`, target `<id> <type>`; perms are in the reason).
  - `routes/uda/readAuth.js` `logWouldDeny` + the `enforce` refusals → `read`. Every call counts; only the
    console line keeps its ten-minute dedupe.
  - `dama/upload/auth.js` `requirePatternAction` → `upload`; `file-upload-dms-route.js` owner check → `file`.
  - `auth/utils/permissions.js` `can()` / `levelCounts()` (blank auth row, `DMS_AUTH_ROW_MODE`) → `auth` (added 2026-11-02; mockup guard filter has it).
- [x] Read route `GET /dms-admin/:app/access-log?guard=&outcome=&kind=&principal=&user=&target=&since=&limit=&offset=`
      (`user`: email substring or id; newest first; `limit` ≤ 1000). Pending counts are flushed first. App `_none`
      = rows with no app (external source with no pattern named, anon route gates): `AVAIL` only.
- [x] Tests: `tests/test-access-log.js` (`npm run test:access-log`, temp SQLite) 12/12: no write before a db,
      one row per distinct refusal, upsert adds counts, off switch, guards record would-deny / refused and
      nothing when allowed, route 401 / 403 / own app only / filters / AVAIL + `_none` / paging. Guard suites
      unchanged: data-auth 53, source-auth 53, read-auth 25, uda-auth 28, upload-auth 37, schedule-auth 13,
      datatype-auth 9, sync 95.
- [x] Mockup: `src/themes/tessera/design_system_v6/pages/admin-access-log.html` (site-level admin page under
      "people", next to users / groups / profile): counts strip, filters (outcome, guard, user, target, since),
      table (last / first seen, outcome pill, guard, kind · perms + target, who + groups, reason + "blank row"
      chip, times), pager, empty state.
- [x] **Owner confirmed the mockup** 2026-11-02 ("the mock looks good"): placement, columns, filters as drawn.
- [x] Client page (2026-11-02): `patterns/auth/pages/authAccessLog.jsx` at `<auth>/manage/access-log`, nav link
      "Access log" (icon `Shield`, new in `ui/icons/icon_defs.jsx`) for `${app} Admin` / AVAIL only.
      `useManagePageGate(null)` = admins only. Fetches with `authedFetch` from the `API_HOST` the pattern config
      already receives (`manageAuthConfig` now takes it). `UI.Table` 'list', `UI.Select` / `UI.Input` / `UI.Pill`
      (`status_amber` would deny, `status_brick` refused, `marker` groups + blank row) / `UI.Button`, theme keys
      `auth.authPages.manage.headerSubtitle` + `accessLog*` in `patterns/auth/defaultTheme.js`. Server: the read
      route also returns `summary` {wouldDeny, refused, users} (times, over the filters, both outcomes) for the
      header counts; test-access-log 13/13. A 404 (older server) shows "This server doesn't keep an access log
      yet."; `npm run build` ✓.
- [x] Mockups: nav link + footer link added to `admin-users.html`, `admin-groups.html`, `admin-profile.html`;
      guard filter lists `auth`.
- [x] Live check on the rig (2026-11-02, :3458 + :5197): log mode, a viewer and an anon create were allowed and
      showed as two would-deny rows (the viewer's with the blank-row chip), header 2 / 0 / 2; the user filter
      narrows the list; viewer is sent home and has no nav link; route 403 for viewer, 401 for anon; dark mode
      fine. Enforce: the viewer's create was refused and appeared as `refused` (header refused 1). Probe rows
      58/59 deleted.
- [ ] Later (offered 10-27, not asked for): `dms auth would-deny` CLI command; the audit reading this table for
      real external-source usage; auth-server refusals (its checks only throw today).

**2026-11-03: unattributed rows.** Owner found rows with a blank `app` (they are stored as `''` and listed only
under `_none`, for AVAIL; a site's page filters `app = <its app>`, so it never shows them). Signed-out reads and
route calls (`readerAllowed`, `requireReader`, `requireUserOrOpen`, the `uda.tasks.*` routes) recorded no app
even when the request named a pattern; they now use the `dms_pattern` / `X-DMS-Pattern` app. Still blank, by
design: a request naming no pattern (an external pgEnv source read or a signed-out call from a client that
sends none); nothing on such a request says which site it came from. +1 test (`test-access-log` 14/14). Not
yet checked against the live table (VPN was off): which guards / kinds the blank rows actually are.

**2026-11-03: every pattern names its site (`dms_app`).** The owner's export showed the blank rows were all
external `hazmit_dama` reads (`list` / `source`), from pages outside the datasets pattern, including the
site's own admin as "missing view-source": with no app on the request, `${app} Admin` couldn't be checked.
An external source belongs to no site (`data_manager.sources` has no app / pattern column; one pgEnv serves
many sites), so no pattern can be named for it. **Owner decision:** a pgEnv is added to a site only by a
sysadmin's config change, so the site's admins may read its sources. Built:
- client: `tagFalcorRequests(falcor, pattern, app)` adds `dms_app=<app>` to every pattern's Falcor model
  (`render/dmsPageFactory.jsx`); the datasets pattern still adds `dms_pattern` too.
- server: `sourceAuth.requestApp(req)` (query `dms_app` / `X-DMS-App`) → `router.requestApp`. Reads
  (`readAuth.js` `namedOrSite`): when no datasets pattern is named, the requesting site is `{ app, ap: {} }`
  — its admins read, no grants lent. Access-log rows of reads and signed-out calls fall back to it. Writes
  unchanged (they still need a named pattern).
- Limit: the server can't check that the site really lists that pgEnv (pgEnvs are site build config, not
  server data), the same trust `dms_pattern` already has.
- Tests: read-auth 32/32 (also `DMS_UDA_GATE=row`), access-log 14/14, client `authedFetch.test.js` 4/4.

## Files

- `packages/dms-server/src/access-log/index.js` (new), `src/index.js` (route registration)
- `packages/dms-server/src/db/sql/dms/change_log.sql`, `change_log.sqlite.sql`, `migrate_dms_core.sql`,
  `migrate_dms_core.sqlite.sql`
- `packages/dms-server/src/routes/uda/sourceAuth.js`, `readAuth.js`, `routes/dms/dataAuth.js`,
  `dama/upload/auth.js`, `dama/upload/file-upload-dms-route.js`
- `packages/dms-server/tests/test-access-log.js` (new), `package.json` (`test:access-log`)
- dms-template `src/themes/tessera/design_system_v6/pages/admin-access-log.html` (new)

## Testing checklist

- [x] Recorder and route (test-access-log 12/12).
- [x] Guards unchanged in behaviour (suites above).
- [x] Postgres (2026-11-02): upsert, count accumulation, reason update and the `user` / `since` filters on the
      disposable PG 17 container (`tests/postgres-docker.js run`, one-off check script, not kept).
- [x] Live: log-mode refusal appears after a flush; enforce records `refused`; a non-admin gets 403 (2026-11-02).

