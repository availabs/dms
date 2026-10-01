# Admin panel: granular permissions for the pattern list and Pattern Editor

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** done (2026-09-30; committed, pushed, dms-server deployed) · **Created by:** ssangdod@albany.edu · **Edited by:** —

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
> - **Answered (2026-09-30): sync does no per-row permission filtering.** `dms-server/src/routes/sync/sync.js`
>   `/sync/bootstrap` and `/sync/delta` return every row in scope (full app, type, pattern or site
>   skeleton). Their only check is `DMS_SYNC_AUTH=1`, which requires *some* logged-in user
>   (`requireAuth`, `sync.js:175`). No `authPermissions`, `view-page` or stub logic runs there, and
>   `ws.js` broadcasts are scoped by pattern subscription only. So **restricted pattern rows (and
>   their pages) reach any sync client in full**, whatever the user's permissions. Only Falcor reads
>   through `dms.route.js` are gated. Consequences for this task:
>   - Phase 4 is still worth doing: it's what makes an `edit-pattern`-only grant usable on the Falcor
>     path (sync off, or reads that bypass the local store).
>   - It is **not** a security boundary while sync is on. Neither is today's `view-page` gate. Closing
>     that is a separate task (filter bootstrap/delta rows per user, mirroring `dms.route.js`), not
>     this one.

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
[auth-permission-chain-and-unguarded-writes.md](../current/auth-permission-chain-and-unguarded-writes.md)), so
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
| `auth-users` | *(now listed in the dropdown; route check is **not** actually effective, see "Findings")* Auth → Users page |
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

### Phase 1 — Permission module — DONE (2026-09-30)
- **Design note (2026-09-30, user):** patterns must not import from each other. The module was first
  written as `patterns/admin/permissions.js` and imported by `patterns/auth/siteConfig.jsx`. It now
  lives at **`packages/dms/src/utils/adminPermissions.js`**; paths below are updated.
- [x] New `utils/adminPermissions.js`:
  - the site and pattern permission constants, and dropdown option lists for each pattern type
  - `siteCan(user, app, siteAuthPermissions, perm)`: Admin → true. Otherwise checks the user's and
    their groups' permissions for `*` or `perm`. There is **no** "unconfigured → allow" rule.
  - `patternCan(user, app, siteAuthPermissions, pattern, perm)`: `siteCan(..., '*')` → true.
    Otherwise resolves the pattern's permissions with `resolveSubdomainAuthPermissions(pattern.authPermissions, pattern.subdomain)`
    If the pattern has no grants, returns `siteCan(..., 'view-pattern-list')` (open pattern, per
    decision 1). Otherwise checks for `*` or `perm`.
  - **As built:** also exports `patternActions(user, app, sitePerms, pattern)` →
    `{open, edit, editPermissions, delete, duplicate, locked}` (the list row, the Overview danger
    zone and the no-access banner all read this), `tabPermission(path)` (Access → 
    `edit-pattern-permissions`, every other tab incl. custom `item.pages` → `edit-pattern`),
    `permissionOptionsFor(patternType, {adminRowHasGrants})` (Phase 3) and `isAppAdmin`.
    `siteCan`/`patternCan` return false for logged-out users.
  - **Design note — what counts as "no grants":** `patternCan` uses `hasAuthGrants`, which
    ignores the `public` group. The Access editor seeds `public: ['view-page']` into every save, so
    a pattern someone merely opened and saved is still open. `hasPatternManageAccess` counted
    `public` as a grant. This changes nothing for anyone today (only `*`/Admin reach the list, and
    they pass everything).
  - **Design note — auth and admin rows are never open.** Their Access tab holds the site's own
    grants. An open admin row (the normal state until someone grants on it) would let a
    `view-pattern-list` user grant themselves `*`. They need site `*`, Admin, or an explicit grant
    on the row itself.
- [x] Replaced: `hasPatternManageAccess` and the admin `isUserAuthed` are deleted from
  `patterns/admin/utils.js`. Every caller moved to `permissions.js` (Phase 2).
- [x] Unit tests: `packages/dms/tests/adminPermissions.test.js`, 34 passing. One case per matrix
  row, flat and subdomain-keyed shapes (plus a string-encoded one), user-level grants, a
  subdomain-specific override, open patterns, and the core-row exception.

### Phase 2 — Gating — DONE (2026-09-30; browser-tested locally, see Testing checklist)
- [x] `editSite.jsx`: the site gate uses `view-pattern-list`. Per row: `edit-pattern` → name link
  and Edit; `create-pattern` + `edit-pattern` → Duplicate; `delete-pattern` → Delete. Add pattern
  requires `create-pattern`. `TenantList` requires `manage-tenants`. Update `noAccessCount` to match.
  - **As built:** every row reads `patternActions`. The name link shows for `edit-pattern` **or**
    `edit-pattern-permissions` (matrix row "edit-pattern-permissions only → link"); the pencil only
    for `edit-pattern`. The lock badge and the no-access count use `locked` (none of the three
    pattern-level permissions). A platform admin without `manage-tenants` sees the pattern list
    only. The first-load admin-row backfill now runs for any `view-pattern-list` user (it keys on
    the same `hasAccess`).
  - **Left alone:** the `editingItem` modal (its own duplicate/remove buttons) is dead code:
    nothing calls `setEditingItem` with a row.
- [x] `patternEditor/index.jsx`: the site gate uses `view-pattern-list`. Pattern gate: at least one
  of `edit-pattern`, `edit-pattern-permissions` or `*`. Filter `pages` (tabs) by permission. If the
  URL names a tab the user can't use, show that tab's "no permission" state instead of silently
  falling back to `pages[0]`.
  - **As built:** `params.page` no longer defaults to `overview`. With no tab in the URL the editor
    opens the first allowed one (Access for an `edit-pattern-permissions`-only user), so the list's
    name link (`/manage_pattern/:id`) works for both. The breadcrumb's pattern link also dropped its
    hard-coded `/overview`. An unknown tab path still falls back to the first tab, as before.
- [x] `siteConfig.jsx` `buildPatternMenuItems`: show only the tabs the user can use.
  `getMenuItems`: the Themes link requires `manage-themes`, and the Auth Users/Groups links require
  `auth-users`/`auth-groups`.
  - **As built:** Sites also requires `view-pattern-list`. Users/Groups use `utils/auth.js`
    `isUserAuthed` against the **auth pattern's** resolved grants, i.e. the same check as those
    routes' `reqPermissions` (which does allow any logged-in user while the auth pattern grants
    nothing beyond `public`), so a link shows exactly when its page opens. The pattern tab group is
    omitted entirely when no tab is allowed.
  - **Also done:** the auth pattern's manage pages (`auth/siteConfig.jsx` `manageAuthConfig`) carry
    their own copy of this sidenav; it now applies the same rules.
  - **New config params from `pattern2routes`:** `adminAuthPermissions` (the admin row's grants,
    falling back to auth, resolved) and `authPatternPermissions` (the auth pattern's, resolved).
- [x] `default/settings.jsx`: the Overview's Delete/Duplicate buttons use the same checks as the
  list row.
  - **Permissions picker (2026-09-30):** grant rows show the full user/group name on hover (`title`),
    and a user row whose email can't be loaded shows `user <id>` instead of a blank label. The
    add-access pickers still list users/groups that already have a row, **by design (user)**, so a
    page can override a pattern's grant for them.
  - **Behaviour change:** the Overview used to offer Delete/Duplicate on the **auth** pattern (it
    only hid them for admin), while the list hid them for both. Both now hide them for auth too.
- [x] `themes/list.jsx`, `themes/editTheme.jsx`: require `manage-themes`.
  - **Behaviour change (per the matrix):** they used to render "You do not have permission to
    manage themes". They now redirect like the list page: logged out → login, no permission →
    `/`, nothing while `user.isAuthenticating`.
- [x] `components/patternList.jsx`: **not reachable, left alone.** It's only the `patterns`
  attribute's generic `DisplayComp` (`admin.format.js`), used by `dms-manager/_utils.jsx`
  `getEditComp`/`getViewComp`. No admin route renders that attribute's EditComp/ViewComp:
  `SiteEdit` renders its own `PatternList`.
- **Import-cycle fix:** `resolveSubdomainAuthPermissions` and `hasAuthGrants` moved from
  `render/spa/utils/index.js` to the import-free `utils/auth.js` (re-exported from `index.js`), so
  `permissions.js`, which the eagerly loaded `siteConfig.jsx` files now import, doesn't cycle back
  through `index.js` → `patterns`.

### Phase 3 — Access editor options — DONE (2026-09-30; browser-tested locally)
- [x] `admin.format.js`: replace the single `permissionDomain` with one list per pattern type.
  **As built:** a function, `permissionOptionsFor(patternType, {adminRowHasGrants})` in
  `permissions.js`; the attribute's `permissionDomain` is removed (only `permissionsEditor.jsx`
  read it). The `admin` type offers `*` + the site-level list.
- [x] `permissionsEditor.jsx`: chooses the list from `value.pattern_type`. `adminRowHasGrants`
  comes from `AdminContext`. `pattern2routes` computes it once (`hasAuthGrants` on the picked admin
  row, the same value that decides `AdminContext.authPermissions`) and passes it to every config.
  - **Design note:** the first cut computed it in `patternConfig` from `dataItems`. The browser
    test showed `dataItems` there holds **only the open pattern**, not every sibling (the old
    comment in that wrapper says otherwise), so it was always false. The admin-row lock-out guard now uses
  `siteCan(..., '*')` (same meaning as before).
- [x] Datasets list confirmed: the only pattern-level route check is `view-sources`
  (`datasets/siteConfig.jsx:109`); the source vocabulary matches `datasets.format.js:47`, with the
  same "Create version" label for `create-view`.

### Phase 4 — Server read gate — DONE (2026-09-30; needs a dms-server deploy)
- [x] `dms-server/src/routes/dms/dms.route.js`: the pattern-row check accepts `view-page`,
  `edit-pattern`, `edit-pattern-permissions` or `delete-pattern` (`PATTERN_READ_PERMISSIONS`).
  Page-row checks (byId, length, byIndex, options) are unchanged.
- [x] Server test (`tests/test-pattern-stub.js`, now 19 cases): users holding only `edit-pattern`,
  only `edit-pattern-permissions` or only `delete-pattern` read the full pattern row but get
  `no-access` for its page; a `view-page` group still reads both; an ungranted group still gets the
  pattern stub. 19/19 pass on sqlite `cli-test` (scratch server copy, only that config). With the
  old `['view-page']` gate the three "reads the full pattern row" cases fail.
- **Reminder:** this gate only covers Falcor reads. Sync doesn't filter (see the top of this file).

### Phase 5 — Docs — DONE (2026-09-30)
- [x] `src/dms/documentation/admin-permissions.md`: storage, vocabulary, rules, editor tabs, Access
  editor options, server reads and the sync caveat.
- **Not done:** no link from the Access tab. There's no spot that makes sense for it: a repo
  markdown file isn't served to site users.

## Files requiring changes

| File | Change |
|---|---|
| `packages/dms/src/utils/adminPermissions.js` (new) | constants, per-type option lists, `siteCan`/`patternCan` |
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
| **Also changed (as built):** | |
| `packages/dms/src/utils/auth.js` | now holds `resolveSubdomainAuthPermissions` + `hasAuthGrants` (moved from `render/spa/utils/index.js`, which re-exports them) |
| `packages/dms/src/render/spa/utils/index.js` | passes `adminAuthPermissions`, `authPatternPermissions`, `adminRowHasGrants` to every config |
| `packages/dms/src/patterns/auth/siteConfig.jsx` | the auth manage pages' sidenav links gated the same way |
| `packages/dms/tests/adminPermissions.test.js` (new) | 34 unit tests |
| `packages/dms-server/tests/test-pattern-stub.js` | +8 cases for the pattern read gate |
| `src/dms/documentation/admin-permissions.md` (new) | reference doc |
| ~~`components/patternList.jsx`~~ | not routed; unchanged |

## Full live verification — 2026-09-30 (103/103 pass)

An assertion-based Playwright suite (real Chromium) ran every item of the live test plan against a
fresh scratch site: sqlite dms-server copy, Vite with **`VITE_DMS_SYNC=0`** (the suite asserts zero
`/sync/` requests), plus a second Vite with `VITE_DMS_MULTI_TENANT=1` for the Tenants check. It also
asserts no uncaught page errors. Final run: **103/103**, on a fresh seed after the fixes below. Suite:
session scratchpad `suite.mjs` + `seed-v2.mjs` (not committed).

> **Correction to the earlier browser runs:** the repo `.env` sets `VITE_DMS_SYNC=1` and
> `VITE_DMS_MULTI_TENANT=1`. The first browser runs didn't override them, so they ran in sync mode,
> which never exercises the server read check. The [server] items were only really tested in this run.

**Bugs the suite found and that are now fixed:**
1. **Auth manage pages' sidenav showed only "Profile"** (my regression). Those routes load no data, so
   their wrapper never re-rendered after the real groups replaced the `['public']` placeholder, and
   the new permission-gated links stayed hidden. `AdminLayout` (`auth/siteConfig.jsx`) now reads the
   live user from `useAuth()`.
2. **The Pattern Editor failed open on a server-stubbed pattern** (my code), plus a pre-existing junk
   write. When the server stubs a pattern for a user, the editor's `item` arrives as `{}` (no id, no
   grants). `patternCan` read that as an "open" pattern, so a `view-pattern-list` user got a blank
   editor. `${app} Admin` / site-`*` users (whom the client lets in, but whom the pattern itself doesn't
   list) always got that blank form. Saving it **created a stray row** (seen: id 11, type `pattern`, only
   `html_title`) instead of editing the pattern. Fix: `patternEditor/index.jsx` stops when `!item?.id`
   and says the pattern couldn't be loaded for the account.
3. **Access tab "reset" didn't reset the picker** (pre-existing). It cleared the pending save, but
   `UI.Permissions` keeps its own copy of the value, so the edited grants stayed on screen and the next
   edit re-applied them. `permissionsEditor.jsx` now remounts the picker on reset.

4. **Pages judged by the admin row when a content pattern's instance is `admin`** (found by the user
   on mitigat-ny-prod, 2026-09-30; caused by the admin-row task's type choice).
   - **The collision:** page pattern 566466 is `prod|admin:pattern`, and so is the backfilled admin row
     2724987 (the admin row is always `{site}|admin:pattern`).
   - **The mechanism:** the server finds a page's parent pattern by type string, newest id first
     (`dms.controller.js` `getPatternAuthPermissions`, used by every page read: byId, length, byIndex,
     options). So pages `admin|page` were judged by the admin row:
     - while it was empty ("no restrictions"), they were **readable by anyone, including anonymous
       users**
     - once it had site-level grants, users with `view-page` on 566466 but not on the admin row (DHSES
       on prod) were **blocked**
   - Both reproduced locally.
   - **Fix:** that lookup now skips rows whose `pattern_type` is `admin` or `auth`; neither kind has
     pages. No retyping or migration is needed. The client already tells them apart by `pattern_type`.
   - **Tests:** 5 cases added to `dms-server/tests/test-pattern-stub.js`, which now passes 24/24 on a
     fresh sqlite. With the old lookup, 3 of them fail exactly as prod behaved.
   - `test-auth.js` has one failure ("users by project returns array") that also fails on the old
     code: a test/handler mismatch, not related.
   - **Needs a dms-server deploy.** Until then, pages under 566466 on prod follow the admin row's
     grants.

**Things the suite showed about behaviour (not bugs in this task):**
- **The Access editor seeds `public: ['view-page']`, and the server counts `public` for everyone.** So a
  pattern whose grants were saved through the Access tab stays publicly readable (pattern row and
  pages) until an author removes `public`.
- **The server has no "`${app} Admin` reads everything" rule.** An Admin-group member not listed on a
  pattern gets the stub. With fix 2 they now see "could not be loaded" instead of a blank form.
  **Decision (user, 2026-09-30): no.** The server will not let `${app} Admin` or site-`*` users read
  pattern rows that don't grant them. A pattern's own grants decide who can read it, and the "could not
  be loaded" message is the intended behaviour.
- **The Access editor always re-adds the editing user as `*`** if neither they nor their groups hold
  anything (`UI.Permissions` `applyChanges`). So the admin-row lock-out guard only fires when you
  *downgrade* your own group (it keeps a permission and loses `*`), which the suite tests.
- **Test-plan correction (item 19):** a `delete-pattern`-only user can't open the editor, so never sees
  the danger zone; their Delete is on the list row only.

## In-page gates on Auth → Users / Groups — 2026-09-30 (user request)

The route-level `reqPermissions` on these pages never block (defect A), so hiding the sidenav links
left both pages open to anyone logged in who typed the URL.
- New hook **`patterns/auth/pages/useManagePageGate.js`**, used by `authUsers.jsx` (`auth-users`) and
  `authGroups.jsx` (`auth-groups`; `auth/siteConfig.jsx` now passes it `authPermissions`).
  - **Rule:** the same one the links use: the auth pattern's grants via `utils/auth.js`
    `isUserAuthed`, including "auth pattern grants nothing beyond `public` → any logged-in user".
  - **Behaviour:** logged out → login; no permission → `/`; nothing is judged while
    `isAuthenticating`. It reads the live user from `AuthContext`.
  - **Data loading:** the pages' load effects now wait for access, so denied users trigger no
    auth-server requests.
- **What the page gate does and doesn't do:** it decides who can *open* the pages. What the Users page
  *lists* is still decided by the auth server by group level. A user with `auth-users` but a level-0
  group sees the page with 0 users. That's [auth-levels-to-permissions.md](../current/auth-levels-to-permissions.md).
- **Verified live:** 15 new checks in the Playwright suite; the full suite passes 117/117.
  - lister and nobody → `/`
  - useradmin: Users stays open, Groups → `/`
  - admin: both pages open and load their data
  - anonymous → login
  - refresh doesn't bounce
  - with the auth pattern granting nothing, lister is let in and sees the link

## Findings outside this task (2026-09-30, not fixed here)

All three are tracked elsewhere, with this session's evidence added to each:
1. **Route `reqPermissions` never block:** this is defect A in
   [auth-permission-chain-and-unguarded-writes.md](../current/auth-permission-chain-and-unguarded-writes.md)
   (blocked on a product decision). That task's defect C is resolved by Phase 3 here. This task's
   Users/Groups link hiding is the only client-side gate on those pages until A is fixed.
2. **`POST /signup/assign/group` lets anyone join any existing group, including `${project} Admin`:**
   already Phase 1 of [auth-invite-link-and-reset-hardening.md](../current/auth-invite-link-and-reset-hardening.md).
   A live repro, the caller inventory and the avail-falcor copy were added there.
3. **Sync does no per-user permission filtering:** new task
   [sync-per-user-permission-filtering.md](../current/sync-per-user-permission-filtering.md).

## Testing checklist

**Live setup used (2026-09-30):** scratch dms-server copy (only the sqlite `cli-test` config) on
:3457, a second Vite on :5199 (`VITE_DMS_APP=permtest VITE_DMS_TYPE=permsite`), Playwright with
`localStorage.userToken`. Seed: one site, `createCorePatterns`, admin-row grants per group, and
patterns Open (no grants), Locked (Owners `*`), Managed (Editors/Creators `edit-pattern`, Keepers
`edit-pattern-permissions`, Deleters `delete-pattern`, Contents `view-page`+`edit-page`), Data
(datasets; Editors `edit-page`,`view-page`,`edit-pattern-permissions`), Map (mapeditor, no
grants). Users: admin (`permtest Admin`), lister, editor, keeper, deleter, creator, content (all
`view-pattern-list`; creator also `create-pattern`), themer (`manage-themes` only), star (site
`*`, not Admin group), nobody, anonymous. Scripts are in the session scratchpad (not committed).

- [x] Unit: `siteCan`/`patternCan` against every matrix row, both permission shapes (flat and
  subdomain-keyed), and a pattern with no grants. (`adminPermissions.test.js`, 34 pass.)
- [x] Live, one test user per row of the matrix (local scratch site, not shaun-test-app):
  - [x] list page visibility, per-row link and actions, no-access banner count. Every row
    matched the matrix, e.g. deleter: Managed = Delete only; keeper: Managed = link only;
    creator: Managed = link+Edit+Duplicate, no Delete; content: Managed locked; banner counts
    5/3/4/4/4/5 for lister/editor/keeper/deleter/creator/content.
  - [x] editor: bare URL, `/overview` and `/permissions` for each user. Editor/creator get every
    tab except Access, and `/permissions` shows "You do not have permission to use this tab".
    Keeper gets only Access, including from the bare URL. Deleter/lister/content get "no permission
    to manage this pattern" on Managed; everyone but admin/star gets it on Locked and the admin row.
    The sidenav tab list matches in each case.
  - [x] Themes: themer and star reach `/list/themes`; lister/editor/… are redirected to `/`.
    Sidenav: themer sees only Themes + Profile, listers Sites + Profile, star Sites + Themes +
    Profile, admin everything. The auth manage pages' sidenav shows the same per user.
  - [x] Tenants (`manage-tenants`): verified in the final suite (item 24, multi-tenant Vite): admin, star and tenanter see it; lister and creator don't.
  - [x] Access editor options: auth (admin row granting) = `auth-users`/`auth-groups`/`view-as`;
    admin = site list; page = pattern admin + page list; datasets = pattern admin + View Pattern +
    source list; mapeditor = pattern admin + `*`.
  - [x] The auth dropdown with an empty admin row adds the site-level list: verified in the final suite (item 2b).
- [x] Compatibility (display): the datasets pattern's Editors group still shows its saved
  page-only `edit-page` next to View Pattern / Edit Pattern Permissions. **Not done:** a save
  round-trip through the UI.
- [x] Open (no-grants) pattern: `view-pattern-list`-only users get link + Edit + Delete on Open and
  Map, no Duplicate; creator also gets Duplicate.
- [x] Regression: Admin-group user and site-`*` user (star) reach everything, including Add
  pattern and every tab. Anonymous → `/auth/login` on every admin URL; `nobody` → `/`.
- [x] Refresh: every visit was a cold load with the token in localStorage (the
  `isAuthenticating` path); no permitted user was bounced.
- [x] Saving through the Access tab (items 4c, 18), the admin-row lock-out guard (item 6) and the Overview danger zone per user (item 19): verified in the final suite.
- [ ] **Not tested anywhere:** sync-on mode, SSR, and a real site's data. Left for the user's live test.
- [x] `npm run build` passes. Package vitest: 568 pass, 3 fail, all 3 are the known pre-existing
  failures (`avlGraphThemeDefaults`, `syncDeltaConvergence`).
