# Admin panel: granular permissions for the pattern list and Pattern Editor

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** planned · **Created by:** ssangdod@albany.edu · **Edited by:** —

**Project:** DMS library (`src/dms` submodule) · **Topic:** patterns/admin

> **Builds on [admin-pattern-data-row.md](./admin-pattern-data-row.md)** (implemented 2026-09-29).
> The site-level permissions below (`view-pattern-list`, `create-pattern`, `manage-themes`,
> `manage-tenants`) now live on the **admin row**. When the admin row grants nothing (`hasAuthGrants`,
> which ignores `public`), they fall back to the auth pattern.
> - **No separate lookup is needed.** `pattern2routes` already resolves this into
>   `AdminContext.authPermissions`, so every site-level check here reads that value as-is.
> - **Dropdown options:** the `admin` type shows the site-level list. The `auth` type shows
>   `auth-users`, `auth-groups` and `view-as`, **plus the site-level list while the admin row grants
>   nothing**, because the auth pattern is still what's used for site access then.
> - Wherever this file says "auth pattern (site level)", read it as "admin row, falling back to the
>   auth pattern".
> - **Open question for this task (2026-09-30):** a quick search found no `view-page` check in
>   dms-server's sync routes (bootstrap/delta). Only `dms.route.js` gates pattern reads. If sync
>   applies no filtering of its own, restricted pattern rows reach sync clients regardless of their
>   permissions. Confirm this before relying on any server-side read gate.

## Objective

Replace the admin panel's all-or-nothing `*` gate with named permissions:

- The **auth pattern's** `authPermissions` set what a user can do at the **site level**. For example,
  `view-pattern-list` lets a user open the admin Sites page.
- Each **pattern's** own `authPermissions` set what a user can do **to that pattern**. For example,
  `edit-pattern` lets a user open and edit it.
- `*` on the auth pattern, or membership in `${app} Admin`, still grants everything on every pattern.
  `*` on a pattern grants everything on that pattern.

## Scope

**In:** the permission vocabulary, the access rules below, and client-side gating of the admin list
page, Pattern Editor tabs, row actions (add/duplicate/delete), Themes, the Tenants list, and the
sidenav. Also a separate permission dropdown per pattern type in the Access editor.

**Also in:** one small server change. The dms-server check on **reading** a pattern row must accept
the new pattern-level permissions (see Compatibility → server read gate). Without it, a user granted
only `edit-pattern` can't even load the pattern.

**Out:** server-side **write** enforcement. `dms.data.edit` has no authorization at all (defect B in
[auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md)), so
every admin gate in this task is UI-only. A user who is denied here can still write through Falcor or
the CLI. This task should say so and not claim more. Content permissions inside patterns
(`view-page`, `edit-page`, `view-sources`, …) keep their current meaning.

## Current state (read 2026-09-29)

- **Site gate.** `editSite.jsx:47-48` (list) and, since 2026-09-29, `patternEditor/index.jsx` compute
  `isAdmin || isUserAuthed(user, authPermissions)`. `authPermissions` in `AdminContext` is the
  **auth pattern's** resolved `authPermissions` (`render/spa/utils/index.js:253` assigns it to the
  synthetic `AdminPattern`). `patterns/admin/utils.js:31` `isUserAuthed` passes **only on `*`**.
  Logged-out users are sent to login, and logged-in users without access are sent to `/`.
- **Pattern gate.** `hasPatternManageAccess` (`patterns/admin/utils.js:57`) checks for Admin, then
  "the pattern has no grants at all → unrestricted", then `*` on the pattern's own resolved
  `authPermissions`. It controls:
  - the list row's name link and its edit/duplicate/delete actions (`editSite.jsx:181,209,257`)
  - the `noAccessCount` banner (`:420`)
  - the whole Pattern Editor (`patternEditor/index.jsx`)
- **Other site-level pages.** Themes (`themes/list.jsx:31`, `themes/editTheme.jsx:119`) use the same
  Admin-or-auth-`*` check. The "Add pattern" button (`editSite.jsx:480`) and the Tenants list
  (platform admin) have no check beyond the site gate.
- **One permission list for every pattern type.** The Access editor
  (`patternEditor/default/permissionsEditor.jsx:36`) takes its dropdown options (`permissionDomain`)
  from the `authPermissions` attribute in `admin.format.js:137`. That list is the **page**
  vocabulary (`view-page`, `edit-page`, `create-page`, `edit-page-permissions`, `publish-page`).
  Every pattern type, including **auth** and **datasets**, shows those options. The auth pattern's
  own routes require `auth-users`, `auth-groups` and `view-as` (`auth/siteConfig.jsx:329,334`,
  `authUsers.jsx:109`). None of those appear in any option list, so an author can only grant them
  as `*`.
- **Two `isUserAuthed` implementations.** `utils/auth.js:21` takes a `reqPermissions` list, and it
  **allows any logged-in user when no groups beyond `public` are configured**.
  `patterns/admin/utils.js:31` requires `*` only. The new checks must not inherit the first one's
  "unconfigured → allow" rule.
- **The public `view-page` default.** `render/spa/utils/index.js:419-421` adds
  `public: ['view-page']` to every pattern's resolved permissions, **including the auth/admin
  pattern**. This is harmless now, but none of the new admin permissions may ever be added that way.

## Permission vocabulary

### Auth pattern (site level)

| Permission | Grants |
|---|---|
| `*` | Everything below, plus `*` on **every** pattern |
| `view-pattern-list` | Open the admin Sites/pattern list page. Open the Pattern Editor for patterns where the user also has a pattern-level permission |
| `create-pattern` | The "Add pattern" button. Also needed for Duplicate, which creates a new pattern |
| `manage-themes` | The Themes list and theme editor (`/themes`, `/theme/:id`), plus the sidenav Themes link |
| `manage-tenants` | The Tenants list on a multi-tenant platform root (add/remove tenant) |
| `auth-users` | *(already enforced; now listed in the dropdown)* Auth → Users page |
| `auth-groups` | *(already enforced; now listed in the dropdown)* Auth → Groups page |
| `view-as` | *(already enforced; now listed in the dropdown)* Impersonate a user from Auth → Users |

The `${app} Admin` group is still treated as auth `*` implicitly.

### Pattern level (per pattern, admin operations)

These sit in the same `authPermissions` object as the pattern's content permissions, next to
`view-page`/`edit-page` and the others.

| Permission | Grants on this pattern |
|---|---|
| `*` | Everything below. For page and datasets patterns, it also still grants every content permission, as it does today |
| `edit-pattern` | Open the Pattern Editor and use the Overview, Theme, Pages, Data Sources, Activity, Page Templates and Format Manager tabs. Also the list row's name link and Edit action |
| `edit-pattern-permissions` | The Access tab (permissions + row filters). Kept apart from `edit-pattern` because this one can grant itself `*` |
| `delete-pattern` | The Delete action (list row + Overview) |

Duplicate needs **auth `create-pattern`** plus `edit-pattern` (or `*`) on the source pattern.

### Dropdown options per pattern type (Access editor)

| Pattern type | Options shown |
|---|---|
| `auth` | Auth site-level list above |
| `page` | pattern-level admin list + existing page list (`view-page` … `publish-page`) |
| `datasets` | pattern-level admin list + **`view-page`** (label it "View pattern". The server requires it to load any non-auth pattern row, see Compatibility) + `view-sources` + the source list from `datasets.format.js:47` (`view-source`, `download-source`, `update-source`, `create-view`, `manage-downloads`, `view-source-api`, `delete-source`, `edit-source-permissions`). Pattern-level grants of those are defaults for every source, because permissions are pattern ⊕ source (`datasets/siteConfig.jsx:100`, server `uda/sourceAuth.js:97`) |
| anything else (`forms`, `mapeditor`, …) | pattern-level admin list + `*` |

## Access matrix

The first column is what the user holds on the **auth** pattern, the second what they hold on
**pattern P**. "Admin" means membership in `${app} Admin`.

| Auth-level | Pattern P | List page | P's row in the list | P editor | Access tab (P) | Delete P | Duplicate P | Add pattern | Themes | Tenants |
|---|---|---|---|---|---|---|---|---|---|---|
| logged out | — | → login | — | → login | — | — | — | — | → login | — |
| nothing | anything | → `/` | — | → `/` | — | — | — | — | → `/` | — |
| `view-pattern-list` | pattern has **no grants** (open) | ✓ | link + Edit + Delete | ✓ all tabs | ✓ | ✓ | only with `create-pattern` | — | — | — |
| `view-pattern-list` | pattern has grants, none for this user | ✓ | shown locked (no link/actions), counted in the no-access banner | "no permission" | — | — | — | — | — | — |
| `view-pattern-list` | `edit-pattern` | ✓ | link + Edit | ✓ (tabs except Access) | — | — | — | — | — | — |
| `view-pattern-list` | `edit-pattern`, `edit-pattern-permissions` | ✓ | link + Edit | ✓ | ✓ | — | — | — | — | — |
| `view-pattern-list` | `edit-pattern-permissions` only | ✓ | link | Access tab only | ✓ | — | — | — | — | — |
| `view-pattern-list` | `delete-pattern` only | ✓ | Delete only | "no permission" | — | ✓ | — | — | — | — |
| `view-pattern-list` | `*` | ✓ | all actions except Duplicate | ✓ all tabs | ✓ | ✓ | — | — | — | — |
| `view-pattern-list`, `create-pattern` | `edit-pattern` or `*` | ✓ | + Duplicate | as above | as above | as above | ✓ | ✓ | — | — |
| `view-pattern-list` | content permissions only (`view-page`, `edit-page`, …) | ✓ | locked | "no permission" | — | — | — | — | — | — |
| `manage-themes` only | — | → `/` | — | → `/` | — | — | — | — | ✓ | — |
| `*` / Admin | anything | ✓ | all | ✓ all tabs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Row notes:
- **Pattern-level grants without `view-pattern-list` do nothing in the admin panel.** Every admin
  page requires `view-pattern-list` (or auth `*`) first, because it is the entry point. A pattern
  `edit-pattern` without it still redirects to `/`. This matches the site gate added to the
  editor on 2026-09-29.
- **`manage-themes`, `manage-tenants`, `auth-users` and `auth-groups` do not require
  `view-pattern-list`.** Their pages check their own permission, and the sidenav shows only the
  links the user can use.
- Content permissions never grant admin access. A page-content editor with `edit-page` cannot
  change the pattern's base URL or permissions.

## Decisions (settled 2026-09-29)

1. **A pattern with no grants is open.** Anyone who can reach the list page (`view-pattern-list`,
   auth `*` or Admin) has full control of it, as `hasPatternManageAccess` does today. Duplicate
   still needs `create-pattern`, since it creates a new pattern.
2. **Existing pattern `*` grants handed out for page-content editing stay as they are.** A group
   given `*` on a page pattern so it could edit pages keeps full pattern admin rights. After the
   change ships, list those grants per site with the CLI and let owners narrow them by hand. No
   automatic migration.
3. **No site-wide "edit all patterns" permission.** Auth `*` covers that role.

## Compatibility with existing data and behaviour

Checked 2026-09-29.

**Stored grants are never rewritten.** The new permission names only add to what can be granted, and
nothing migrates existing values. The per-type dropdown only changes what the Access editor
**offers**. `MultiSelectEdit` (`ui/components/MultiSelect.jsx:263`) keeps values that aren't in its
options (`typeSafeValue` falls back to the raw value), so a grant that is no longer offered stays
saved and can still be removed.

**Nobody who has access today loses it.**
- The site gate already requires auth `*` or Admin today, and both still pass everything.
- Pattern `*` still grants everything on the pattern.
- Open patterns stay open (decision 1).
- The only people affected by the new permissions are users who hold them, and today nobody does.

**Datasets pattern.** Changing its dropdown does not affect how existing datasets permissions behave:
- The only pattern-level checks the datasets UI makes are `view-sources` (route,
  `datasets/siteConfig.jsx:109`) and `update-source`, `manage-downloads` and
  `edit-source-permissions` (merged with each source's own permissions). Its current dropdown is the
  page list, so none of those could be granted except as `*`. The new dropdown makes them grantable.
- **Keep `view-page` in the datasets dropdown.** The server's pattern read check
  (`dms-server/src/routes/dms/dms.route.js:47`) requires `view-page` on **every non-auth pattern
  row**, datasets included. A datasets pattern that lists groups without `view-page` (or `*`)
  can't be loaded by those users. Removing it from the dropdown would stop authors from granting
  it, so any group added to a datasets pattern afterwards would be locked out.
- Stored page-only values (`edit-page`, `create-page`, `publish-page`, `edit-page-permissions`) on
  datasets patterns do nothing today and will keep doing nothing.

**Auth pattern.** The server never blocks reads of auth pattern rows (`dms.route.js:45`). No auth
or admin route checks page permissions on it. The client still adds `public: ['view-page']` to it
(`render/spa/utils/index.js:419`). So dropping the page list from the auth dropdown changes no
behaviour.

**Server read gate: this one needs a change.** `dms.route.js:47` blocks a pattern row unless the
user has `view-page` or `*` on it. A user granted only `edit-pattern` (or
`edit-pattern-permissions`/`delete-pattern`) would get the `no-access` stub. The admin list and
editor then couldn't show or load that pattern, so the grant would silently do nothing.
- **Fix (recommended):** at `dms.route.js:47`, accept
  `['view-page', 'edit-pattern', 'edit-pattern-permissions', 'delete-pattern']`. Page rows
  (`:69`, `:174`, `:220`, `:253`, `:285`) stay `view-page` only, so admin permissions never grant
  access to page content.
- **Alternative with no server change:** the Access editor automatically adds `view-page` whenever
  one of the admin permissions is granted. It's weaker, because a grant written by the CLI would
  still silently fail.

## Proposed changes

### Phase 1 — Permission module
- [ ] New `patterns/admin/permissions.js`:
  - the site and pattern permission constants, and dropdown option lists for each pattern type
  - `siteCan(user, app, siteAuthPermissions, perm)`: Admin → true. Otherwise checks the user's and
    their groups' permissions for `*` or `perm`. There is **no** "unconfigured → allow" rule.
  - `patternCan(user, app, siteAuthPermissions, pattern, perm)`: `siteCan(..., '*')` → true.
    Otherwise resolves the pattern's permissions with `resolveSubdomainAuthPermissions(pattern.authPermissions, pattern.subdomain)`
    If the pattern has no grants, returns `siteCan(..., 'view-pattern-list')` (open pattern, per
    decision 1). Otherwise checks for `*` or `perm`.
- [ ] Replace `hasPatternManageAccess` and the admin `isUserAuthed` (`patterns/admin/utils.js`), or
  make them thin wrappers.
- [ ] Unit tests for both functions, covering every row of the access matrix.

### Phase 2 — Gating
- [ ] `editSite.jsx`: the site gate uses `view-pattern-list`. Per row: `edit-pattern` → name link
  and Edit; `create-pattern` + `edit-pattern` → Duplicate; `delete-pattern` → Delete. Add pattern
  requires `create-pattern`. `TenantList` requires `manage-tenants`. Update `noAccessCount` to match.
- [ ] `patternEditor/index.jsx`: the site gate uses `view-pattern-list`. Pattern gate: at least one
  of `edit-pattern`, `edit-pattern-permissions` or `*`. Filter `pages` (tabs) by permission. If the
  URL names a tab the user can't use, show that tab's "no permission" state instead of silently
  falling back to `pages[0]`.
- [ ] `siteConfig.jsx` `buildPatternMenuItems`: show only the tabs the user can use.
  `getMenuItems`: the Themes link requires `manage-themes`, and the Auth Users/Groups links require
  `auth-users`/`auth-groups`.
- [ ] `default/settings.jsx`: the Overview's Delete/Duplicate buttons use the same checks as the
  list row.
- [ ] `themes/list.jsx`, `themes/editTheme.jsx`: require `manage-themes`.
- [ ] `components/patternList.jsx` is the older list component, still lazy-loaded from
  `admin.format.js:9`. Confirm whether any route still reaches it. If one does, apply the same
  gating there.

### Phase 3 — Access editor options
- [ ] `admin.format.js`: replace the single `permissionDomain` with one list per pattern type. It
  can be a map keyed by `pattern_type`, or a function, whichever `Permissions.jsx` handles more
  cleanly.
- [ ] `permissionsEditor.jsx:36`: choose the list from `value.pattern_type`.
- [ ] Confirm the datasets pattern-level list (`view-sources` and any others) against
  `datasets/siteConfig.jsx`.

### Phase 4 — Server read gate
- [ ] `dms-server/src/routes/dms/dms.route.js:47`: the pattern-row check accepts `view-page`,
  `edit-pattern`, `edit-pattern-permissions` or `delete-pattern`. Page-row checks are unchanged.
- [ ] Server test: a user with only `edit-pattern` on a restricted pattern can read the pattern row
  but gets the stub for its pages.

### Phase 5 — Docs
- [ ] Document the vocabulary and matrix in `src/dms/documentation/`, and link it from the Access tab
  help text if there is a spot for it.

## Files requiring changes

| File | Change |
|---|---|
| `packages/dms/src/patterns/admin/permissions.js` (new) | constants, per-type option lists, `siteCan`/`patternCan` |
| `packages/dms/src/patterns/admin/utils.js` | retire or wrap `hasPatternManageAccess`/`isUserAuthed` |
| `packages/dms/src/patterns/admin/pages/editSite.jsx` | site gate, row actions, Add pattern, Tenants |
| `packages/dms/src/patterns/admin/pages/patternEditor/index.jsx` | site + pattern gate, filter tabs |
| `packages/dms/src/patterns/admin/pages/patternEditor/default/settings.jsx` | Delete/Duplicate gating |
| `packages/dms/src/patterns/admin/pages/patternEditor/default/permissionsEditor.jsx` | per-type option list |
| `packages/dms/src/patterns/admin/siteConfig.jsx` | sidenav links + pattern tab items |
| `packages/dms/src/patterns/admin/pages/themes/list.jsx`, `editTheme.jsx` | `manage-themes` |
| `packages/dms/src/patterns/admin/admin.format.js` | per-type option lists |
| `packages/dms/src/patterns/admin/components/patternList.jsx` | only if still routed |
| `packages/dms-server/src/routes/dms/dms.route.js` | pattern-row read gate accepts the admin permissions |

## Testing checklist

- [ ] Unit: `siteCan`/`patternCan` against every matrix row, both permission shapes (flat and
  subdomain-keyed), and a pattern with no grants.
- [ ] Live, one test user per row of the matrix on a test site (shaun-test-app, not prod):
  - [ ] list page visibility, per-row link and actions, no-access banner count
  - [ ] editor: direct URL to each tab, the sidenav tab list, and the "no permission" states
  - [ ] Themes, Tenants, Auth Users/Groups links and direct URLs
  - [ ] Access editor shows the right options for auth, page, datasets and one other pattern type
- [ ] Compatibility: open a datasets pattern whose saved grants include page-only values
  (`edit-page`, …). They still show and survive a save. `view-page` is offered and grantable.
- [ ] Open (no-grants) pattern: a `view-pattern-list`-only user has full control of it, except
  Duplicate.
- [ ] Regression: an Admin-group user and an auth-`*` user still reach everything. Anonymous users
  are still sent to login.
- [ ] Refresh on each gated page: no redirect while `user.isAuthenticating` is set (the stale
  `groups:['public']` race).
