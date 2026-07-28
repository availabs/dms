# userMenu: per-item `groups` gating for authMenu items

> **Status:** ✅ DONE 2026-07-17 (verified live).
> **Ask (Alex):** the transportny theme's "Site Status" userMenu item should point at
> `/sitemgmt` (the control room) and only render for users in the **AVAIL** or
> **NYSDOT Admin** groups.

## Change (additive/BC)

`patterns/page/components/userMenu.jsx` (`UserMenuContainer`): after the existing
`type: 'link'` normalization, `authMenuItems` is filtered by a new optional per-item key —

```js
{ name: "Site Status", icon: "Settings", path: "/sitemgmt", type: "link",
  groups: ["AVAIL", "NYSDOT Admin"] }
```

An item with `groups: [...]` renders only when `user.groups` intersects it. Items without the
key render exactly as before (every existing theme is unaffected). Anonymous users never see
the authed menu anyway; a logged-in user outside the listed groups simply doesn't get the item.

Consumer: `src/themes/transportny/themev2.js` `navOptions.authMenu.navItems` — Site Status
re-pointed `/status` → `/sitemgmt` + gated to AVAIL / NYSDOT Admin. (The v1 `theme.js` copy of
the item is out of scope per the sync recipe.)

## Deploy notes

- Theme (themev2.js) syncs to transportNY via the theme-folder sync; **core userMenu.jsx rides
  Alex's dms git sync** (never hand-copied). Until the git sync lands, an old bundled core
  ignores `groups` → the item shows UNGATED at the new path (accepted degradation, noted in the
  theme comment).
- `/sitemgmt` is the npmrds-subdomain control room; on other subdomains the link 404s the same
  way the old `/status` link did (the userMenu has no cross-subdomain scheme — candidate future
  enrichment: honor the ButtonNode `sub://` convention here).
