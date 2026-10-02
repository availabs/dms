# Admin panel permissions

Who can do what in the admin panel (the Sites/pattern list, the Pattern Editor, Themes, Tenants) and
in the auth manage pages. Implemented in `packages/dms/src/utils/adminPermissions.js`; planned in
`planning/tasks/completed/admin-granular-permissions.md`.

> **Every check here is UI-only.** `dms.data.edit` has no server-side authorization, so a user denied
> in the admin panel can still write through Falcor or the CLI. See
> `planning/tasks/current/auth-permission-chain-and-unguarded-writes.md` (defect B).

## Where permissions are stored

| Level | Stored on | Holds |
|---|---|---|
| Site | the site's **admin row** (`{instance}\|admin:pattern`) → its `authPermissions` | `view-pattern-list`, `create-pattern`, `manage-themes`, `manage-tenants`, `*` |
| Site (fallback) | the **auth pattern**, while the admin row grants nothing to any user or non-`public` group | the same site-level list |
| Auth | the **auth pattern** | `auth-users`, `auth-groups`, `view-as` (always here, never on the admin row) |
| Pattern | **each pattern's** own `authPermissions`, next to its content permissions | `edit-pattern`, `edit-pattern-permissions`, `delete-pattern`, `*` |

`pattern2routes` (`render/spa/utils/index.js`) resolves the site level (admin row, else auth pattern)
into `AdminContext.authPermissions`. Members of the `${app} Admin` group always count as site `*`.

## Vocabulary

### Site level

| Permission | Grants |
|---|---|
| `*` | everything below, plus `*` on every pattern |
| `view-pattern-list` | open the admin list page. This is the entry point: pattern-level grants do nothing without it |
| `create-pattern` | the "Add pattern" button; also needed (with `edit-pattern` on the source) to Duplicate |
| `manage-themes` | the Themes list and theme editor, and the sidenav Themes link |
| `manage-tenants` | the Tenants list on a multi-tenant platform root |
| `auth-users` | Auth → Users (on the auth pattern) |
| `auth-groups` | Auth → Groups (on the auth pattern) |
| `view-as` | impersonate a user from Auth → Users (on the auth pattern) |

`manage-themes`, `manage-tenants`, `auth-users` and `auth-groups` don't need `view-pattern-list`.

### Pattern level

| Permission | Grants on that pattern |
|---|---|
| `*` | everything below; on page/datasets patterns also every content permission, as always |
| `edit-pattern` | open the Pattern Editor and use every tab except Access; the list row's name link and Edit action |
| `edit-pattern-permissions` | the Access tab (permissions + row filters). Separate from `edit-pattern` because it can grant itself `*` |
| `delete-pattern` | Delete (list row and Overview) |

Content permissions (`view-page`, `edit-page`, `view-sources`, …) never grant admin access.

## Rules

- **Open patterns.** A pattern with no grants to any user or non-`public` group is open: anyone who
  can reach the list page (`view-pattern-list`) has full control of it, except Duplicate, which still
  needs `create-pattern`. (`public` is ignored because the Access editor seeds
  `public: ['view-page']` into everything it saves.)
- **The auth and admin rows are never open.** Their Access tab holds the site's own grants. Managing
  them needs site `*`, `${app} Admin`, or an explicit grant on the row. They're never duplicated or
  deleted.
- **Duplicate** needs site `create-pattern` plus `edit-pattern` (or `*`) on the source pattern.
- **No "unconfigured → allow".** Unlike `utils/auth.js` `isUserAuthed`, a site whose admin row and
  auth pattern grant nothing lets in only `${app} Admin`. The Users/Groups sidenav links follow the
  rule the auth manage routes declare in `reqPermissions`, which allows any logged-in user while the
  auth pattern grants nothing beyond `public`.
- **Known gap: route `reqPermissions` don't block.** `dms-manager/_auth.js` `getReqAuth` keeps the
  `authPermissions` of the *last* matched route config, and child routes carry none, so the check
  always sees "nothing configured" and lets the user through. `/auth/manage/users` and
  `/auth/manage/groups` therefore open for any logged-in user who types the URL (the auth server
  still limits the data), and the same applies to datasets' `view-sources`. **Users and Groups are now
  gated inside the page** (`patterns/auth/pages/useManagePageGate.js`): same rule as the links; logged
  out → login, no permission → `/`. Datasets' `view-sources` still has no working gate.
- **Logged-out users** are sent to login; logged-in users without access to a page are sent to `/`.
  Nothing is judged while `user.isAuthenticating` (the stale `groups: ['public']` seed on refresh).

## Pattern Editor tabs

| Tab | Needs |
|---|---|
| Access (`permissions`) | `edit-pattern-permissions` |
| every other tab (Overview, Theme, Pages, Data Sources, Activity, Page Templates, Format Manager, a pattern's custom `pages`) | `edit-pattern` |

With no tab in the URL the editor opens the first tab the user can use. A tab named in the URL that
the user can't use shows a "no permission" message. The sidenav lists only the usable tabs.

## Access editor options

What the Access tab's permission dropdown **offers** (`permissionOptionsFor`). Saved values that
aren't offered are kept and can still be removed.

| Pattern type | Offers |
|---|---|
| `admin` | `*` + the site-level list |
| `auth` | `*` + `auth-users`, `auth-groups`, `view-as`; plus the site-level list while the admin row grants nothing |
| `page` | `*` + pattern-level list + `view-page` … `publish-page` |
| `datasets` | `*` + pattern-level list + `view-page` (labelled "View Pattern": the server needs it to load the pattern row) + `view-sources` + the per-source list (pattern-level grants are defaults for every source) |
| anything else | `*` + pattern-level list |

## Behaviours worth knowing

- **Patterns saved through the Access tab stay public.** The editor seeds `public: ['view-page']`, and
  the server counts `public` for every visitor. Remove the `public` grant to make a pattern (and its
  pages) private.
- **The client and the server disagree about `${app} Admin`.** The admin panel lets Admin-group and
  site-`*` users manage every pattern, but the server only returns a pattern row to users the pattern
  itself grants. For a pattern that doesn't list them, the Pattern Editor says the pattern "could not
  be loaded for your account". This is intended (decided 2026-09-30): site-level admin grants never let the server hand out a
  pattern row. Grant the group on the pattern itself.
- **You are always kept on the grants you edit.** If neither you nor your groups would hold anything,
  the Access editor adds you as a user with `*`. On the admin row you can still lock yourself out by
  downgrading your own group; that's blocked with a warning unless you're in `${app} Admin`.

## Server reads

- `dms-server/src/routes/dms/dms.route.js`: a non-auth, non-admin **pattern row** loads for users
  holding `view-page`, `edit-pattern`, `edit-pattern-permissions` or `delete-pattern` (otherwise the
  `no-access` stub). **Page rows** stay `view-page`-only, so admin permissions never expose page
  content. Auth and admin pattern rows are never stubbed: don't store secrets on them.
- **Sync does no per-row permission filtering.** `/sync/bootstrap` and `/sync/delta` return every row
  in scope to any client (or any logged-in client with `DMS_SYNC_AUTH=1`). With sync on, the read
  gate above is not a security boundary.
