# Site app settings: per-tenant icon, name and colours; installable as an app (PWA)

**Initiatives:** [plat_tenant_hub](../../../../../planning/initiatives/plat_tenant_hub.md) · **Status:** doing · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

Every tenant on the hub gets its own favicon, home-screen icon, app name and colours, edited on the
tenant's settings page, and each tenant's site can be installed as an app (a progressive web app)
from its own domain. Today the favicon and tab title are baked into the build
(`%VITE_DMS_FAVICON%` / `%VITE_DMS_TITLE%` in `index.html`, from `deploy/targets.json`), so every
tenant served by the hub's one build shows the same icon, and nothing makes a site installable
(`public/manifest.json` is a stale TransportNY file that nothing links).

It is also the base for Web Push (chat notifications, Phase 3): that needs a service worker, and
iOS delivers web push only to a site installed to the home screen.

## Design

### Where the settings live

On each site's **own site row**, `data.app_settings` (JSON) — the tenant's `{app}` site row for a
tenant, the hub's for the hub's own site. Not the platform's tenant row: branding is the site's, and
the same code then serves single-tenant deployments.

```js
app_settings: {
  name, short_name,              // fallbacks: the site row's site_name, then VITE_DMS_TITLE
  theme_color, background_color, // '#rrggbb'
  icon: { version },             // set by the icon upload; absent = no icon of its own
}
```

### Icons

One square upload (PNG, JPEG, WebP or SVG; 512px or larger advised, 5 MB at most). `sharp` (already a
dms-server dependency) writes, to file storage (`dama/storage`, local disk or Garage):

    app-icons/<app>/<version>/source.png        the upload, normalised to 1024px PNG
                               icon-32.png       favicon
                               icon-180.png      apple-touch-icon, flattened on background_color
                               icon-192.png
                               icon-512.png
                               icon-maskable-512.png   the icon at 80% on background_color (Android's safe zone)

`version` is a hash of the source and the background colour, so a new upload or a new background
colour makes new files under a new folder (and the old folder is removed). Browsers cache favicons
hard; a new address is the only reliable way to make them refetch.

### Served by host (dms-server, `routes/appSettings/`)

The request's Host names the site, by the same resolver the server already uses
(`utils/subdomain.js resolveHost` → tenant subdomain → tenant row → app; the hub's own app when
there is no tenant; `DMS_APP` on a single-tenant server).

| Path | Answer |
|---|---|
| `/manifest.webmanifest` | the settings as a manifest (`display: standalone`, `start_url: /`) |
| `/icon-{32,180,192,512}.png`, `/icon-maskable-512.png` | streamed from storage; immutable when `?v=` is the current version |
| `/favicon.ico` | the 32px icon, when the site has one (else falls through to the build's file) |
| `/sw.js` | the service worker, `no-cache` |

Static-hosted sites (the `sites/` middleware) answer their hosts before these routes, so they are
untouched.

### Page head (SSR)

`mountSSR` takes an optional `getHeadTags(req)`; dms-server passes the app settings' one. For a site
with settings it adds the manifest link, `theme-color`, the favicon and apple-touch-icon (with
`?v=`), `apple-mobile-web-app-title`, and the service worker's registration, and drops the build's
own `<link rel="icon">`. A site with no settings gets nothing new (the build's favicon stays).

### Service worker (v1)

Small on purpose: navigations go to the network, and only when it fails does an offline page show.
Nothing is cached, so a deploy is never hidden behind an old copy. Asset caching and the `push`
handler come later.

### Editing

`AppSettingsCard` on the tenant's settings page (`/list/tenants/:id`, `tenantOverview.jsx`), beside
domains and data environments: the icon (upload, replace, remove), name, short name, and the two
colours, with a preview of the browser tab and the home-screen tile.

Routes, beside the pgEnvs ones (`routes/tenants`):

    GET  /tenants/:tenant/app-settings          settings + a data-URL preview of the 192px icon
    POST /tenants/:tenant/app-settings          { name, short_name, theme_color, background_color }
    POST /tenants/:tenant/app-settings/icon     body: the image (application/octet-stream)
    POST /tenants/:tenant/app-settings/icon/remove
    (the same under /hub/app-settings for the hub's own site)

Who may: hub staff (`manage-tenants` on the hub), or the site's own admins with `manage-themes` on
its site row.

## Phases

### Phase 1 — settings, icons, routes, head, editing card (built and checked on the local hub 2026-11-18)

- [x] `dms-server/src/routes/appSettings/store.js`: read/write `app_settings`, icon generation, host → app
- [x] `dms-server/src/routes/appSettings/index.js`: admin routes + public routes + `headTags(req)`
- [x] `dms-server/src/index.js`: register; pass `getHeadTags` to `mountSSR`
- [x] `render/ssr2/express/setup.mjs` + `middleware.mjs`: optional `getHeadTags`
- [x] `admin/components/appSettingsCard.{jsx,theme.js}` on `tenantOverview.jsx`, and on the site's own
      `/list/settings` (`siteSettings.jsx`: the tenant's admins with manage-themes; the hub's own site at the root)
- [x] `admin.format.js`: document `app_settings` on the site format

### Phase 2 — standalone polish

- [ ] `viewport-fit=cover` and safe-area insets where the theme draws edge-to-edge (chat composer, nav)
- [ ] iOS status bar style
- [ ] The hub's own site: the card on its site settings page

### Later

- [ ] Web Push (`push` handler in the service worker; chat-notifications-and-mentions.md Phase 3)
- [ ] A pattern-level override (chat on its own subdomain installs as its own app)

## Testing

Done without the hub (2026-11-18), since another session runs it on 5555:
- [x] Icon drawing (sharp, local storage in the scratchpad): every size right; 180 and maskable flattened on the
      background, 512 kept transparent; maskable padded to 80%.
- [x] SSR middleware with a stub handler: tags added and the build's favicon dropped; no settings or a
      failing `getHeadTags` leaves the page as before.
- [x] Routes with the store stubbed: manifest JSON and headers, icons immutable only at the current `?v=`,
      `/favicon.ico` = icon-32, unknown sizes fall through, `/sw.js` no-cache, editing routes 401 without a token.

On the hub (needs a restart to load the new routes):

- [ ] Upload an icon for a tenant on the local hub: favicon, apple-touch-icon and manifest icons change on that tenant's host only
- [ ] Change the background colour: maskable and apple icons regenerate under a new version
- [ ] Remove the icon: the build's favicon returns
- [ ] Chrome devtools Application → Manifest: no errors, installable
- [ ] Real devices: Android Chrome install, iOS Safari Add to Home Screen

## Log

- **2026-11-18** — Planned with the owner. Paused for the owner to review this doc before
  implementing. Already drafted before the pause (untested, not run): `routes/appSettings/store.js`
  and `index.js`, their registration and `getHeadTags` in dms-server's `index.js`, the `getHeadTags`
  option in `ssr2/express/setup.mjs` + `middleware.mjs`, and `admin/components/appSettingsCard.theme.js`.
  The card itself and the `tenantOverview.jsx` change are not written.
- **2026-11-18** — Owner said go. Card written and placed on the tenant page; `app_settings` documented on
  the site format; offline checks above. Not added: a `byKey` edit rule for `app_settings` on the site
  format (a Falcor write of the field is judged by the site's default edit rule; the routes judge their
  own callers). Lint: only the pre-existing prop-types errors.
- **2026-11-18** — Owner expected the card on the tenant's own `/list/settings`; added it there. Ran the
  hub checks above on chat.localhost and left chat as it was (no icon, fields cleared). The test left
  a service worker registered for chat.localhost in that browser; it only passes navigations through.
- **2026-11-18** — Owner asked for chat's settings in the Tessera look: the v6 mark
  (`public/themes/tessera/tessera-mark-v6.svg`, the side nav's small logo), paper `#f6f5f0` for theme and
  background, short name "Chat", name left to the tenant's ("AVAIL Chat"). Found: an SVG was rasterised at
  density 300 (a 24-unit mark → 100px) and scaled up to 1024, blurry; `saveIcon` now draws an SVG at the
  density that makes it 1024px. Icons checked by eye: sharp at every size.
