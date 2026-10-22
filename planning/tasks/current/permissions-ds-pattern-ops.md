# Datasets/admin: permission checks on pattern duplicate and sync-filters

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** —

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

## Proposed changes

- [ ] Server-side site-permission check mirroring `utils/adminPermissions.js` `siteCan` / `patternCan`
  (admin row grants, auth-row fallback, `${app} Admin`). Mirror with a cross-reference comment; don't import.
- [ ] Guard both routes; take `userId` from the token.
- [ ] Tests: denied without the grants, allowed with them; the duplicate's created rows carry the real user id.

## Testing checklist

- [ ] Tests above.
- [ ] Live: duplicate a pattern and run sync-filters from the admin panel as an `${app} Admin` and as a user with
  only `view-pattern-list`.
