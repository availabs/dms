# Fix nav2Level baseUrl bug and move to page pattern

## Bug

The `nav2Level` function in `Layout.jsx:48-63` computes depth-2 sidenav items by matching the current pathname against nav item paths. It strips the path to `level-1` segments using:

```js
let levelPath = '/'+path.replace('/edit','').split('/').filter(d => d).filter((d,i) => i < level-1).join('/')
```

This produces `/<first-segment>` for `navDepth=2`. For a pattern with `baseUrl='/'` and a page at `/assess_risk/some-child`, `levelPath` becomes `/assess_risk`, which matches the parent nav item and returns its `subMenus`.

But for a pattern with `baseUrl='/guide'`, a page at `/guide/resources` produces `levelPath=/guide`. The nav items from `dataItemsNav` have paths like `/guide/resources`, `/guide/some-other-page` — none of them match `/guide` because `/guide` is the baseUrl prefix, not a page slug. The function falls through to `output || items` and returns the top-level items instead of depth-2 submenus.

**Root cause:** `nav2Level` doesn't know about `baseUrl`, so it can't distinguish baseUrl segments from page slug segments when computing the level path.

## Current Code

### `nav2Level` — `src/ui/components/Layout.jsx:48-63`

```js
// --- move below function into page pattern
function nav2Level(items, level=1, path, navTitle='') {
  let output = null
  if(level > 1) {
    let levelPath = '/'+path.replace('/edit','').split('/').filter(d => d).filter((d,i) => i < level-1).join('/')
    let matchItems = items.map(d => {
      return {...d, path: d?.path?.replace('/edit','') }
    })
    let matches = matchRoutes(matchItems, {pathname: levelPath })
    output = matches?.[0]?.route?.subMenus || []
    if(navTitle && matches?.[0]?.route?.name) {
      output = [{name: matches?.[0]?.route?.name, className: navTitle},...output]
    }
  }
  return output || items
}
```

Note the existing comment: `// --- move below function into page pattern`

### Usage in Layout — `Layout.jsx:78-83`

```js
const navs = (nav) => {
  return {
    "main": (nav2Level(navItems, +nav.navDepth, pathname, nav?.navTitle) || []).filter(page => !page.hideInNav),
    "secondary": secondNav
  }
}
```

`navDepth` and `navTitle` come from the theme's `layout.options.sideNav` or `layout.options.topNav`.

## Decision: Option 1 — Move nav2Level to page pattern via resolver function

The chosen approach is to move `nav2Level` out of `Layout.jsx` into the page pattern. The page pattern already has `baseUrl` and `pathname` available, so it can build a resolver function that Layout calls per-nav. This follows the existing comment in the code (`// --- move below function into page pattern`) and keeps Layout as a generic, pattern-agnostic UI component.

### Why a resolver function, not pre-resolved items

Layout's `navs` function is called separately for `sideNav` and `topNav`, each with its own `navDepth` and `navTitle`:

```js
// Current Layout code
const navs = (nav) => ({
  "main": nav2Level(navItems, +nav.navDepth, pathname, nav?.navTitle),
  "secondary": secondNav,
})
// called as navs(sideNav) and navs(topNav)
```

`sideNav` might have `navDepth=2` while `topNav` has `navDepth=1`. Pre-computing a single resolved list would lose this per-nav flexibility. Instead, the page pattern passes a **resolver function** that Layout calls with each nav's `navDepth` and `navTitle`, and the function closes over `baseUrl` and `pathname`.

## How Layout props work now vs. after

### Current flow

Layout receives raw `navItems` and internally computes depth-resolved items via `nav2Level` using `pathname` from `useLocation()` and `navDepth`/`navTitle` from theme options. This couples Layout to page-pattern-specific routing logic (`matchRoutes`).

```
Page pattern → navItems (all pages) → Layout
                                        ↓
                                    navs(sideNav) → nav2Level(navItems, sideNav.navDepth, pathname)
                                    navs(topNav)  → nav2Level(navItems, topNav.navDepth, pathname)
                                        ↓
                                    SideNav / TopNav get resolved items
```

### New flow

The page pattern creates a `resolveNav(navDepth, navTitle)` function that closes over `navItems`, `pathname`, and `baseUrl`. Layout receives this function and calls it per-nav with the nav's own `navDepth`/`navTitle` from theme options.

```
Page pattern → creates resolveNav(navDepth, navTitle) closing over baseUrl, pathname, navItems
             → passes resolveNav + navItems to Layout
                                        ↓
Layout:     navs(sideNav) → resolveNav(sideNav.navDepth, sideNav.navTitle)
            navs(topNav)  → resolveNav(topNav.navDepth, topNav.navTitle)
                                        ↓
                              SideNav / TopNav get correctly resolved items
```

### Layout's navigation flexibility is preserved

Layout currently accepts these nav-related props:
- `navItems` — primary navigation items (array of `{path, name, subMenus, ...}`)
- `secondNav` — secondary navigation items

Layout reads from `layout.options` in the theme to decide:
- Whether to show sideNav/topNav (`size !== 'none'`)
- Which nav source to use (`nav: 'main' | 'secondary' | 'none'`)
- Which widget menus to render (`topMenu`, `bottomMenu`, `leftMenu`, `rightMenu`)
- Which style to apply (`activeStyle`)

**All of this stays the same.** Layout gains one new optional prop:
- `resolveNav` — `(navDepth, navTitle) => items[]` — optional function to resolve nav depth. If not provided, Layout uses `navItems` directly.

The `navs` function in Layout becomes:

```js
const navs = (nav) => ({
  "main": (resolveNav
    ? resolveNav(+nav.navDepth, nav?.navTitle)
    : navItems
  ).filter(page => !page.hideInNav),
  "secondary": secondNav,
})
```

Non-page patterns (admin, auth, forms, datasets) don't pass `resolveNav`, so Layout falls back to using `navItems` directly — no changes needed for those patterns.

### Theme options interoperability

The `navDepth` and `navTitle` settings remain in `layout.options.sideNav` / `layout.options.topNav` and are still configurable via the theme editor (`Layout.theme.jsx`). Layout still reads these values from theme options when calling `resolveNav` — the settings are consumed in exactly the same place. The only difference is that the route-matching logic (`matchRoutes`, `baseUrl` awareness) now lives in the resolver function provided by the page pattern rather than being hardcoded in Layout.

## Other patterns using Layout

Surveyed all Layout call sites across all patterns:

| Pattern | Files | navItems usage | navDepth affected? |
|---------|-------|---------------|--------------------|
| **page** | view.jsx, edit/index.jsx, error.jsx, manager/layout.jsx, manager/design.jsx, search/SearchPage.jsx | Dynamic from dataItems | **Yes** — view.jsx & edit/index.jsx use navDepth |
| **admin** | siteConfig.jsx (×2), errorPage.jsx | Static menu items | No — no navDepth |
| **auth** | siteConfig.jsx (×2) | Static menu items or empty | No |
| **forms** | siteConfig.jsx (×2), error.jsx, manage/layout.jsx, manage/design.jsx | Static or empty | No |
| **datasets** | siteConfig.jsx (×3), error.jsx | Empty arrays | No |

Only the **page pattern's view.jsx and edit/index.jsx** use dynamic nav items with `navDepth`. All other patterns pass static items or empty arrays, so `nav2Level` (which returns items unchanged when `level <= 1`) is a no-op for them.

The page pattern's other Layout call sites don't need changes either:
- `error.jsx` — passes `navItems={[]}`, no depth
- `manager/layout.jsx` — passes static `managerNavItems`, no depth
- `manager/design.jsx` — design preview, passes `menuItems` but navDepth is irrelevant in the preview frame
- `search/SearchPage.jsx` — passes `menuItems`, no depth override

## Files to Change

1. **`src/ui/components/Layout.jsx`** — Remove `nav2Level` function, remove `matchRoutes` import, add `resolveNav` prop, update `navs` to use it
2. **`src/patterns/page/pages/_utils/index.js`** — Add `nav2Level` function with `baseUrl` parameter
3. **`src/patterns/page/pages/view.jsx`** — Create `resolveNav` callback, pass to Layout
4. **`src/patterns/page/pages/edit/index.jsx`** — Same as view.jsx

## Implementation

### 1. Move `nav2Level` to page pattern `_utils`

Add to `src/patterns/page/pages/_utils/index.js`:

```js
export function nav2Level(items, level = 1, path, baseUrl = '', navTitle = '') {
  let output = null
  if (level > 1) {
    // Strip baseUrl prefix and /edit to get the relative page path
    let relativePath = path.replace('/edit', '')
    if (baseUrl && relativePath.startsWith(baseUrl)) {
      relativePath = relativePath.slice(baseUrl.length)
    }
    let levelPath = baseUrl + '/' + relativePath.split('/').filter(d => d).filter((d, i) => i < level - 1).join('/')
    let matchItems = items.map(d => ({
      ...d, path: d?.path?.replace('/edit', '')
    }))
    let matches = matchRoutes(matchItems, { pathname: levelPath })
    output = matches?.[0]?.route?.subMenus || []
    if (navTitle && matches?.[0]?.route?.name) {
      output = [{ name: matches?.[0]?.route?.name, className: navTitle }, ...output]
    }
  }
  return output || items
}
```

### 2. Update view.jsx and edit/index.jsx

Create a `resolveNav` callback that closes over `menuItems`, `pathname`, and `baseUrl`. Layout will call it with each nav's `navDepth` and `navTitle`:

```js
import { dataItemsNav, nav2Level, ... } from './_utils'

// existing menuItems memo stays the same
const menuItems = React.useMemo(() => {
  return dataItemsNav(dataItems, baseUrl, false)
}, [dataItems])

// resolver function — Layout calls this per-nav with the nav's own navDepth/navTitle
const resolveNav = React.useCallback((navDepth, navTitle) => {
  return nav2Level(menuItems, navDepth, pathname, baseUrl, navTitle)
}, [menuItems, pathname, baseUrl])

<Layout navItems={menuItems} resolveNav={resolveNav} ...>
```

### 3. Update Layout.jsx

Remove `nav2Level` and `matchRoutes`. Add optional `resolveNav` prop. If provided, use it to resolve items per-nav; otherwise fall back to raw `navItems`:

```js
// Remove: import { matchRoutes } from 'react-router';
// Remove: entire nav2Level function (lines 47-63)

const Layout = ({
  children,
  headerChildren,
  footerChildren,
  navItems=[],
  secondNav,
  resolveNav,  // new: optional (navDepth, navTitle) => items[]
}) => {
  const { theme: defaultTheme = {layout: layoutTheme} } = React.useContext(ThemeContext);
  const { sideNav={}, topNav={}, activeStyle } = cloneDeep(defaultTheme?.layout.options) || {}
  const theme = merge(cloneDeep(defaultTheme?.layout?.styles?.[activeStyle || 0] || defaultTheme))

  const navs = (nav) => ({
    "main": (resolveNav
      ? resolveNav(+nav.navDepth, nav?.navTitle)
      : navItems
    ).filter(page => !page.hideInNav),
    "secondary": secondNav,
  })

  // ... rest unchanged
}
```

Layout can also drop the `useLocation` import if nothing else uses `pathname` (currently only `nav2Level` used it).

## Testing

1. Navigate to a pattern with non-root baseUrl (e.g. `/guide`) that has `navDepth=2`
2. Verify depth-2 child pages appear in the sidenav when viewing a parent page (e.g. `/guide/resources` shows child pages)
3. Verify patterns with `baseUrl='/'` still work (e.g. `/assess_risk` shows depth-2 items)
4. Verify edit mode nav also works with depth-2
5. Verify admin, auth, forms, datasets patterns still render their navs correctly (no regressions from Layout simplification)
6. Verify topNav with navDepth also works correctly
