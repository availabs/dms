# User menu: show the group that gives access here, not an arbitrary one

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built + verified (2026-10-26), uncommitted · **Created by:** ssangdod@albany.edu · **Edited by:** —

## Objective

The user menu shows a group under the user's email. Today that is `user.groups[0]`. That list comes
from the server unordered, so a user in several groups sees one picked by database order, which
looks random and can change between logins.

The menu should show the group that gives the user access on the pattern they are on. That includes
a group granted only for the current subdomain of a per-subdomain grant (`{"*": {...}, "<sub>": {...}}`).

## Current behavior

- **Three menus read `user.groups[0]`:**
  - `patterns/page/components/userMenu.jsx:48` (`UserMenu`, used by page and datasets layouts)
  - `patterns/admin/components/menu.jsx:42`
  - `patterns/auth/components/menu.jsx:53`
- **Where the list comes from:** `buildUserObject` (`dms-server/src/auth/handlers/auth.js`) uses
  `q.getUserGroups` (`auth/utils/queries.js:36`), which has no `ORDER BY`. On Postgres the order
  is whatever the join returns.
- **What is already available on the client:**
  - `CMSContext.authPermissions` is the pattern's grants, already narrowed to the current subdomain.
    `pattern2routes` resolves it with `resolveSubdomainAuthPermissions(pattern.authPermissions,
    SUBDOMAIN)` (`render/spa/utils/index.js:473`).
  - The admin and auth patterns get their own resolved grants (`index.js:284–313`). The admin row
    falls back to the auth row when it grants nothing.
  - `user.meta` carries `{ group, authLevel }` for each group.
- **Page overrides:** a page can override the pattern's grants (merged by `isUserAuthed` in
  `patterns/page/siteConfig.jsx:177`). The menu sits in the layout and doesn't know the page.

## Plan

### 1. One shared picker, `pickDisplayGroup` in `utils/auth.js`

Next to `isUserAuthed`, so all three patterns use it without cross-pattern imports:

```js
pickDisplayGroup({ user, authPermissions, app }) → string | ''
```

How it picks:

1. **Groups that grant something here.** These are the user's groups with a non-empty grant in the
   resolved `authPermissions`. `public` is left out, because everyone has it and the Access editor
   seeds it.
2. **Rank them:**
   - a `*` grant first;
   - then the grant with the most permissions;
   - then `${app} Admin`;
   - then the higher project `authLevel` (from `user.meta`);
   - then by name, so ties always break the same way.
3. **No group grants anything here.** This covers access through a direct user grant, an open
   pattern with no grants, or the level fallback. Show the user's highest-level project group, then
   the first by name.
4. **No groups at all:** show nothing.

Because `authPermissions` is already resolved for the subdomain, a group granted only on `songs`
shows on `songs.<host>` and not on the root. That is the subdomain case you asked for. One thing to
verify: a subdomain entry *replaces* `*` rather than merging with it (`parsed[subdomain] ||
parsed['*']`). That is the server's rule too. If the entry should instead merge onto `*`, that would
be a separate, bigger change to access itself, not just to the menu.

### 2. Use it in all three menus

Replace `user.groups[0]` with `pickDisplayGroup({ user, authPermissions, app })` from each pattern's
own context (`CMSContext` for page and datasets, the admin and auth contexts for theirs).

- **View As:** this needs no extra work. The menu already reads the viewed user from `AuthContext`,
  so it shows that user's group. I'll check it live.
- **Tooltip:** when the user is in more than one group, a `title` lists all their project groups,
  with the shown one first. This uses no new markup or theme keys.

### 3. Make the server's order stable

Add `ORDER BY gip.auth_level DESC, uig.group_name` to `getUserGroups`. Anything else that reads
`groups[0]` then also gets a stable answer. This doesn't change what any group grants.

### 4. Things to verify, and maybe expand

- **Page overrides:** the menu sits in the layout, so it would show the pattern-level group even on a
  page that overrides grants. Should it follow the page? That needs the current page's
  `authPermissions` in the layout (through `MountContext` or a small page context). My plan: check
  whether the layout can already see the page item. If it can't, leave it at pattern level and note
  it as a follow-up.
- **Datasets source pages:** a source can override grants too (`SourcePage.jsx:147`). The same
  question applies; same answer as page overrides.
- **Patterns with no grants set:** these are open (the lenient rule), so they fall to step 3: the
  highest-level group.
- **Per-item menu gating** (`userMenu.jsx:332`, `item.groups`): this already checks all groups, not
  `[0]`. No change.
- **Branch:** this is on master. `permissions_move` touches neither these menus nor
  `getUserGroups`, so the later merge should be clean. Task 16 (platform admin) may add AVAIL
  membership to `user.groups`. The ranking only counts groups that grant something on the pattern,
  so AVAIL won't win on a site that doesn't name it.

## Decisions (owner, 2026-10-26)

- Pattern level only: no page-level or source-level overrides in the menu.
- The rest of the plan as written.

## What was built

- **`rankUserGroups({ user, authPermissions, app })`** in `utils/auth.js`. This is the planned
  `pickDisplayGroup`, but it returns the whole ranked list: `[0]` is the group shown, and the list is
  the tooltip.
- **`PatternAuthContext`** (`utils/patternAuthContext.js`): `{ app, authPermissions }`.
  `pattern2routes` provides it in the per-route wrapper, which was a `React.Fragment` and is now the
  Provider. This was needed because the "UserMenu" widget (`page/components/userMenu.jsx`) renders
  in every pattern's layout, and only page routes have a `CMSContext`. The admin and auth menus read
  the same context, so the three agree.
  - For the admin pattern, this is the admin row's grants, or the auth row's when the admin row has
    none (as resolved in `pattern2routes`).
- **The three menus** show `groups[0]` with `title` = all groups, only when there is more than one.
- **`getUserGroups`:** `ORDER BY gip.auth_level DESC, uig.group_name`.
- **View As (corrected from the plan):** the menu header shows the signed-in user's email, not the
  viewed user's, and that is unchanged. So the group shown is the signed-in user's too, which keeps
  the email and group consistent. The View As banner and menu items name the viewed user, as before.

## Results

- Unit (`utils/auth.test.js`, vitest): 6/6, covering:
  - a group granted only on a subdomain;
  - `*`, then breadth, then name;
  - Admin, then level;
  - `public` never shown;
  - direct user grant / open pattern;
  - no groups.
- `test-auth`: 105/105, with a new check that groups come back highest level first. It would fail
  without the `ORDER BY`, because SQLite returns rows in insertion order. Run on the sqlite-only copy.
- Build ✓.
- Live, on the rig (:3458 on master code, legacy mode; Vite :5197). viewer@ was put in Viewers +
  Downloaders, both level 1; the server returned `Downloaders, Viewers`. The Dashboard got
  `{"*": Viewers view-page, songs: + Downloaders view-page + edit-page}` and `subdomain: "*"`.
  - `localhost:5197/` → **Viewers** (tooltip `Viewers, Downloaders`)
  - `songs.localhost:5197/` → **Downloaders**
  - `/datasets` → Downloaders (granted on pattern 4)
  - `/auth/manage/profile` → Downloaders (neither group granted on the auth row; equal level, so by name)
  - admin@ → `v6test Admin` on `/`, `/list` and the auth pages
  - Rig restored afterwards. DB backup taken first: `srv3458/dms-server/src/db/data/rig.pre-usermenu.sqlite`.
- Rig note: a pattern with no `subdomain` serves only the root domain, so a subdomain check needs the
  pattern set to `"*"`, or to the subdomain.

## Files

- `packages/dms/src/utils/auth.js`: `rankUserGroups`
- `packages/dms/src/utils/patternAuthContext.js` (new)
- `packages/dms/src/render/spa/utils/index.js`: provides `PatternAuthContext`
- `packages/dms/src/patterns/page/components/userMenu.jsx`
- `packages/dms/src/patterns/admin/components/menu.jsx`
- `packages/dms/src/patterns/auth/components/menu.jsx`
- `packages/dms-server/src/auth/utils/queries.js`: `ORDER BY` in `getUserGroups`
- `packages/dms/src/utils/auth.test.js` (new); `packages/dms-server/tests/test-auth.js` (order check)

## Testing checklist

- [x] Unit: a per-subdomain grant (group only on `songs`) is shown on `songs` and not on the root
- [x] Unit: `*` beats a narrower grant; ties go by name; `public` is never shown
- [x] Unit: a user granted directly, or on a pattern with no grants, gets the highest-level group
- [x] Server: `getUserGroups` order is stable (test-auth)
- [x] Live (scratch server + Vite 5199, never 5173): a user in two groups on a pattern with a
      subdomain grant sees the right group on each subdomain, in the page, datasets, admin and auth menus
- [x] View As: not changed. The menu shows the signed-in user (see What was built)
