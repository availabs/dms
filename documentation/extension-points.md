# Extension points: where code from outside the core plugs into DMS

The core (client, server, CLI) holds no knowledge of any app, pattern type or theme
(`src/dms/CLAUDE.md`, "DMS Interprets Data"). Everything app-specific gets in through one of the
points below. **When you add one, add its row here.**

Checked against the code on 2026-11-17. Paths: **C** = `packages/dms/src` (client), **S** =
`packages/dms-server/src`, **CLI** = `packages/dms/cli`, **app** = the host app (dms-template). Functions are named
rather than line numbers, which drift.

| Side | Count | Registered by |
|---|---|---|
| Client: pattern types | 14 | `registerPatternTypes` and the type's definition keys |
| Client: sections and theme keys | 11 | `registerComponents`/`registerWidget`/…, or keys on a site theme |
| Client: entry props and host files | 6 | `<DmsSite>` props, `lazyComponent`, the SSR entry file |
| Server | 2 (+4 parts) | env variables naming a module |
| CLI | 2 | `.dmsrc` keys |
| Build / deploy | 1 | a script flag |

## Client: pattern types

`registerPatternTypes` (C `patterns/registry.js`; its contract is the comment at the top of that file). The app
registers `{ mapeditor, qa, chat }` in `app/src/patterns/index.js`, imported by both `src/App.jsx` and
`src/entry-ssr.jsx`. Full guide: [pattern-registry.md](./pattern-registry.md) and
`skills/registering-a-pattern-type.md`.

| Key | The core reads it in | It gets / is | App users | For |
|---|---|---|---|---|
| `siteConfig` (required, array) | C `render/spa/utils/index.js` `pattern2routes` | the config-function contract, plus `sitePatterns` | mapeditor, qa, chat | routes for the type's pattern rows |
| `label`, `description`, `admin.addable/order/defaultName` | C `patterns/admin/components/AddPatternPicker.jsx`, `admin.format.js` | data | all three | the type select and Add Pattern cards |
| `admin.usesDmsEnv` | C `patterns/admin/pages/patternEditor/default/settings.jsx` | bool | mapeditor | shows the dmsEnv picker |
| `admin.duplicable` | C `utils/adminPermissions.js`, `patterns/admin/components/patternList.jsx` | bool | qa, chat | `false` hides Duplicate |
| `admin.beforeCreate` | C `patterns/admin/pages/editSite.jsx`, `patternList.jsx` | `({falcor, app, instance, row, siblings}) → {problem} \| {row}` | qa, chat | refuse a new pattern, or give its first settings |
| `admin.afterCreate` | C `patterns/admin/pages/editSite.jsx` (not `patternList.jsx`) | `({falcor, app, siteId, siteInstance, patternId, instance, row, siblings})` | qa, chat | set-up once the site row is saved (qa: its datasets) |
| `admin.editorTabs` | C `patterns/admin/pages/patternEditor/index.jsx`, `patterns/admin/siteConfig.jsx` | `[{name, path, icon, component}]` | qa (Configure) | Pattern Editor tabs |
| `onPagePublish` | C `patterns/page/pages/edit/editFunctions.jsx` `publish` (not awaited; failures logged) | `({page, pattern, sitePatterns, type, app, baseUrl, apiLoad, apiUpdate})` | qa (`publish.js`) | react to the editor's Publish |
| `providesDatasources` | C `render/spa/utils/index.js` | bool | built-in datasets only | the rows become datasources |
| `pageComponents` | C `patterns/registry.js` → `registerComponents` | `{elementType: section entry}` | mapeditor (`Map`) | ship section types |
| `defaultTheme` / `themeKey` | C `patterns/registry.js` (merged onto the default theme at `themeKey ?? name`) | theme object | all three | default styles at `theme.<type>` |
| `registerFromTheme` | C `render/spa/utils/index.js` (every loaded theme, at route build) | `(theme) => void` | mapeditor (→ `registerMapPlugins`) | a site theme ships code for the type |
| `formats`, `instanceFormat`, `childRefs`, `publicRead`, `rulesOn` | C `patterns/registry.js`; stamped by `stampPatternRow`/`stampSiteRow` | format modules | `qa.format.js`, `chat.format.js`, `mapeditor.format.js` | auth vocabulary, rules and parentage for the server |
| `public` on the pattern row (data) | S `routes/dms/dms.route.js` (the no-access stub) | whatever the type writes | qa (`intake.js`, `public.qaIntake`) | settings readable by users without a grant, signed out included |

## Client: sections, and theme keys that carry code

Theme keys are registered in `pagesConfig` (C `patterns/page/siteConfig.jsx`) from the page pattern's selected
theme. **The registries are global for the app**, so one pattern's theme affects every pattern.

| Name | Registered by | The core calls it in | It gets / is | App users | For |
|---|---|---|---|---|---|
| Section types | `registerComponents` (exported), a type's `pageComponents`, or theme `pageComponents` | C `patterns/page/components/sections/componentRegistry.js` | `{name: {name, EditComp, ViewComp, controls, defaultState, useDataSource, useDataWrapper, …}}` | theme `pageComponents` in transportny (theme, themev2), wcdb, mny, tessera v6 | section types |
| ↳ `preload()` | section entry | `componentRegistry.js` `preloadSectionComponents` | `() => Promise` | mapeditor section | load a lazy chunk with the page data |
| ↳ `managesOwnState` | section entry | C `…/sections/components/index.jsx`, `sectionMenu.jsx` | bool; settings through the handle's `settingsAPI` | mapeditor section | the section owns its element-data |
| ↳ `derivePageVariables` | section entry | C `patterns/page/pages/_utils/index.js` | `(elementData) → [{searchKey, …}]` | mapeditor section | registers page variables |
| Section menu groups | theme `sectionMenuExtensions` or `registerSectionMenuExtensions` (exported) | C `…/sections/sectionMenu.jsx` | `{componentName: builder[]}`; builder `(ctx) → itemGroup[]` | transportny (`npmrdsMeasureMenu`) | extra settings-menu groups for a section type |
| Section header content | theme `sectionHeaderExtensions` or `registerSectionHeaderExtensions` (exported) | C `…/sections/section.jsx` | the same ctx → ReactNode(s) | transportny (`npmrdsQuickControls`) | inline content in a section's header |
| Column types | theme `columnTypes` (`registerColumnType` isn't exported) | C `ui/columnTypes/index.jsx` | `{name: {EditComp, ViewComp, cardHints?}}`; `cardHints` read by Card | wcdb, landbank, mny, tessera | custom cell types for Card / Spreadsheet |
| Format functions | theme `formatFunctions` (`registerFormatFunction` isn't exported) | C `…/dataWrapper/utils/utils.jsx` | `{name: fn \| {fn, label, preserveSpaces}}` | wcdb (`airingLabel`) | entries in the Format control |
| Nav widgets | `registerWidget` (exported) or theme `widgets` | C `ui/widgets/index.jsx`; placed by `ui/components/Layout.jsx` | `(name, {label, component, internal})`; the component gets the slot's `options` | `app/src/widgets.js` (`NavCta`), qa (`ReportIssue`); theme key in wcdb, weather_analytics, tessera v6, transportny v2 | components a theme places in the top or side nav |
| Icons | theme `Icons` | C `ui/components/Icon.jsx`, the icon pickers | `{name: Component}` | most themes | the icon set, by name |
| Graph legend unit | theme `avlGraph.resolveLegendUnit` (a function) | C `ui/components/graph_new/index.jsx`, `…/ComponentRegistry/graph_new/config.jsx` | `(display) → unit` | transportny themev2 | the legend title's default unit |

## Client: entry props and host files

| Name | Registered by | The core reads it in | It gets / is | App users | For |
|---|---|---|---|---|---|
| `themes` | `<DmsSite themes>`, `createSSRHandler({themes})` | C `render/spa/dmsSiteFactory.jsx`; `.ALL_NAMES` in the theme editor | `(names[]) → Promise<{name: theme}>` | `app/src/themes/index.js` | code themes |
| `damaDataTypes` | `<DmsSite damaDataTypes>` | C `patterns/datasets/siteConfig.jsx` `expandDamaDataTypes`, `CreatePage.jsx`, `SourcePage.jsx` | `{sourceType: {sourceCreate, defaultPages, <page>: {name, path, component}}}`; components get `{source, newVersion, baseUrl, context}` | `app/src/data-types.js` (from `data-types/*/pages`) | each data type's create and view pages |
| `routes` | `<DmsSite routes>` | C `render/spa/dmsSiteFactory.jsx` | react-router routes | none | extra app routes |
| `authWrapper` | `<DmsSite authWrapper>` | C `render/dmsPageFactory.jsx` (default `withAuth`) | a HOC | none | replaces the auth wrapper |
| `lazyComponent(id, loader)` | function (exported) | C `render/ssr2/handler.jsx`; the client's `preloadLazyComponents` (`app/src/main.jsx`) | a stable id and a dynamic import | qa, mapeditor | code-split components that stay SSR- and hydration-safe |
| SSR entry | the file `src/entry-ssr.jsx` (built to `<DMS_DIST_DIR>/server/entry-ssr.js`), default export `createHandler(config)` | S `index.js` → C `render/ssr2/express/setup.mjs` | `{apiHost, siteConfig, pgEnvs, isMultiTenant, rootDomain}` | `app/src/entry-ssr.jsx` | the app's server render |

## Server (dms-server)

| Name | Registered by | The core calls it in | It gets / is | App users | For |
|---|---|---|---|---|---|
| Data type plugins | env `DMS_EXTRA_DATATYPES` (a CJS module) | S `index.js` → `dama/datatypes/index.js` `registerDatatype` | default export `({registerDatatype})`; a definition is `{workers, routes, openRoutes, schedulables, rules}` | `app/data-types/register-datatypes.js` (22 plugins); set in `Dockerfile` and `Dockerfile.ssr` | the server side of app data types |
| ↳ `workers` | the definition | S `dama/tasks/index.js` | `(context{task, pgEnv, db, dispatchEvent, updateProgress})` | most plugins | queued task handlers |
| ↳ `routes` | the definition | S `dama/datatypes/index.js`, mounted at `/dama-admin/:pgEnv/<name>` behind the write gate (`openRoutes` exempt) | `(router, helpers)`; helpers built in S `index.js` (`queueTask`, `createDamaSource`, `requireUser`, `requireCan`, `authorize*`, `getDb`, `storage`, …) | most plugins; `openRoutes` only analytics | REST endpoints |
| ↳ `schedulables` | the definition | S `dama/tasks/schedules.js` | `{label, defaultCron, params, buildDescriptor, preflight}` | npmrds, npmrds_raw, transcom, excessive_delay, work_zone, mny actions_cleaned | cron-scheduled runs |
| ↳ `rules` | the definition → `registerRule` | S `dama/rules/index.js` | `{label, params, key, validate, install, uninstall, status, …}` | none (the core has `auto_number`, `point_from_lat_lon`) | source-table rule templates |
| Page-delete hook | env `DMS_PAGE_DELETE_HOOK` (a CJS default export) | S `index.js` → `routes/dms/dms.controller.js` `setPageDeleteHook`; runs in `cascadePageDelete` after the commit, failures logged | `(row, {userId, reqMeta, dms_db, resolveTable, jsonField, dbType, splitMode})` | `app/hooks/register_page_delete_hooks.js` → `npmrds_report_page_delete_hook.js` (removes a deleted report's row from the reports dataset); set in `Dockerfile` | an app side effect when a page row is deleted |

## CLI

| Name | Registered by | The core calls it in | It gets / is | App users | For |
|---|---|---|---|---|---|
| Page-publish hook | `.dmsrc` `pagePublishHook` (relative to the file) or env `DMS_PAGE_PUBLISH_HOOK` (relative to the cwd) | CLI `src/commands/page.js` `runPublishHook` | default export `({falcor, config, pattern, page, helpers})`; its return is added to the output | the app's root `.dmsrc` → `src/patterns/qa/cli/onPagePublish.js` | `dms page publish` side effects (QA page tracking) |
| App commands | `.dmsrc` `commands` (paths relative to the file) | CLI `bin/dms.js`, before parsing | default export `register({program, helpers})` | the app's root `.dmsrc` → `src/patterns/qa/cli/commands.js` (`dms qa`) | the app's own command groups |

## Build / deploy

| Name | Registered by | Read by | App users | For |
|---|---|---|---|---|
| Host format modules | `--extra <file>` on `packages/dms/scripts/emit-formats.mjs` or S `scripts/register-formats.js` (the type is the file name before its first dot; `*.childRefs.js` adds childRefs) | the server's `formats` table | the qa, chat and mapeditor format files (qa's is the documented example; no script runs it automatically) | the server learns a host type's auth vocabulary, rules and childRefs |

## Owned by a host pattern (not the core, same kind)

| Name | Registered by | App users | For |
|---|---|---|---|
| Map plugins | `registerMapPlugins` (`app/src/patterns/mapeditor/MapEditor/pluginRegistry.js`), or theme `mapeditor.mapPlugins` through the type's `registerFromTheme` | transportny theme (routecreation, macroview, routing, detour) | map editor and Map section plugins |

## Known gaps (2026-11-17)

- **The tenant hub's image doesn't load the page-delete hook.** `Dockerfile.ssr` (the hub's image) neither copies
  `hooks/` nor sets `DMS_PAGE_DELETE_HOOK`; `Dockerfile` (the main server, deploy.sh) does both. The hook's only user
  is TransportNY's NPMRDS reports, so it matters only if those run on the hub. Not being fixed (owner, 2026-11-17).
- **`avlGraph.resolveLegendUnit`** was in no doc until this list.
- **`registerColumnType` and `registerFormatFunction` aren't exported** from the library entry. The theme keys are the
  only public route to them.
- **Theme-key registrations are global** (see "sections, and theme keys" above).

## Left out on purpose

Internal, with no outside caller: the worker runner's handler map (`DAMA_WORKER_PATH` / `DMS_WORKER_PATH`), the DMS
task registry, `afterAuthCall`, `_setSyncAPI`, `setRootDomain` / `setDomainAliases`, and `dmsSiteFactory`'s
`onResolvedSyncApp` / `onResolvedSiteData` (only the core's SSR handler uses them). Conventions the core reads but
that hold no code: the built-sites folder `<checkout>-sites`, theme rows in the database, the app's Vite plugins.
