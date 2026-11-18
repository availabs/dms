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

- **"Remove from site" previews come from read-only plan routes.** The Users and Groups remove dialogs
  fetch `/user/project/remove/plan` / `/group/delete/plan` (dms-server auth), which compute what the
  removal would do and never write. The destructive routes take no `dryRun` flag: a server that doesn't
  know such a flag deletes. Against a server without the plan routes the dialog says "This server can't
  preview the removal" and keeps a generic description; Remove stays enabled either way.

## Server reads

- `dms-server/src/routes/dms/dms.route.js`: a non-auth, non-admin **pattern row** loads for users
  holding `view-page`, `edit-pattern`, `edit-pattern-permissions` or `delete-pattern` (otherwise the
  `no-access` stub). **Page rows** stay `view-page`-only, so admin permissions never expose page
  content. Auth and admin pattern rows are never stubbed: don't store secrets on them.
- **Sync does no per-row permission filtering, except for `reach`.** `/sync/bootstrap` and
  `/sync/delta` return every row in scope to any client (or any logged-in client with
  `DMS_SYNC_AUTH=1`). With sync on, the read gate above is not a security boundary — for every row
  but a reach-limited one (below), which sync judges like a Falcor read and the live socket sends as a
  notification only.

## Reach: what reaches a row without naming anyone on it

Two things reach a row without naming anyone on it: **inheritance** (a rule's owner positions spread
the grants of the rows above: the pattern's over a page's, the env's over a source's, the site's `*`
escape) and **the admin shortcut** (`${app} Admin` is allowed everything before any rule is read). A
row can switch either off with `reach`, inside its own grants value (`authPermissions` on DMS rows,
`auth_permissions` on sources). Task: `planning/tasks/current/auth-reach.md`.

```js
auth_permissions: {
  users: { "12": ["view-source", "edit-source-data"] }, groups: {},
  reach: { inherit: false, override: false },
}
```

| Switch | Absent | `false` |
|---|---|---|
| `inherit` | grants of the rows above apply | only this row's own grants apply, to it and everything under it |
| `override` | `${app} Admin` is allowed everything | the shortcut doesn't apply to this row or anything under it: admins need a grant like anyone |

| Access editor preset | `inherit` | `override` | Use |
|---|---|---|---|
| Normal | on | on | every row without a `reach` |
| Only people named here | off | on | a private draft page; a PII dataset in a shared env. Admins can still recover it |
| Hidden from site admins | on | off | a team's env every source inherits from, kept from IT staff |
| Private | off | off | chat DMs: exactly the people named, nobody else, ever |

- **Found by walking up.** The effective reach of a row is read along the walk its owner positions
  take (`owners.js reachFor`): `inherit: false` on the row or an ancestor cuts every owner position above
  that row; `override: false` on the row or any ancestor removes the shortcut. The core reads data; it
  names no kind.
- **No `reach` = before.** Nothing changes for a row with no reach on itself or above it.
  `view: false`, the older source-only spelling, is read as `inherit: false`.
- **A limited reach is never "blank".** A row that grants nothing is readable by anyone (the blank-row
  rule); a row under a limited reach that grants nothing is readable by no one, and a pattern's
  `publicRead` doesn't open it.
- **Enforced under every mode.** A decision about a reach-limited row bites under `DMS_AUTH_MODE=log`
  too, and over a surface's own `mode: 'log'` (vector tiles of such a source need a signed-in request).
- **Changing it is a grants edit**, judged by the row's grants-edit rule. Once `override: false` is
  stored, the admin shortcut doesn't help that edit either: only someone the row names can undo it.
- **A save that leaves `reach` out keeps the stored one** (`grants.js carryReach`), so an older client
  rebuilding `{ groups, users }` can't drop it. To clear it, send `reach: {}`.
- **Guard rail.** `override: false` is refused on the site row and pattern rows (their rules say
  `adminAlways: true`): it would lock the site's admins out of the site. The Access editor offers
  only `inherit` on a pattern, nothing on the site row, and nothing on a section (a section's reads
  are open on the server, so `reach` couldn't make one private).
- **Capability.** A server that predates `reach` ignores it, so a private row would be readable there
  (it fails open). The Falcor path `dms.capabilities` answers `{ reach: true }` on a server that
  enforces it; an older one answers an empty atom. The client reads it once at boot
  (`api/index.js loadServerCapabilities` → `utils/serverCapabilities.js`) and `UI.Permissions` shows
  the presets only when it is true (prop `reachSupported` overrides; `reachSwitches` limits which
  switches a row may set).
- **Not covered.** Files stored by the upload routes are served from `/files/…` by path, unjudged; a
  row's Yjs collaboration room (`/sync/subscribe` `join-room`) is not judged either; and a page's
  sections are not under the page on the server's walk (a section row's walk goes to the pattern), so
  a page's reach does not reach its sections. Task for the first: `planning/tasks/current/gated-file-downloads.md`.

## The row's creator, and rule variants

Two additions to the rule language (`dms-server/src/routes/auth/judge.js`, client copy
`utils/authJudge.js`; `planning/tasks/current/auth-rule-creator.md`):

- **`{ perms, creator: true }`** — the verb, held by the row's **creator**: its `created_by` column,
  which the server writes from the verified user on create and no client can set (a `created_by` key in
  a payload is just data). On a create the caller is the creator. Usable wherever a requirement is
  (`byKey`, `default`, an op, inside `anyOf`). A refusal reads `missing <verb> as the row's creator`.
  Split rows are judged without their data, so the write guard reads their `created_by` from the split
  table (`dms.controller.js getSplitRowCreators`); main-table rows carry it from `getRowsForWrite`.
- **`fieldsFrom: 'rule'`** on an edit spec — its `byKey` / `default` decide every key, ahead of the
  governing vocabulary's field claims. Needed under an env: its `descendants` vocabulary gives
  `update-source` the `'*'` claim (declared for sources), which would otherwise answer for a data row's
  every key.
- **Rule variants.** A kind's rule is global per site, so a rule for SOME rows of a kind is declared as
  a variant: `rules: { '<kind>@<name>': rule }` in a format (chat: `'data@chat_message'`). A variant is
  no kind's rule by itself. A row names the variant for the rows of a kind beneath it —
  `data.ruleVariants: { data: 'chat_message' }` on chat's env row — and `owners.js ruleFor` takes the
  nearest ANCESTOR naming one the site's `formats` declare; a name not declared (not registered yet) is
  passed over, so the kind's own rule answers. Only registered declarations are chosen this way (never a
  stamp or the built-in copy).
  - **Changing `ruleVariants`** on a stored row takes site `*` (or `<app> Admin`), as `authRules` does
    (`index.js rulesWrite`): whoever could change it could pick a weaker rule for the rows beneath. A
    create may set it (nothing is beneath a new row).
  - **Rows under no variant are judged exactly as before**: every dataset row keeps the shared `data` rule.

## Who a row's grants name: `GET /dms/:app/rows/:id/grantees`

The auth API's user and group lists are for people who manage users (`auth-users`). A reader
sometimes needs a narrower answer: who else does this row let in? (Chat's New message dialog: the
people the chat pattern is granted to.) `GET /dms/:app/rows/:id/grantees` answers
`{ users: [{ id, email }] }`: the users the row's own grants name (the entry for the request's
subdomain, both buckets of a scoped grant), directly or as members of a group granted any verb there.

- **Who may ask:** anyone who may read the row (`authorize(read)`, enforced under every mode, so a
  reach-limited row answers only its own grantees). Signed out: 401; not a reader: 403.
- **What it leaves out:** `public` (everyone), grants lent from rows above (only the row's own), every
  other user field. The auth table has no name besides the email.
- Generic: it names no kind or pattern. `dms-server/src/routes/auth/grantees.js`; test
  `tests/test-grantees.js`.
