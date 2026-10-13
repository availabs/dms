# User menu editor: the site's default user menu, edited in the Pattern Editor

**Initiatives:** [dms_page_editor_admin](../../../../../planning/initiatives/dms_page_editor_admin.md) · **Status:** done · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** —

**Topic:** patterns/admin · **Started:** 2026-10-08 · **Built:** 2026-10-09 · **Completed:** 2026-10-09

> Supersedes `editable-user-menu.md` (2026-10-08), which is in the submodule's `stash@{0}` ("design")
> with the v6 port work. Drop that file when the stash is restored; everything in it is folded in here.

## Objective

Let an admin edit the links in the signed-in avatar menu from the admin UI instead of theme JS.
Before this, the only control was `theme.navOptions.authMenu.navItems` in code: only the two
TransportNY themes set it, and every other site got a hardcoded Datasets/Manager fallback.

## Decisions (owner, 2026-10-09)

- It's a **tab in the Pattern Editor** ("User Menu"), not a site-level admin page.
- The UI calls it the **Default menu**. v1 has one menu and **every pattern uses it**. Later: more
  menus, and each pattern either builds its own or picks one of the admin's menus.
- Per-link visibility is by **groups**, which userMenu.jsx already supports. Permission-based
  visibility (e.g. "anyone with manage-themes") is not wanted.
- Storage has to be efficient to load (see below).

## Storage and loading

The menus live on the **site's admin pattern row** (`{instance}|admin:pattern`) as `user_menus`:

```js
user_menus: [{ id: 'default', name: 'Default menu', items: [
  { name: 'Data', path: '/data', icon: 'Database' },
  { type: 'separator' },
  { name: 'Manager', path: '/list', icon: 'Settings', groups: ['Riverbend Admin'] },
] }]
```

**No extra request to render it.** Every pattern already gets the admin row at boot:

- The site load expands every pattern ref with its whole `data` (`api/proecessNewData.js`: the
  default ref projection includes `data`), so the admin row comes down in the same request as every
  other pattern. It's also in the cached site snapshot.
- The server lets everyone read auth and admin rows (`dms-server dms.route.js`), so logged-out and
  non-admin visitors get the real row, not a "no-access" stub. **Never store secrets on it.**
- `pattern2routes` already picks the admin row (`pickAdminPattern`). It now applies the default menu
  to every theme in the registry once (`withUserMenuThemes`), so each pattern's `getPatternTheme`
  picks it up whichever theme it selects.

**Why not separate rows like page templates?** Templates are `{pattern}|page_template` rows loaded
on demand only by the editor, because they're large (full section trees) and render never needs
them. A menu is a few hundred bytes and every page render needs it. Separate rows would cost a
request per boot, or a new ref list on the site row expanding in the same request. If menus ever
grow large or numerous, the ref-list option keeps them in the boot request; the array shape on the
admin row migrates to that cleanly.

**Later, per pattern:** a pattern row gets a choice of `'default'`, a menu id, or its own inline
items. `pattern2routes` resolves it per pattern instead of per registry. That's a small change in
the same place.

## What was built

| File | Change |
|---|---|
| `packages/dms/src/utils/userMenus.js` (new) | Shape + helpers: `getUserMenus`, `getDefaultUserMenuItems` (null = unset, `[]` = an empty menu on purpose), `sanitizeMenuItems` (drops incomplete links and stray dividers), `withUserMenuItems`/`withUserMenuThemes` (copies, never writes the registry; marks `source: 'site'` and keeps the theme's own items as `themeNavItems`), `themeOwnMenuItems`, `adminNavOptions`. |
| `packages/dms/src/render/spa/utils/index.js` | One line after `pickAdminPattern`: `themes = withUserMenuThemes(themes, getDefaultUserMenuItems(savedAdminPattern))`; passes `adminPatternRow` to every pattern config (for the tab gate). |
| `packages/dms/src/patterns/admin/siteConfig.jsx`, `patterns/auth/siteConfig.jsx` | Admin and auth-manage chrome replaced `navOptions` wholesale with `theme.admin.navOptions`, which dropped any menu. Now `adminNavOptions(theme)` carries over a **saved site menu only**; a theme's own authMenu still doesn't show in admin chrome (unchanged). Sidenav tab entry "User Menu" (`user_menu`, icon `Menu`). |
| `packages/dms/src/patterns/admin/pages/patternEditor/index.jsx` | `userMenuTab` registered on every pattern type. |
| `packages/dms/src/patterns/admin/pages/patternEditor/userMenuEditor.{jsx,theme.js}` (new) | The tab. Theme key `admin.userMenuEditor`. |
| `packages/dms/src/utils/userMenuContext.js` (new), `render/spa/dmsSiteFactory.jsx`, `patterns/page/components/userMenu.jsx` | Live updates without a reload (see below). |
| `packages/dms-server/src/routes/sync/ws.js`, `packages/dms-server/tests/test-sync.js` | WS skeleton-row filter fix + regression test (see below). |
| `packages/dms/tests/userMenus.test.js` (new) | 15 tests, including who gets the tab. |
| `src/themes/tessera/design_system_v6/pages/admin-pattern-user-menu.html` (dms-template) | The mockup, synced to the build. Not yet in `ds-nav.js` (that file has stashed edits; add `{ f: "admin-pattern-user-menu.html", t: "Pattern — user menu" }` to the admin section after the stash is restored). |

### The tab (userMenuEditor.jsx)

- **Loads the admin row fresh** with `apiLoad` (type `adminPatternType(siteInstance)`), not from the
  boot snapshot, so it never edits stale data. Saves with `apiUpdate({ data: { id, user_menus } })`,
  a partial edit by id that leaves other admin-row fields alone. Other menus in `user_menus` are
  preserved (forward-compatible).
- **Unsaved site:** seeds from what pages show today: this pattern's theme's own authMenu, else the
  fallback, with the Datasets link pointed at the site's real datasets mount
  (`AdminContext.datasources`). That fixes the out-of-the-box 404 from UX log issue #2 once an author
  saves. A notice says the links come from the theme.
- **Links:** each link is one row (grip, icon, label, path, audience chip) that opens to edit inline:
  - label and link;
  - icon: a searchable picker over `theme.Icons`;
  - who sees it: "everyone signed in" or "only some groups". Groups are picked with a searchable
    `UI.MultiSelect` (the same control the Permissions component uses for group access), from
    `AuthAPI.getGroups` plus any group already on a link. A draft-only `_restricted` flag (dropped
    by `sanitizeMenuItems`) keeps the picker open while no group is picked yet.
  - Remove, up/down and drag to reorder. Dividers too.
- **Always-included rows:** Profile / View As / sync / Logout are listed read-only.
- **Preview** shows exactly what one viewer gets: "anyone signed in" or a member of one group,
  picked from a searchable single-select `UI.MultiSelect` (scales to long group lists), with a count
  of links hidden from that viewer. Live-checked with 18 groups.
- **Save:** a save bar appears only when the draft differs. Save is disabled while a link is missing
  its label or link.
- **Reset to theme default** (asks to confirm) writes `user_menus` without the default entry.
- **No admin row yet:** the tab says so and points to `/list`, which backfills the row.
- **Permissions (owner, 2026-10-09):** edit access to the **admin pattern row** is enough, since the
  tab only writes that row: `patternCan(user, app, authPermissions, adminRow, EDIT_PATTERN)`. The open
  pattern's own grants and Manage Themes don't matter. The admin row's Access tab only offers
  site-level grants, so in practice that's `*` on the admin row or `${app} Admin`, the same check
  that opens the admin pattern's own editor. With no admin row yet, a core-row stand-in means only
  site `*` passes. `pattern2routes` passes the row as `adminPatternRow` (AdminContext). Both tab
  lists gate it the same way. (UI-only like every admin check: `dms.data.edit` has no server-side
  authorization.)

## Per-pattern menus: a pattern's own menu wins (owner, 2026-10-09)

**Found:** MitigateNY already has hand-set menus. 64 of 82 patterns carry their own
`pattern.theme.navOptions.authMenu.navItems`, in 5 distinct sets; e.g. MitigateNY_2025 (985070, serves
`/` on the root domain) has Site Manager · Playground · Cenrep · Documentation→/guide · Admin. With a
Default menu saved, lodash merge laid each own menu over it position by position, which garbled the
list and leaked fields (groups) between links.

**Decision:** a pattern's own menu wins. The tab is per pattern.

**Built:**
- `utils/userMenus.js`:
  - `patternOwnMenuItems(pattern)`.
  - `withPatternMenuPrecedence(pattern, siteItems)`, called by `pattern2routes` on every pattern copy
    (never the row). It stamps `authMenu.patternId`. For an own menu it also adds `source: 'pattern'`,
    `siteNavItems` and, when a Default menu exists, `_replace: ['navItems']`, so `mergeTheme` swaps the
    list whole.
  - `resolveUserMenuItems(authMenu, live)`: own menu (live, else boot) → Default menu (live, else
    boot) → the theme's items → undefined (fallback).
- `userMenu.jsx` uses the resolver. `SiteUserMenuContext` also carries `patternMenus` (live own
  menus by pattern id). `DmsSite` refreshes it on sync invalidations for any `…:pattern` row.
- `pattern2routes` passes `userMenuUsage = { total, own: [{id, name}] }` to configs (AdminContext).
- The tab:
  - "menu for this pattern: Default menu | own menu", preselected from the pattern row.
  - Own menu edits this pattern's theme and needs edit-pattern on it. A new own menu starts as a copy
    of the Default menu.
  - Switching back to Default removes the own menu on save. It writes `authMenu: null` because the
    SQLite merge (`json_patch`) is deep and only null clears a key; Postgres `||` is shallow, so null
    is harmless there.
  - The Default menu needs edit on the admin row; without it, it's read-only.
  - The subtitle says which menu this pattern uses. The scope pill shows the real reach ("used by N of
    M patterns", or "only <pattern>"). The patterns with their own menu are listed under a `details`.
  - Tab visible with edit on this pattern OR on the admin row.
- 7 new unit tests (whole-list replace, no leaking, live both ways, admin chrome). 93/93 across the 4
  admin/menu test files.
- **Live, sync on, local sqlite stack:**
  - Dashboard → own menu + new link → `/` shows it without a reload, and `/datasets` (Default) doesn't.
  - Datasets tab: "Default menu · used by 2 of 3 patterns · 1 other pattern has its own menu".
  - Dashboard back to Default → `/` drops it live and after a reload, and the stored theme has no
    authMenu.

**Not done:** the boot-time `userMenuUsage` count doesn't update live in other tabs. It's correct
after a page load.

## Live updates without a reload (2026-10-09)

Reported by the owner: with sync on, a saved menu didn't show in another open tab until a refresh,
even though opening the admin panel there showed the new data.

**Why:** the menu reaches pages through the themes, and `pattern2routes` builds those once per
page load. Rebuilding routes on every change would remount the whole site.

**Fix:**
- `utils/userMenuContext.js` (new): `SiteUserMenuContext` = `{ items, publish }`.
  - `items: undefined` → use the boot themes.
  - `items: null` → the site has no saved menu now; use the theme's own items.
  - `items: array` → the saved menu.
- `render/spa/dmsSiteFactory.jsx` (`DmsSite`) provides it above the router. With sync on, it
  listens to `onInvalidate` for `data_items:<app>+…|admin:pattern` scopes (debounced 150 ms), reads
  the admin row back from the local mirror (`getItemsByAppType`), and sets `items`. Sync fires that
  scope for this tab's own writes (`localUpdate`) and for WS changes from other tabs and users.
- `patterns/page/components/userMenu.jsx` prefers `items` over the theme's `authMenu`. For `null`
  it uses `themeOwnMenuItems`. It also stopped mutating the theme's items (`item.type = 'link'`
  → copies).
- The User Menu tab calls `publish(saved)` after a save, so this tab updates even with sync off.
- `adminNavOptions` drops `themeNavItems`, so after a reset, admin chrome falls back to its own
  default, never to a theme's items (unchanged rule).

**Server bug found on the way (dms-server, `routes/sync/ws.js`):**
- The WS broadcast filter for pattern-subscribed clients let skeleton rows through only if the type
  ended in the legacy `|pattern`. Current rows are `{site}|{name}:pattern` and `{name}:site`, so
  since the type refactor **no edit to any pattern or site row** (theme selection, filters,
  permissions, the admin row) reached a tab that had loaded a pattern. The tab subscribes to its
  pattern, so the filter applies.
- Fixed with `isSkeletonType()`: `getKind(type)` is `pattern` or `site`, with the legacy check
  kept. Theme rows are still not broadcast to pattern subscribers (large, and they weren't before).
- Regression test `testWebSocketSkeletonRowsReachPatternSubscribers` in `tests/test-sync.js`. It
  fails on the old filter. `test-sync.js` results: 90 passed, 0 failed.

**Live (local sqlite stack + Playwright):**
- Sync on, two tabs in one browser: the site tab's avatar menu shows the new link with no reload.
- Sync on, two separate browsers: same.
- Sync off: the saving tab's own menus update; other tabs update on their next page load, since
  there's no push channel.

## Necessity check (2026-10-09)

- **Live read is required.** With the dms-server fix in place but `userMenu.jsx`'s live read
  switched off, another browser did not update without a reload, nor after navigating to admin
  and back. It did after a reload. With the live read back on, it updated in all three cases.
  Routes (and their themes) are built once per page load; a sync change only re-runs route
  loaders.
- **The server fix is required.** Against the unfixed server the other tab got no invalidation at
  all.
- **Removed as unnecessary:** the `user_menus` attribute on the pattern format (`admin.format.js`
  is back to HEAD). Boot loads each pattern's whole `data`, and the tab loads and saves with
  explicit fields. `withUserMenuItems` is no longer exported.

## Verification (2026-10-09)

- `npx vitest run packages/dms/tests/userMenus.test.js` + adminPatternRow / adminThemeLogo /
  adminPermissions: 86/86 pass. The full client suite has 3 failures in `avlGraphThemeDefaults` and
  `syncDeltaConvergence`, which import nothing this task changed.
- **Live, fully local:**
  - Setup: scratch sqlite dms-server on 3457, second Vite on 5199, Playwright, site created through
    the UI with the Dashboard template.
  - Tab: seeded Datasets/Manager from the theme; renamed, added a group-gated link with a searched
    icon, added a divider, saved.
  - Stored row: `user_menus` as designed, with the trailing divider sanitized away.
  - Reload: shows the saved menu, with no theme notice.
  - Avatar menu shows it in the page pattern (`/`), the datasets pattern (`/datasets`) and the
    admin/Pattern Editor chrome.
  - Reset (with confirm) clears it back to the theme's links. An external URL link saved fine.

## Known gaps / follow-ups

- [ ] A pattern selecting a theme missing from the registry gets the bare library theme and so no
      site menu (`getBaseTheme`). Its theme is already missing; documented in `userMenus.js`.
- [x] ~~After a save, open tabs keep the old menu until their next page load.~~ Fixed (see "Live
      updates"). With sync off, other tabs still need a page load.
- [ ] The unsaved-site fallback in `userMenu.jsx` still hardcodes `/datasets` (UX log #2). It's fixed
      for any saved menu. Fixing the fallback itself means touching `userMenu.jsx`, which has stashed
      v6 edits, so do it after the stash is restored.
- [x] ~~`userMenu.jsx` mutates `item.type = 'link'` on theme items.~~ Now copies.
- [ ] Later: named menus (tabs in this page) + a per-pattern choice ("default menu" / a named menu /
      custom). Mockup state B.
- [ ] Add the mockup to `ds-nav.js` once the stash is restored.

## Testing checklist

- [x] Unit: sanitize, unset-vs-empty, registry not mutated, reaches `getPatternTheme` and
      `getAdminTheme`, theme-only authMenu still kept out of admin chrome.
- [x] Live: edit, save, reload, render in page/datasets/admin chrome, reset.
- [ ] A non-admin user in/out of a gated link's group (gating is userMenu.jsx's existing logic,
      unchanged).
- [ ] Sync-on build (`VITE_DMS_SYNC=1`): the admin-row write goes through local sync.
- [ ] A TransportNY site: its theme's 3 group-gated items seed the tab, and appear unchanged until saved.
