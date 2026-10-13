// Site user menus: the links in the signed-in avatar menu (page pattern
// UserMenu, patterns/page/components/userMenu.jsx, which reads
// theme.navOptions.authMenu.navItems).
//
// Stored on the site's admin pattern row as `user_menus`. That row is already
// in the boot payload: the site load expands every pattern ref's full `data`
// (api/proecessNewData.js), and the server lets everyone read admin rows
// (dms-server dms.route.js), so rendering a menu costs no extra request and it
// rides along in the cached site snapshot. Page templates live in their own
// rows because they're large and only the editor needs them; a menu is a few
// hundred bytes that every page render needs.
//
//   user_menus: [{ id: 'default', name: 'Default menu', items: [navItem, …] }]
//   navItem:    { name, path, icon?, groups?: string[] } | { type: 'separator' }
//
// `groups` gates a link to members of any listed group (userMenu.jsx already
// applies it). v1 has only the default menu, and every pattern uses it. More
// menus and a per-pattern choice come later; the array shape leaves room.
//
// Never store anything secret here: admin rows are readable by everyone.

export const DEFAULT_USER_MENU_ID = 'default';
export const DEFAULT_USER_MENU_NAME = 'Default menu';

const parse = (value) => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return undefined; }
};

export function getUserMenus(adminPattern) {
  const menus = parse(adminPattern?.user_menus);
  return Array.isArray(menus) ? menus.filter(m => m && typeof m === 'object') : [];
}

// The default menu's items, or null when the site hasn't saved one. null keeps
// each theme's own authMenu (and userMenu.jsx's fallback); an empty array is a
// real choice, a menu with no links of its own.
export function getDefaultUserMenuItems(adminPattern) {
  const menu = getUserMenus(adminPattern).find(m => m.id === DEFAULT_USER_MENU_ID);
  return Array.isArray(menu?.items) ? menu.items : null;
}

// Fresh, normalized copies: links need a name and a path, `groups` keeps only
// non-empty strings and is dropped when empty, and dividers that would lead,
// trail or double up are removed.
export function sanitizeMenuItems(items) {
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'separator') {
      if (out.length && out[out.length - 1].type !== 'separator') out.push({ type: 'separator' });
      continue;
    }
    const name = `${item.name ?? ''}`.trim();
    const path = `${item.path ?? ''}`.trim();
    if (!name || !path) continue;
    const groups = (Array.isArray(item.groups) ? item.groups : [])
      .filter(g => typeof g === 'string' && g.trim());
    out.push({
      name,
      path,
      ...(item.icon ? { icon: item.icon } : {}),
      ...(groups.length ? { groups } : {}),
    });
  }
  while (out.length && out[out.length - 1].type === 'separator') out.pop();
  return out;
}

// `theme` with the site menu as its authMenu. A new object: the theme registry
// entries are shared module objects and must not be written to. `source: 'site'`
// lets admin/auth chrome (adminNavOptions) tell a saved site menu from a theme's
// own authMenu, and `themeNavItems` keeps the theme's own items (the editor's
// "reset to theme default" target).
function withUserMenuItems(theme, items) {
  if (!Array.isArray(items) || !theme || typeof theme !== 'object') return theme;
  const own = theme.navOptions?.authMenu;
  return {
    ...theme,
    navOptions: {
      ...(theme.navOptions || {}),
      authMenu: {
        ...(own || {}),
        source: 'site',
        navItems: sanitizeMenuItems(items),
        themeNavItems: own?.source === 'site' ? own.themeNavItems : own?.navItems,
      },
    },
  };
}

// A theme's own authMenu items, whether or not a site menu was applied over it.
export function themeOwnMenuItems(theme) {
  const authMenu = theme?.navOptions?.authMenu;
  return authMenu?.source === 'site' ? authMenu.themeNavItems : authMenu?.navItems;
}

// Applies the site menu to every theme in a registry (pattern2routes), so each
// pattern's getPatternTheme picks it up whichever theme it selects. (A pattern
// selecting a theme the registry doesn't have gets the bare library theme from
// getBaseTheme, and so no site menu; its theme is already missing.) No saved
// menu → the registry comes back untouched.
export function withUserMenuThemes(themes, items) {
  if (!Array.isArray(items) || !themes || typeof themes !== 'object') return themes;
  const out = {};
  for (const [name, theme] of Object.entries(themes)) out[name] = withUserMenuItems(theme, items);
  if (!out.default) out.default = withUserMenuItems({}, items);
  return out;
}

// A pattern's own menu: links saved in its theme override
// (pattern.theme.navOptions.authMenu.navItems, set through the Pattern Editor's
// Theme tab or theme JSON). MitigateNY has 64 of these. null when it has none.
export function patternOwnMenuItems(pattern) {
  const theme = parse(pattern?.theme);
  const items = theme?.navOptions?.authMenu?.navItems;
  return Array.isArray(items) ? items : null;
}

// Precedence (owner, 2026-10-09): a pattern's own menu wins over the site's
// Default menu. pattern2routes passes every pattern through this before its
// config builds a theme. Returns a copy (never the row itself) whose theme's
// authMenu carries:
//   patternId     — so a live change to this pattern's own menu finds it
//                   (resolveUserMenuItems, utils/userMenuContext.js)
// and, for a pattern with its own menu:
//   source: 'pattern'
//   siteNavItems  — the Default menu at boot, shown if the own menu is removed live
//   _replace: ['navItems'] (only when a Default menu is saved) — getPatternTheme's
//                   mergeTheme swaps the whole list in. Without it, lodash merge
//                   laid the pattern's links over the Default menu position by
//                   position: a 3-link own menu over a 6-link Default menu showed
//                   links 4-6 of the Default menu, and each own link inherited
//                   fields it didn't set (groups included).
export function withPatternMenuPrecedence(pattern, siteItems) {
  if (!pattern || !pattern.id || pattern.id === 'no-access') return pattern;
  const theme = parse(pattern.theme) || {};
  const authMenu = theme?.navOptions?.authMenu || {};
  const own = patternOwnMenuItems(pattern);
  return {
    ...pattern,
    theme: {
      ...theme,
      navOptions: {
        ...(theme.navOptions || {}),
        authMenu: {
          ...authMenu,
          patternId: `${pattern.id}`,
          ...(own ? {
            source: 'pattern',
            siteNavItems: Array.isArray(siteItems) ? siteItems : null,
            ...(Array.isArray(siteItems) ? { _replace: [...new Set([...(authMenu._replace || []), 'navItems'])] } : {}),
          } : {}),
        },
      },
    },
  };
}

// The links a user menu shows, from the theme's (merged) authMenu and the live
// values in SiteUserMenuContext ({ items, patternMenus }). Order:
//   1. this pattern's own menu (live if it changed since boot, else boot)
//   2. the site's Default menu (live, else boot)
//   3. the theme's own items
// undefined → userMenu.jsx's built-in fallback.
export function resolveUserMenuItems(authMenu, live = {}) {
  const pid = authMenu?.patternId;
  const liveOwn = pid != null ? live.patternMenus?.[pid] : undefined;
  const own = liveOwn !== undefined ? liveOwn : (authMenu?.source === 'pattern' ? authMenu.navItems : null);
  if (Array.isArray(own)) return own;
  const siteDefault = live.items !== undefined
    ? live.items
    : authMenu?.source === 'site' ? authMenu.navItems
    : authMenu?.source === 'pattern' ? authMenu.siteNavItems
    : null;
  if (Array.isArray(siteDefault)) return siteDefault;
  return authMenu?.source ? authMenu.themeNavItems : authMenu?.navItems;
}

// Admin and auth-manage chrome swap in the admin theme's own navOptions, which
// would drop the site menu. Carry it over, but only a saved site menu: a theme's
// own authMenu has never shown in admin chrome, and still doesn't.
export function adminNavOptions(theme) {
  const nav = theme?.admin?.navOptions || theme?.navOptions;
  const siteMenu = theme?.navOptions?.authMenu;
  // themeNavItems dropped: after a reset (utils/userMenuContext.js) admin chrome
  // falls back to its own default, never to a theme's items.
  return siteMenu?.source === 'site' && nav ? { ...nav, authMenu: { ...siteMenu, themeNavItems: undefined } } : nav;
}
