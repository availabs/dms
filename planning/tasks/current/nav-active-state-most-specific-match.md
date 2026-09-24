# Nav active state: the most specific matching item wins

**Status:** SCOPED 2026-09-24. Not started.

## What you see

On TransportNY, open any individual report (`/npmrds/reports/single_route`). The left rail
highlights nothing. The Reports item only lights up on the landing page `/npmrds/reports`. The same
happens on a data source page (`/datasources/.../<id>`): Data Sources isn't highlighted.

**Why it matters:** the nav is the reader's "you are here". Losing it on every page beneath a nav
item is most visible on the 65 report pages, but it applies to any page that has no nav row of its own.

**After the fix:** a page highlights the nav item it sits beneath, and when two items both match,
only the more specific one lights up.

## Evidence (live, 2026-09-24)

| Page | devtny.org (pre-09-22 library) | localhost (current library) |
|---|---|---|
| `/npmrds/reports/single_route` | Reports highlighted | nothing highlighted |
| `/npmrds/reports` | Reports | Reports |
| `/npmrds/macro` | Macro View | Macro View |
| `/datasources/.../<id>` | (prefix rule, would match) | nothing highlighted |
| `/list/themes` | (prefix rule: Sites **and** Themes) | Themes only (correct) |

So this is a **regression from `d91ed328` (2026-09-22)** in local and dev builds. Deployed sites still run
the older library, so no live site shows it yet. It ships everywhere on the next deploy.

## Root cause

`ui/components/SideNav.jsx` `SideNavItem` → `routeMatch`:

- **Before 09-22:** every item used `useMatch({ path: `${firstPath}/*` })`, a prefix match.
- **Since 09-22:** a **leaf** (no `subMenus`) matches its own path **exactly**. A header matches if the
  pathname is under any child. The code comment explains why: admin's "Sites" item's path is the
  pattern's `baseUrl`, so a prefix match made it "always active" on every admin page.

The exact-match rule fixes the root item but breaks every leaf that has pages beneath it. Leaves are
common:

1. **Authored navs are always leaves.** TransportNY NPMRDS uses `sideNav.nav: "secondary"`, four
   hand-written items (Home, Macro View, Reports, MAP-21 PM3) with no children. The 65 report pages
   are page-tree children of Reports (page 2188366), but the rail isn't built from the page tree.
2. **Page-tree items whose children are all `hide_in_nav`**: `getChildNav` (`utils/nav.js:60`) drops
   hidden children, so the parent becomes a leaf.
3. **Deeper routes under a leaf**, e.g. the datasets pattern's `/datasources/source/<id>`, and `/edit/...`.

**TopNav has drifted the other way.** `TopNav.jsx:156-164` still uses the pre-09-22 rule on the
first path only. A root item or a path-less header (`'' + '/*'`) matches everything, which is the
over-match that SideNav's rewrite fixed. It's older than 09-22 but has the same cause. Not yet
checked: which TopNav sites (MNY?) actually have a root or path-less item that shows it.

## Proposed fix

One shared resolver, used by both SideNav and TopNav (they've drifted twice already):

- `utils/navActive.js`: `resolveActiveNav(items, pathname) → Set<item>`. Flatten the rendered menu
  (items plus `subMenus`, each item's `path` string or array, absolute same-origin URLs reduced to their
  pathname like today's `toPathname`). An item **matches** if `pathname === path` or `pathname`
  starts with `path + '/'` (segment-bounded, so `/reports` never matches `/reports_old`). The
  **longest** matching path wins. That item and its ancestors are active.
- `VerticalMenu` / TopNav's menu computes it once and passes the result down. `SideNavItem` / `NavItem`
  read it instead of each running `matchPath` independently.
- `/list/themes`: Themes (`/list/themes`) beats Sites (`/list`), so Sites stays off. The 09-22 intent
  is preserved. On `/list` itself Sites lights up. An admin page with no nav row lights its closest
  ancestor.

**Optional author knob** (in keeping with author empowerment): `activePaths: ['/tsmo/incident_view']` on an
authored navItem, for pages whose URL isn't nested under the item. `/tsmo/incident_view` belongs
under Incident Search but no URL rule can know that. These paths feed the same resolver.

## Open questions

- The rail's bottom menu (Data Sources, Docs) is a widget. Check whether it renders through
  `SideNavItem` (and so inherits this) or has its own matching.
- `sub://` / cross-subdomain destinations: keep today's "foreign origin never matches".

## Files

- `packages/dms/src/utils/navActive.js` (new) + unit tests (pure function: the table above as cases)
- `packages/dms/src/ui/components/SideNav.jsx`: `VerticalMenu`, `SideNavItem`, `SubMenu`
- `packages/dms/src/ui/components/TopNav.jsx`: replace `matchBase`/`useMatch`
- `skills/traversing-dms-pages.md`: nav active-state rule

## Testing checklist

- [ ] Unit: exact, nested, sibling-prefix (`/reports` vs `/reports_old`), root item vs specific item,
      path-less header, array paths, absolute same-origin, foreign origin, `/edit/` paths
- [ ] `http://www.localhost:5173/npmrds/reports/single_route`: Reports highlighted (matches devtny)
- [ ] `/npmrds/reports`, `/npmrds/macro`, `/npmrds/home`: unchanged
- [ ] `/list/themes`: Themes only. `/list`: Sites only
- [ ] a `/datasources/.../<id>` page: Data Sources highlighted
- [ ] an MNY TopNav page: its root/Home item no longer lights on every page
