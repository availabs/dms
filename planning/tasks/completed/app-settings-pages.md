# An app's Settings as pluggable sub pages, one definition for the app and the hub's tenant page

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** done (2026-11-27, owner: committed and deployed) · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

**Project:** DMS library (admin pattern, plugin host) · **Topic:** patterns/admin · **Created:** 2026-11-25

## Objective

Every app gets a **Settings** section in its admin, multi-tenant or not, made of sub pages the way a pattern's
admin is (Overview, Theme, Access, Pages, …, and the tabs its type adds). Apps, pattern types and plugins can
add sub pages to it. One definition is rendered in both places a hub shows an app's settings. The root
**Storage** page moves under it. (Owner, 2026-11-25.)

## Current state

- **Settings only exists on multi-tenant sites, and it is built twice.** A tenant's settings are two pages that
  each assemble the same card components by hand:

  | Where | Page | Cards |
  |---|---|---|
  | the tenant's own host, `/list/settings` (`/list/domains` too) | `patterns/admin/pages/siteSettings.jsx` | Domains, Data environments, App & icon |
  | the hub's root, `/list/tenants/:tenantId` | `patterns/admin/pages/tenantOverview.jsx` | Domains, Data environments, App & icon, **Plugins** |

  They have drifted already: the Plugins card is only on the hub's copy. Both say in a comment that "when the
  cards outgrow it they become sub pages, as the pattern editor's tabs are".
- **A single-site app has no Settings**; its App & icon card can't be reached.
- **Storage** (`pages/siteStorage.jsx`, `/list/storage`, `manage-storage`) and the server's **Plugins** install
  page (`pages/plugins.jsx`, `/list/plugins`, hub only) are root admin pages with their own nav items.
- **The cards' server routes exist only for a hub.** Data environments and Plugins call `/tenants/:tenant/…`
  (or `/hub/…` for the hub's own site), mounted on a multi-tenant server only (`routes/tenants/index.js`);
  App & icon calls `/tenants/:tenant/app-settings` or `/hub/app-settings` (`routes/appSettings`), where `/hub`
  always means the server's own `DMS_APP`. So on a single-site server two of the three cards have no route, and
  on a server that answers many apps (dmsserver.availabs.org behind the Netlify sites) `/hub/…` would act on
  the wrong app.
- **Extension today:** a pattern type adds Pattern Editor tabs with `admin.editorTabs` (qa's Configure), and a
  plugin that registers a pattern type can do the same. Nothing can add an app-level page: the plugin host's
  kinds are pattern types, section types, column types, format functions, widgets, themes and data types.

## Proposed design

### One list of sub pages

A Settings sub page is

```js
{ name, path, icon, order, component, can: ({ user, app, authPermissions, isMultiTenant, tenantSubdomain, hub }) => bool,
  forTenant: true | false }   // false: only on the app's own Settings, never on the hub's page for another tenant
```

The component receives the app it configures (`{ app, type, tenant }`: the current site on its own Settings,
the tenant on the hub's tenant page), never reads "the current site" from context, so the same component
serves both places.

Built in:

| Sub page | Path | Shown | From |
|---|---|---|---|
| Overview | `overview` | always | Domains (tenants of a hub with a root domain), Data environments, App & icon: today's cards |
| Plugins | `plugins` | the site's activations (`activate-plugins`) | `components/pluginsCard.jsx`, now on both pages |
| Storage | `storage` | `manage-storage` | `pages/siteStorage.jsx`, moved; `/list/storage` redirects |
| Server plugins | `server_plugins` | the server's hub, `install-plugins` (`usePluginHub`) | `pages/plugins.jsx`, moved; `/list/plugins` redirects. `forTenant: false` |

### Where it renders

- **Every app:** `/list/settings/:sub?`. The admin sidenav gets the open app's Settings group, as the open pattern
  gets its own group (`siteConfig.jsx`'s pattern group). No sub page in the URL opens the first one the user
  can use; a sub page they can't use shows "You do not have permission", as the Pattern Editor does.
- **The hub's tenant page:** `/list/tenants/:tenantId/:sub?` renders the same list for that tenant (its header
  stays), skipping `forTenant: false` pages. `tenantOverview.jsx` and `siteSettings.jsx` become thin wrappers
  around one `SettingsPages` component.
- Old paths keep working: `/list/domains` → `settings/overview`, `/list/storage` → `settings/storage`,
  `/list/plugins` → `settings/server_plugins`.

### How it is extended (three doors, one list)

1. **The app:** `registerSettingsPages([...])`, exported from the library, beside `registerPatternTypes`.
2. **A plugin:** a new host kind, `host.registerSettingsPages([...])`, added to `KINDS` in `plugins/index.js`
   with owner tracking like the others, so an installed (run-time) plugin can add a page. It shows only where
   the plugin is active, like its other contributions.
3. **A pattern type:** `admin.settingsPages` on its definition, beside `admin.editorTabs`, for settings that
   belong to the app rather than to one pattern of that type. Shown when the app has a pattern of that type.

All three land in one registry (`patterns/admin/settingsRegistry.js`); a path registered twice is refused with
a warning (the first wins), and the built-in paths are reserved. A row in
`documentation/extension-points.md` for each door.

### The server: the same routes by app, on every server

`/_dms/apps/:app/pgenvs` (+ `/attach`, `/detach/plan`, `/detach`), `/_dms/apps/:app/plugins` (+ `/set`) and
`/_dms/apps/:app/app-settings` (+ `/icon`, `/icon/remove`), mounted on every server, beside the tenant and hub
routes (which stay, unchanged, for the hub's tenant page and older clients). The handlers are shared: each
route family is registered once per base with a function that resolves the app (`:app`, a tenant's app, or the
hub's). Judging is unchanged: the verb on that app's own site row (`manage-domains` to read data environments,
`activate-plugins`, `manage-themes`), or the server's staff (`manage-tenants` on the server's `DMS_APP`), who
alone attach or detach a data environment. An app with no site row on this server is 404. The app's own
Settings always uses these routes; the hub's tenant page keeps `/tenants/:tenant/…`. On an older server (404)
a card says the server doesn't offer it yet.

### Permissions

Each sub page's `can` uses the existing site verbs (`siteCan`); the Settings nav item shows when the user can
use at least one sub page. The server routes behind each page keep judging the caller themselves; nothing new
on the server.

## Phases

0. **The server routes by app** (above), with tests: each family over the three bases, the judge on each, a
   404 for an unknown app, the old routes unchanged.
1. **Registry and page.** The sub-page shape, the registry and its three doors, `SettingsPages` (sidenav group +
   page), Overview built from today's cards, Settings on every app. Unit test of the registry (order, refusal of
   a duplicate, `can` filtering, `forTenant`).
2. **Both places.** `siteSettings.jsx` and `tenantOverview.jsx` become wrappers; the Plugins card on both.
3. **Moves.** Storage and the server Plugins page as sub pages; old paths redirect; their root nav items go.
4. **Docs and an example.** `extension-points.md` rows; one sub page added by an app plugin to prove the plugin
   door (e.g. a small "About" page in `src/plugins/`, or the perf report's app summary later).

## Files (expected)

- `packages/dms/src/patterns/admin/settingsRegistry.js` (new), `pages/settingsPages.jsx` (new) + `.theme.js`
- `pages/siteSettings.jsx`, `pages/tenantOverview.jsx`, `pages/siteStorage.jsx`, `pages/plugins.jsx` (take the app as props)
- `patterns/admin/siteConfig.jsx` (routes, sidenav group, redirects), `patterns/admin/defaultTheme.js`
- `packages/dms/src/plugins/index.js` (the new kind), `patterns/registry.js` (`admin.settingsPages`), `src/index.js` (export)
- `documentation/extension-points.md`, `documentation/pattern-registry.md`

## Testing checklist

- [x] A single-site app shows Settings with Overview and Storage; no Domains card (browser check, below)
- [ ] A tenant host shows Settings with the same sub pages as the hub's page for that tenant, minus `forTenant: false`
      (unit-tested in the registry; not checked in a browser: needs a multi-tenant build with tenants)
- [x] The hub's root shows Server plugins under its own Settings only (browser: the server's hub; unit: never a tenant host)
- [x] `/list/storage`, `/list/plugins`, `/list/domains` land on the new sub pages (browser)
- [~] A sub page added by an app, by a plugin and by a pattern type each show, and vanish when the plugin is not
      active: unit-tested (`tests/settingsRegistry.test.js`, through the real `registerPlugin`); no live example page
- [x] A user with only `manage-storage` sees Settings → Storage and nothing else (unit)
- [x] Backwards compatible: the Pattern Editor unchanged; no theme key removed (`admin.settingsPages` added); the cards
      keep their `tenant` prop and old routes when not given `apiBase`; old admin paths redirect

## Progress log

- 2026-11-25 — created at the owner's request (added to the page-load performance initiative, which it closes
  out with the perf report tab: [pattern-perf-report-tab.md](./pattern-perf-report-tab.md)). Design above; not started.
- 2026-11-25 — **Phase 0 built** (not committed): `/_dms/apps/:app/{pgenvs,plugins,app-settings}` on every server.
  `routes/tenants/index.js`: the pgEnv and plugin families moved into `registerSiteFamilies(app, basesOf)`,
  registered by app always and by tenant / hub on a multi-tenant server; `siteAppOf` takes `:app` (an app name
  pattern, and a site row on this server, else 404). `routes/appSettings/index.js`: the by-app base, the same
  check (`store.siteRowOf`, now exported). Judging unchanged. Test `tests/test-app-routes.js` 7/7 (in `npm test`).
- 2026-11-25 — **Phases 1–3 built, phase 4's docs done** (not committed). Owner: "lets implement the settings task".
  - **Registry** `patterns/admin/settingsRegistry.js`: the shape in the design, plus `can(ctx)` REQUIRED (a page with
    none is refused at registration) and `ownHeader` (the page draws its own header: Storage, Server plugins).
    `settingsPagesFor(ctx)` → `{ all, allowed }`; ctx also carries `staff` (the hub's root and manage-tenants).
    Built in: Overview (0), Plugins (10), Storage (20, own Settings only), Server plugins (30, own Settings only,
    the server's hub and install-plugins; `mayInstallPlugins` moved here from siteConfig.jsx).
  - **Doors:** `registerSettingsPages` (exported from the library); the plugin host's new kind `settingsPages`
    (`host.registerSettingsPages`, owner tracking and rollback like the others; shown only where the plugin is
    active); `admin.settingsPages` on a pattern type (offered when the site has a pattern of that type).
  - **Page** `pages/settingsPages.jsx` (+ `.theme.js`, `admin.settingsPages`): the header (a sub page reports its
    counts through `onSummary`, as Overview does), then the open sub page; `showNav` adds a strip of sub pages (the
    hub's tenant page). No sub page in the URL redirects to the first allowed one; a denied one says so.
  - **Both places:** `pages/siteSettings.jsx` (`settings/:sub?`, every app; `target.apiBase` =
    `/_dms/apps/<app>`) and `pages/tenantOverview.jsx` (`tenants/:tenantId/:sub?`; `/tenants/<subdomain>`) are
    wrappers now. The cards moved into `pages/settings/overview.jsx` and `pages/settings/plugins.jsx`;
    `PgEnvsCard`, `PluginsCard`, `AppSettingsCard` take `apiBase` (without it, their old tenant / `/hub` routes),
    and say "needs a newer dms-server" on a bare 404 from the by-app routes.
  - **Moves:** Storage and Server plugins are sub pages; `/list/storage`, `/list/plugins`, `/list/domains`
    redirect; their root sidenav entries are gone. The sidenav's Settings is now a group listing the sub pages the
    user can use, on every app (was: a single link, multi-tenant sites only).
  - **Who sees Settings changed:** any user who can use one sub page (was: manage-domains on a tenant host,
    manage-tenants on the hub's root, nobody on a single-site app).
  - **Left out, on purpose:** on the hub's tenant page, pattern-type pages aren't offered (it doesn't load the
    tenant's patterns), and a plugin's pages follow its default activation, not the tenant's rows. The phase 4
    example page from an app plugin was not added (it would ship to every admin); the plugin door is covered by the
    unit test instead. Owner's call whether to add one, or wait for the perf report's app summary.
  - **Docs:** `documentation/extension-points.md` (a section for the Settings sub pages, the plugin host row, the
    `admin.settingsPages` row), `documentation/pattern-registry.md`.
  - **Tests:** `tests/settingsRegistry.test.js` 9/9 (order, refusals, `can`, `forTenant`, the tenant-host rule,
    the plugin door with activation and rollback, the pattern-type door); `pluginHost.test.js` still passes. Library
    suite: 985 pass, the same 15 known failures in 7 files. `scratchpad/settings-e2e/check.mjs`: 13/13 in Chromium
    against a production SSR build on a single-site (not multi-tenant) server: the Settings group, the redirects,
    Overview's cards over `/_dms/apps/<app>/…` (200), Plugins, Storage, an unknown sub page, no page errors.

