# Datasets/admin: permission checks on pattern duplicate and sync-filters

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Release:** commit — lib a943738b, not pushed (branch permissions_move) · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Depends on
[permissions-server-source-auth-core.md](./permissions-server-source-auth-core.md) (`isUserAuthedForPattern`,
`requestUserId`) and [permissions-dama-admin-client-auth-headers.md](./permissions-dama-admin-client-auth-headers.md).

## Owner rule 2026-10-22 (from the stage 1 e2e)

**Whoever can reach them in the UI may use them**, so the server mirrors the UI gate:
- **sync-filters** is on the pattern's Access tab (`tabPermission('permissions')`) → `edit-pattern-permissions` on that
  pattern.
- **duplicate** is on the pattern's Overview tab (`edit-pattern`) and in the sites list (`patternList.jsx`, site-level
  pattern editing).

Found live 2026-10-21 (Postgres DMS): both routes (`dama/upload/index.js:45,50`) check nothing, not even a login; anon
queued a sync-filters task. Both validate the body before any auth. Neither request sends `?dms_pattern=`. Non-admins
who hold `edit-pattern` on a pattern still can't open `/list/manage_pattern/<id>` (redirect to `/`, a 404 page).

## Objective

Two pattern-wide operations run under `/dama-admin/dms/` with no check at all. The admin UI already decides who
may run them (`admin-granular-permissions.md`: duplicate = `create-pattern` + `edit-pattern`); the server should
match it.

## Routes

| file:line | route | check today | should need |
|---|---|---|---|
| `dama/upload/dms-duplicate.js:126` (mounted `index.js:41`) | POST `/dama-admin/dms/:appType/duplicate` | none; `userId` from `req.user` (never set) → null | `create-pattern` on the site (admin row, falling back to the auth row) **and** `edit-pattern` on the source pattern |
| `dms/tasks/pattern-filter-sync/pattern-filter-sync.js:306` (mounted `index.js:46`) | POST `/dama-admin/dms/:appType/sync-filters` | none; same `req.user` bug | `edit-pattern` on the pattern |

Client callers: `admin/pages/patternEditor/default/settings.jsx:212`, `admin/pages/editSite.jsx:451`,
`admin/components/patternList.jsx:293` (duplicate); `patternEditor/default/filterEditor.jsx:117` (sync-filters).

## Progress (built 2026-10-22 as hub Resume step 5, lib a943738b; file closed 2026-10-23)

- [x] `requirePatternAction` (`dama/upload/auth.js`): a login always; the permission under `DMS_DATA_AUTH_MODE`
  (`legacy | log | enforce`). The site and pattern checks run through `routes/dms/dataAuth.js` (same server, no
  client import needed). `${app} Admin` passes.
- [x] Mounts (`dama/upload/index.js`): duplicate = `edit-pattern` on the pattern **and** site `create-pattern` on
  the target app; sync-filters = `edit-pattern-permissions` on the named pattern (owner rule: it lives on the Access
  tab), id and instance must match.
- [x] `userId` from the token (`requestUserId`) in both handlers; the `req.user` bug is gone.
- [x] Tests: `tests/test-data-auth.js`, "pattern REST actions": anon 401, each grant alone 403, admin 200, id /
  instance mismatch 403, `log` lets a refusal through with one line. The created rows' user id is checked live, not
  in a unit test (the task runs in a worker).

## Testing checklist

- [x] Tests above.
- [x] Live (hub Results, row "J pattern ops (task 8 gates)", enforce on Postgres, 10-22): admin UI duplicate and
  sync-filters → tasks done; `neg-patternops.mjs` 8/8 (anon 401; viewer / pat_editor / src_editor / versioner 403);
  temporarily granted pat_editor → both 200, task `userId` 5 = the token user. Grants reverted.

## Left open (not this task)

- Non-admins who hold `edit-pattern` still can't open `/list/manage_pattern/<id>` (redirect to `/`). Client gates,
  task 10.
- The requests send no `?dms_pattern=`; the server judges the pattern named in the body / path instead.
