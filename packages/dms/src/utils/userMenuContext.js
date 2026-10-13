import { createContext } from 'react';

// User menus kept live after boot. Routes (and so the themes that carry the
// menus, see utils/userMenus.js) are built once per page load, so a menu saved
// later would otherwise only show after a reload. DmsSite
// (render/spa/dmsSiteFactory.jsx) provides this above the router and refreshes
// it when sync reports a change to a pattern row (another tab or user) or when
// the Pattern Editor's User Menu tab saves (this tab).
//
//   { items, patternMenus, publish(items), publishPattern(id, items) }
//   items: the site's Default menu (the admin row)
//          undefined → nothing newer than the boot themes; use them
//          null      → the site has no Default menu now
//          array     → the Default menu
//   patternMenus: { [patternId]: array | null } — patterns' own menus changed
//          since boot (null: the pattern no longer has one)
// Read through utils/userMenus.js resolveUserMenuItems.
export const SiteUserMenuContext = createContext({ items: undefined, patternMenus: {}, publish: () => {}, publishPattern: () => {} });
