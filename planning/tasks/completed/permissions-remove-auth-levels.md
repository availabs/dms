# Permissions move, last step: remove `authLevel` / `auth_level` from client and server

**Initiatives:** [dms_permissions_move](../../../../../planning/initiatives/dms_permissions_move.md) (primary), [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** dropped · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

> **Dropped 2026-11-02 (owner): levels stay.** The `auth_level` data stays in the auth DB and on pattern rows, so older code that reads it (avail-falcor, avail_auth_2) keeps working. Instead, levels count only under `log` / `legacy`; under `enforce` only permissions decide (`auth/utils/permissions.js` `levelCounts`, and since 2026-11-03 every handler that read a level directly goes through `levelRule`). Phase 1's dead-code items below were never done; pick them up separately if wanted.


Part of [auth-levels-to-permissions.md](../current/auth-levels-to-permissions.md) (hub). Phase 2 depends on every auth task
being in transition mode and [permissions-grant-migration.md](../current/permissions-grant-migration.md) having run on every
site, and on a clean last run of [permissions-access-diff-audit.md](../current/permissions-access-diff-audit.md). **Phase 1 is dead code and can land any time.**

## Phase 1 — dead code (no dependency)

- [ ] `src/patterns/mapeditor/SourceLayout.jsx:54-84` (app repo): delete `DataManagerHeader` (checks
  `user?.authLevel >= 5` on a hard-coded `{}` user, exported, never used).
- [ ] The `auth_level` pattern field, copied on duplicate and read nowhere: `admin/pages/editSite.jsx:333,664`,
  `admin/pages/patternEditor/default/settings.jsx:248`, `admin/components/patternList.jsx:456`. Stored rows keep it
  (and some a camelCase `authLevel`); leave the data, stop copying.
- [ ] `patterns/page/pages/edit/editPane/index.jsx:26` still checks the removed `edit-page-params` (alias of
  `edit-page`); unrelated to levels but same cleanup.

## Phase 2 — level checks out of the auth server

- [ ] Drop the level half of `canOrLevel` in every handler (`auth.js`, `group.js`, `user.js`, `project.js`,
  `message.js`); remove `getUserAuthLevel`, `adjustAuthLevel`, the `/group/project/adjust` route, and the
  `auth_level` arguments of `assignGroupToProject` / `ensureGroupInProject` (`auth/utils/queries.js`).
- [ ] `/init/setup` stops writing levels (`auth.js:493-494`); `${project} Admin` stays `*` by name and by grant.
- [ ] Rewrite the level tests (`tests/test-auth.js:142,169,217,326-398,452-500`, `tests/test-jwt-failures.js:55`).
- [ ] Client: `patterns/auth/context.js:6` `authLevel`; `authGroups.jsx:107` `auth_level: 0`.
- [ ] Remove body `user_id` from the dama-admin calls ([permissions-dama-admin-client-auth-headers.md](../current/permissions-dama-admin-client-auth-headers.md)).

## Phase 3 — the user object and schema (needs external consumers gone)

- [ ] `authLevel` on the request user (`auth/jwt.js:58,63`), `meta[].authLevel` (`:67`), and in `/login`/`/auth`
  responses (`auth/handlers/auth.js:35-52`). No dms-template site reads it beyond the Phase 1 dead
  code. Per [permissions-inventory.md](../completed/permissions-inventory.md).
- [ ] `groups_in_projects.auth_level` (`db/sql/auth/auth_tables.sql:45,135-141,630`, `auth_tables.sqlite.sql:29-38,136`):
  keep the column (avail-falcor and old consumers may read the same DB) but stop reading it; drop in a later
  migration if nothing does.
- [ ] Library default `AUTH_HOST='https://graph.availabs.org'` (`render/spa/dmsSiteFactory.jsx:41`) points sites at
  avail-falcor's level model. Decide whether the default moves to dms-server.
- [ ] `grep -rn "authLevel\|auth_level\|reqAuthLevel"` over dms-template returns only migrations, history docs and
  the kept column.

## Testing checklist

- [ ] Full `dms-server` test suite green.
- [ ] Live, each auth flow from the users/groups/platform tasks on a server with levels removed.
- [ ] A user whose groups all have `auth_level` 0 but hold the grants can do everything a level-10 user could.
