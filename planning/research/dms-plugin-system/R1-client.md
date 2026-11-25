# R1 (client architecture): how the DMS client registers and loads code today

Worker report for `src/dms/planning/tasks/current/dms-plugin-system.md`, 2026-11-22. Read-only research.

Path prefixes: **APP** = `/home/alex/code/avail/dms-template`, **LIB** = `APP/src/dms/packages/dms/src`,
**SRV** = `APP/src/dms/packages/dms-server/src`. "Verified" = read in the code at the line given; "Inference" =
my reading of consequences, not tested.

**Correction to the brief (verified):** the installed bundler is **Vite 7.2.7 on Rollup**, not Vite 8 / Rolldown
(`APP/package.json:89` `"vite": "~7.2.7"`; `node_modules/vite/package.json` 7.2.7; no `rolldown` package; only
`@rolldown/pluginutils`, a dependency of `@vitejs/plugin-react`). React 19.2.8 and React Router 8.5.2 are as stated.

---

## 1. Every client registration point

The library already keeps a maintained list, `APP/src/dms/documentation/extension-points.md` (checked
2026-11-17). Below is that list re-read against the code, with the three questions the plugin design needs
answered: **when it runs**, **is it a global mutable registry**, and **does a late registration work**.

| Point | Where (verified) | When it runs today | Global mutable? | Late registration (after boot) |
|---|---|---|---|---|
| Pattern types `registerPatternTypes` | LIB `patterns/registry.js:120-163`; app calls it at module scope in `APP/src/patterns/index.js:14`, imported by `App.jsx:3` and `entry-ssr.jsx:4` | Module load, before routes are built | Yes: module-level `patternTypes` object (`:120`). Registering also mutates the library `defaultTheme` (`:155-160`) and pushes `pageComponents` into the section registry (`:153`) | **Needs a route rebuild.** `pattern2routes` reads it once per build (`render/spa/utils/index.js:402`) and silently skips unknown types with a dev-only warning (`:154-159`, `:403-405`). The admin's type select is a live getter (`patterns/admin/admin.format.js:207-212`), so that part picks up late types |
| Section types `registerComponents` | LIB `patterns/page/components/sections/componentRegistry.js:3-15` (`Object.assign` onto `registeredComponents`) | Module load (built-ins), pattern registration (`pageComponents`), and **per theme at route build** (`patterns/page/siteConfig.jsx:80-89`, theme `pageComponents`) | Yes | **Works for anything rendered after it**: `section.jsx:106-107` reads `getRegisteredComponents()` on every render. No subscription, so a section already on screen does not re-render. Name collisions silently overwrite |
| Section `preload()`, `managesOwnState`, `derivePageVariables`, `serverStatic`, `serverIsland` | keys on a section entry; read in `componentRegistry.js:24-29`, `pages/_utils/index.js:464`, `rscSections.js:9,19` | With the entry | (part of the above) | As above |
| Column types | LIB `ui/columnTypes/index.jsx:142-149` `registerColumnType` (not exported from the entry; only via theme `columnTypes`, `page/siteConfig.jsx:94-96`) | Per theme at route build | Yes: mutates the default-exported `columnTypes` object, which `Card.config.jsx:5` and `CardColumnPicker.jsx:6` import directly | Works for later renders (same object) |
| Format functions | LIB `…/dataWrapper/utils/utils.jsx:247` (`formatFunctions` object), `:374` `registerFormatFunction` (not exported; via theme `formatFunctions`, `page/siteConfig.jsx:103-109`) | Per theme at route build | Yes | Works for later renders |
| Section menu / header extensions | LIB `sections/sectionMenuExtensions.js:17`, `sections/sectionHeaderExtensions.js:16-29` (replace, not append, per component name) | Per theme at route build (`page/siteConfig.jsx:117-130`), or the exported functions | Yes | Works for later renders |
| Nav widgets `registerWidget` | LIB `ui/widgets/index.jsx:38-44` (mutates `defaultWidgets`); app: `APP/src/widgets.js:9`; also theme `widgets` | Module load | Yes | Works for later renders. Must be registered identically on server and client or hydration breaks (`APP/src/rsc/entry.browser.js:10-13` says so explicitly) |
| Theme `Icons`, `avlGraph.resolveLegendUnit` | theme keys, read from the merged theme | With the theme | No registry: part of the theme object | Needs the theme to be re-resolved (route rebuild) |
| `registerFromTheme` (pattern hook) | LIB `render/spa/utils/index.js:211-212`: every loaded theme × every type's hook, at route build | Route build | (calls into the type's own registry) | Runs again on every route build |
| Map plugins `registerMapPlugins` | Owned by the app pattern, not the core: `APP/src/patterns/mapeditor/MapEditor/pluginRegistry.js:10-23` (`PluginLibrary` object); wired via `mapeditor/index.js:35` `registerFromTheme: theme => registerMapPlugins(theme?.mapeditor?.mapPlugins)` | Module load, or route build via theme | Yes | Works for later renders |
| Lexical plugins | **No registry.** `LexicalEdit` takes a `plugins` prop (React elements rendered inside its `LexicalComposer`), `src/dms/planning/tasks/current/lexical-edit-plugins-slot.md` §Change. The node set is fixed in the library | Per call site | No | n/a: only code that renders `LexicalEdit` itself (e.g. chat's composer) can add one. A plugin cannot add a Lexical node or a toolbar item to the page pattern's rich-text section |
| Data-type client pages (`damaDataTypes`) | **Not a registry: a `<DmsSite>` prop.** Built in app code, `APP/src/data-types.js:26-102` (`dataTypesByApp[app]` + `sharedDataTypes`), passed at `App.jsx:55`; threaded through `pattern2routes` (`utils/index.js:476`) into the datasets `siteConfig.jsx:110-116` (`expandDamaDataTypes`), read by `CreatePage.jsx:69`, `SourcePage.jsx:160-163`, `dataTypes/default/admin.jsx:141`. Pages are `lazyComponent`s (e.g. `APP/data-types/external_map_layer/pages/index.jsx:5-6`) | Boot (prop value) | No (a prop) | **Needs a route rebuild** (it is captured into the datasets route config). Not passed to SSR at all: `createSSRHandler` takes no `damaDataTypes` (`render/ssr2/handler.jsx:92-100`; `entry-ssr.jsx:16-19`) |
| Code themes | `APP/src/themes/index.js:8-50`: a closed `loaders` map of `name → () => import(...)`; `loadThemes(names)` (`:94-98`) is passed as `<DmsSite themes>` (`App.jsx:54`) and to `createSSRHandler` (`entry-ssr.jsx:18`). Unknown names return `null` (`:77`) and fall through to DB themes. `loadThemes.ALL_NAMES` (`:109`) is computed once at module load for the theme picker | Route build: `resolveThemes` (`render/spa/utils/index.js:141-150`) loads only names the site's patterns select (`collectThemeNames`, `:77-89`) | The `loaders` map is a module-local constant: **not extensible** from outside | A new theme name needs a new `loaders` entry (rebuild) and a route rebuild |
| DB themes (`{name}:theme` rows) | Listed on the site row's `theme_refs` (`admin.format.js:378-382`); fetched by name in `resolveDbThemes` (`utils/index.js:106-128`) and merged over code themes (`:149`, again `:198-206`) | Route build | Data, not code | Next route build. **JSON only**: cannot carry components, functions, icons, column types |
| Theme merge chain | `ui/useTheme.js:159-195`: `defaultTheme` (mutated by pattern registration) ⊕ `themes[selection]` ⊕ `pattern.theme` (per-pattern overrides stored on the row). `resetBaseThemeCache` (`:162`) after registration | Route build (`getPatternTheme` in each `siteConfig`) | `defaultTheme` is a mutable module object | Route rebuild |
| Formats (auth vocabulary, rules, childRefs) | Derived at `registerPatternTypes` (`registry.js:135-151`), stamped on new rows (`stampPatternRow` `:178-186`), and emitted for the server by `packages/dms/scripts/emit-formats.mjs` (`--extra <file>` for host types, header `:1-25`) → `dms-server/src/scripts/register-formats.js --app <app>` | Deploy step, server-side, **per app** | Server `formats` table | Needs the server-side registration step for each app that activates the plugin (R2's territory) |
| `onPagePublish`, `admin.beforeCreate/afterCreate/editorTabs` | pattern definition keys (`registry.js:11-34`) | Read when the action happens | Part of pattern registry | Works once registered |
| CLI hooks | `.dmsrc` `commands`, `pagePublishHook` (paths relative to the file); `extension-points.md` §CLI | CLI start | n/a | Per invocation |

**Facts worth stressing.**

- Every client registry is a **plain module-level object with no subscription and no unregister**. Nothing
  re-renders when one changes, and nothing can remove an entry (only overwrite it). `registerPatternTypes`
  warns on replace in dev (`registry.js:145-147`); `defaultTheme` merges are cumulative (`:157-159`).
- Several registrations happen **per theme, during route build** (`page/siteConfig.jsx:80-130`), so "a theme"
  today is already a small plugin: it can ship `pageComponents`, `columnTypes`, `formatFunctions`,
  `sectionMenuExtensions`, `sectionHeaderExtensions`, `widgets`, `Icons`, `mapeditor.mapPlugins`. These
  registrations are **app-wide** (one pattern's theme affects every pattern; extension-points.md "Known gaps").
- The RSC path **duplicates** the per-theme registration logic (`render/rsc/SectionIslands.jsx:26-32`
  `registerThemeParts`) and registers its own widgets (`APP/src/rsc/entry.browser.js:13`). Any plugin
  registration API has to feed both paths.

## 2. How the app loads code

**Entries (verified).**
- Browser: `APP/index.html` → `src/main.jsx`. SSR-hydration branch awaits
  `loadThemes(collectThemeNames(ssrData.defaultData))` and `preloadLazyComponents(ssrData.lazy)` before
  `hydrateRoot` (`main.jsx:23-36`); the SPA branch renders `<App/>` with the lazy theme loader (`:41-45`).
- `src/App.jsx` imports `./patterns` and `./widgets` for side effects (`:3-4`), then renders `<DmsSite>` with
  `themes`, `damaDataTypes={getDataTypes(DMS_APP)}`, hosts and env from `import.meta.env` (`:16-31`, `:36-58`).
- `DmsSite` (`LIB render/spa/dmsSiteFactory.jsx:52-404`): builds routes from the localStorage snapshot or
  `defaultData` (`:121-128`, lazy-theme fast path `:165-181`), then always runs `dmsSiteFactory` (`:183-250`),
  which loads the site row (`:447`), resolves themes (`:461`) and calls `pattern2routes` (`:467`; tenant path
  `:543-548`). Routes go into `createBrowserRouter` in a memo (`:292-304`). **Routes are replaced only when the
  fetched site data differs byte-for-byte from what built the current ones** (`appliedSiteDataRef`, `:155-160`,
  `:230-239`). There is no exported "rebuild routes" API; sync invalidations call `router.revalidate()`
  (`:329-341`), which re-runs loaders, not route construction.
- **`dmsSiteFactory` is already async between "site row loaded" and "routes built"** (`:447-467`). That is the
  natural place to await plugin code: the site row is known (so its active-plugin list could be read), and
  nothing has been routed yet.
- `pattern2routes` (`render/spa/utils/index.js:161-510`): merges DB themes, runs `registerFromTheme` hooks,
  then for each pattern row calls `getPatternType(row.pattern_type).siteConfig` and `dmsPageFactory`.

**Code splitting (verified).** `vite.config.js:226-253` `manualChunks`: a `vendor` chunk for
`react|react-dom|scheduler|react-router|…falcor|lodash-es` (`VENDOR_CORE`, `:156`), `maplibre`, `excel-export`;
everything else follows its importers. Themes split per `import()` (`themes/index.js:8-50`); a per-site build can
modulepreload named themes (`VITE_DMS_PRELOAD_THEMES`, `vite.config.js:74-135`). Components split with
`lazyComponent(id, loader)` (`LIB utils/lazyComponent.js:53`), which is SSR- and hydration-safe: the server
preloads every registered id and records which rendered; the client preloads those ids before hydrating
(header `:3-30`). Stale-chunk failures reload the tab once (`:40-51`; same in `themes/index.js:63-74`).

**How React, the router and the library are shared (verified).** Only by being **compiled into one Rollup
graph**. The library is consumed as source (`App.jsx:1` imports `./dms/packages/dms/src`; `@availabs/dms` in
`package.json` is `file:./src/dms/packages/dms` with `main: dist/index.js`, unused by the app). Output chunks
have hashed names and minified, internal export names. App pattern code reaches into the library through the
entry and through deep paths: across `src/patterns` and `data-types`, about 90 imports use the entry
(`~/dms/packages/dms/src`), about 45 reach ~20 internal modules (`utils/lazyComponent`, `patterns/page/siteConfig`,
`…/dataWrapper/getData`, `patterns/registry`, `ui/defaultTheme`, the `map` second entry, …). That code relies
on context identity heavily: `useContext(ThemeContext)` 64×, `CMSContext` 10×, `PageContext`, `AuthContext`,
`AdminContext`, `DatasetsContext`, `ComponentContext`; `react-router` imported in 35 places.

**Import map / Module Federation / `import(url)`: none (verified).** No import map, federation plugin,
`@vite-ignore`, or URL import in app or library source. (Import maps appear only in static design-system
mockup HTML under `src/themes/*/design_system_*`.) The closest thing is the RSC client's
`loadPatternTypes: () => import('../patterns')` (`APP/src/rsc/entry.browser.js:25`), awaited before islands
render (`LIB render/rsc/IslandHost.jsx:12-15`): an async "register pattern types, then render" step, but still
a build-time chunk.

**What a separately built plugin bundle would need as singletons (inference from the above).**
`react` (including `react/jsx-runtime` and, if compiled with the React Compiler, `react/compiler-runtime`),
`react-dom`, `react-router` (route context, `useNavigate`), and **the host's live library instance**: its
registries (pattern types, components, column types, format functions, widgets, map plugins), its contexts
(`ThemeContext`, `CMSContext`, `PageContext`, `ComponentContext`, `AuthContext`, `PatternAuthContext`), `UI`,
`lazyComponent` (one id registry), the falcor/API layer, and `lexical` if it touches the editor. A plugin that
bundles its own copy of any of these gets a second registry or a second context object: its `useContext`
returns undefined and its registrations land where the host never looks. None of these are reachable by a
foreign bundle today, because they exist only as hashed, mangled chunks.

## 3. SSR, RSC and deployment

**SSR (verified).** `APP/src/entry-ssr.jsx` imports `./patterns`, `./widgets`, `./themes` and exports
`createHandler(config)` → `createSSRHandler({adminConfigFn, themes, ...config})` (`:1-21`). The handler
(`LIB render/ssr2/handler.jsx`) builds routes per host through the same `dmsSiteFactory` (`:111-163`), caches
them per host and per restricted user (`:103-108`, `:171-196`), preloads all lazy components before each
`renderToString` (`:238`), and exposes `invalidateRoutes()` (`:305-311`). dms-server mounts it only with
`DMS_SSR` set (`SRV index.js:403-441`): prod imports `<DMS_DIST_DIR>/server/entry-ssr.js` **once** at mount
(`render/ssr2/express/setup.mjs:139-141`); dev loads it through Vite per request (`:60-114`). The only caller of
`invalidateRoutes` is the domains store (`SRV index.js:439-441`). The SSR build externalizes Node deps except
avl-falcor (`vite.config.js:255-263`), so in Node `react`/`react-dom`/`react-router` resolve from
`node_modules`, but **the library is bundled inside `entry-ssr.js`** and cannot be imported by anything else.

**RSC (experimental, `DMS_RSC=1`, verified).** Three entries `APP/src/rsc/entry.{rsc,ssr,browser}.js`, built by
`vite.rsc.config.js` into `DMS_RSC_DIST_DIR`, mounted ahead of SSR (`setup.mjs:146-153`, `:170-213`). The
browser side is configured with `configureRscClient({loadThemes, …, loadPatternTypes})`
(`LIB render/rsc/clientConfig.js:4-17`). Section types decide server-static vs island by `serverStatic` /
`serverIsland` keys.

**Would a plugin have to load into the SSR Node process? (inference)** Yes, wherever SSR or RSC serves its
pages. Hydration requires the server HTML and the client's first render to come from the same components
(`main.jsx:14-22` explains why themes and lazy ids are resolved before `hydrateRoot`). A pattern type, section
type, widget or theme hook that exists only in the browser leaves the server rendering a 404, an empty
section, or a widget placeholder, and hydration then fails. The SSR payload would have to name the active
plugins (as it names `lazy` ids) so the client loads the same ones before hydrating.

**How builds are deployed (verified).**
- Most sites are **static SPA builds**, one per target, differing only in `VITE_*` env (`deploy/targets.json`:
  `VITE_DMS_APP`, `VITE_DMS_TYPE`, `VITE_DMS_PG_ENVS`, …). Sites with `hostedOn: server` are built on mercury
  into `<checkout>-sites/<site>/builds/<id>/client/` and served by dms-server's sites middleware by Host
  (`SRV sites/index.js:1-18`); `site.json`'s `live` pointer is re-read, so **promoting a build needs no
  restart** (`deploy.sh:32-40`: "the running server picks up within a second: no image build, no restart").
  Others still go to Netlify (`package.json` `deploy-*`).
- The main dms-server image (`APP/Dockerfile`) is API-only (no `DMS_SSR`), with `DMS_EXTRA_DATATYPES`
  (`:121`). SSR runs in the tenant-hub image (`Dockerfile.ssr`), which builds client+server bundles inside the
  image (`:58` `npm run build:ssr`) and copies `dist`, the library source, `data-types` and `entry-ssr.jsx`
  (`:83-102`). A server deploy is an image rebuild and container roll (`deploy.sh:2-18`).

**What "add code without a restart" means for a static dist (inference).** The browser code of every site is a
frozen file set. Two ways to add a plugin's client code without restarting anything:
1. **Rebuild and promote** the affected site builds with the plugin included (the existing SITE-build path
   already does this with no restart, but takes a full Vite build per site and needs the plugin's source at
   build time).
2. **Load plugin bundles at runtime**: dms-server serves `/plugins/<name>@<version>/client.js` (+ CSS), the
   client `import()`s the URLs the site row lists, before routes are built. This needs the shared-singleton
   contract above. For SSR, the Node process would `import()` the plugin's server-render module and then call
   `invalidateRoutes()`; Node caches modules by URL, so versioned paths are required and an old version is
   never unloaded (memory grows with upgrades until restart).

## 4. Per-site / per-tenant selection today

| Mechanism | Verified at | What it selects |
|---|---|---|
| `VITE_DMS_APP` / `VITE_DMS_TYPE` baked into each build | `App.jsx:22-23`; `deploy/targets.json` `targets.*.env` | Which site row boots. Everything else is the same code in every build |
| Pattern rows' `pattern_type` | `admin.format.js:202-212`; routed in `utils/index.js:402` | Which registered types a site uses. **Every registered `addable` type is offered to every site** (the qa move removed its env gate; "registration alone offers Tickets", `pluggable-patterns-qa-extraction.md` follow-up 2026-10-15) |
| Pattern row `theme.selectedTheme` (+ legacy `settings.theme.theme`) | `utils/index.js:77-89`, `useTheme.js:180-185` | Which theme a pattern uses; `theme_refs` on the site row lists DB themes |
| `dataTypesByApp[app]` | `APP/src/data-types.js:26-102` | Data-type client pages, by app name, in **app code**. The only per-app code selection that exists; owner suggested it as the model for per-app pattern customization later (`pluggable-patterns-mapeditor-extraction.md` open question 5) |
| Tenant rows (`name`, `subdomain`, `app`, domains) on the hub's site row | `admin.format.js:131-150`, `:363-368`; resolved in `dmsSiteFactory.jsx:486-548` | Which tenant site a host renders. **No plugin, pattern-type or theme allowance on a tenant row** |
| Built-in names in the core | `render/spa/utils/index.js` (`'admin'`, `'auth'`, `'datasets'`: `:62`, `:224`, `:243`, `:264`, `:282`, `:339`, `:374-375`, `:486`), `admin/pages/patternEditor/default/settings.jsx:148,396,400`, `admin/pages/editSite.jsx:88,459`, `utils/tenantProvisioning.js:241,341,365`, `ExportPdf.jsx:40` | Only the four built-ins are named; no app type (`mapeditor`, `qa`, `chat`) is named in the core (the Phase 7 gate of the mapeditor move) |

**There is no notion of "enabled for this tenant/site"** for patterns, sections, column types or code themes.
In the browser that is tolerable (one tab = one site). In the hub's single SSR process it means every tenant
sees every registration, including registrations one tenant's theme made at route build (inference from the
registries being module-global and `pagesConfig` registering per theme).

## 5. What's hard: obstacles for runtime-loaded client plugins

1. **No shared module boundary.** React, the router and the library exist only inside hashed Rollup chunks
   with mangled exports (`vite.config.js:156`, `:226-253`). A foreign bundle can't import them. Needs an import
   map with stable host-built ESM entries (`react`, `react/jsx-runtime`, `react/compiler-runtime`,
   `react-dom`, `react-router`, a stable `@availabs/dms` host-API entry), or Module Federation, or globals plus
   externals. Today's app plugins also reach ~20 internal library modules; a plugin API means freezing a
   public surface (the owner already called named entry exports "the licensing boundary",
   mapeditor task open question 4).
2. **Context and registry identity.** A duplicated library copy silently breaks `useContext` and registration
   (counts in §2). Same for `lexical` (`LexicalComposerContext`).
3. **Registries are filled at import time and read at route build.** Pattern types, themes and
   `damaDataTypes` must be in place before `pattern2routes`; no rebuild API exists; no unregister exists.
   Plugins must load inside `dmsSiteFactory` (client) and `buildRoutes` (SSR) before routing.
4. **Process-global registries vs per-tenant activation.** On the hub's SSR process, activation can't be
   expressed by "register or not"; lookups must filter by the site's active plugins (`pattern2routes`, the
   section picker `sectionMenu.jsx:1032-1041`, the type select, column-type and format pickers). Name
   collisions overwrite silently (`componentRegistry.js:10`), so plugin names need a namespace.
5. **Tailwind 4 is compiled at build time from scanned source** (`@tailwindcss/vite`, `vite.config.js:273`;
   `src/index.css:1-7`). Class strings in a plugin outside the repo get no build-time CSS. Today the gap is
   covered by the **CDN runtime compiler** loaded on every page (`index.html:27`
   `cdn.jsdelivr.net/npm/@tailwindcss/browser@4`; also in the theme editors), which scans the live DOM.
   Plugin classes would work through it, but (a) SSR HTML paints unstyled until it runs (FOUC; the comment at
   `index.html:15-26` describes exactly this), and (b) `rsc-view-pages.md` future direction 6 wants that runtime
   **removed** for performance. Alternatives: plugin ships prebuilt CSS (risk of duplicate utilities and
   cascade-order fights with the host sheet), or the server compiles Tailwind at install time over host +
   plugin class candidates into a per-site sheet.
6. **React Compiler** runs only in production client builds (`vite.config.js:268-272`; dev and SSR skip it).
   A plugin compiled with it needs `react/compiler-runtime` from the host's React; one compiled without it may
   render more often but works. Dev/prod divergence already exists in the host.
7. **SSR hydration needs the same code on both sides.** The client must load the active plugins before
   `hydrateRoot`, the way `main.jsx:23-26` loads themes and lazy ids; `lazyComponent` ids must be unique across
   plugins and identical in both builds (`lazyComponent.js:27-28`). The SSR server imports its bundle once
   (`setup.mjs:139`); runtime plugins need a dynamic `import()` path in Node plus `invalidateRoutes()`, and
   Node's resolution of a plugin's bare `react` import depends on where the plugin is installed (inference).
8. **Two-path duplication.** Per-theme registration exists in `page/siteConfig.jsx` and again in
   `SectionIslands.jsx`; widgets are registered separately in `src/rsc/entry.browser.js`. A plugin contract
   must cover SPA, SSR and RSC entries.
9. **Data-type pages aren't a registry and don't reach SSR.** `damaDataTypes` is a prop chosen by app name
   in app code and is absent from `createSSRHandler`.
10. **Themes are a closed loader map** (`themes/index.js:8-50`) wrapped by an app-side transform
    (`withLegacyUi`, `:83`); a plugin theme needs a registration point for loaders, and `ALL_NAMES` for the
    picker is fixed at module load (`:109`).
11. **Formats must reach the server per app.** A plugin's pattern formats go through
    `emit-formats.mjs --extra` → `register-formats.js --app <app>` (server-only writer). Activation for a new
    app implies that step.
12. **Security surface (for R4).** Plugin client code runs with full page privilege (auth tokens, falcor).
    Site responses set only `frame-ancestors` CSP (`SRV sites/index.js` `SECURITY_HEADERS`), so nothing
    currently restricts script origins. The legacy MNY service worker caches aggressively (memory note).

## 6. What exists to build on

- **The pattern-type registry and its capability flags** (`registry.js`): a plugin's pattern part is already
  exactly one definition object (`siteConfig`, `pageComponents`, `defaultTheme`, `registerFromTheme`,
  `formats`, `admin.*`, `onPagePublish`). The mapeditor and qa moves proved a pattern can live entirely outside
  the library (`pluggable-patterns-mapeditor-extraction.md` Phases 5-7; `pluggable-patterns-qa-extraction.md`).
- **Code themes as carriers of code** (`pageComponents`, `columnTypes`, `formatFunctions`, extensions, widgets,
  `Icons`, map plugins), and **DB themes as data-only themes** (`:theme` rows + `theme_refs`). The split maps
  naturally onto "code plugin" vs "data plugin (safe)".
- **`lazyComponent`**: an SSR- and hydration-safe async component whose loader can be any promise, including
  `import(url)` of a plugin chunk.
- **Async seams before routing**: `dmsSiteFactory` (`:447-467`), `buildRoutes` (`handler.jsx:111-163`), the
  hydration preload in `main.jsx:23-26`, the RSC `loadPatternTypes` hook. Each already awaits something
  between "site row known" and "render".
- **`invalidateRoutes()`** on the SSR handler, and the per-host route cache with a generation counter.
- **No-restart client publishing**: site builds under `<checkout>-sites` with a re-read `live` pointer.
- **Server/CLI plugin precedents** (R2 covers the server): `DMS_EXTRA_DATATYPES` → `register-datatypes.js`
  (22 plugins, each loaded independently), `DMS_PAGE_DELETE_HOOK`, `.dmsrc` `commands` and `pagePublishHook`,
  `emit-formats.mjs --extra`.
- **Per-app selection precedent**: `dataTypesByApp` in `src/data-types.js`.
- **Data-types already pair server and client halves in one folder** (`data-types/<name>/index.js` + `pages/`),
  which is close to the proposed package shape.

## Implications for the plugin design

1. **Define a host API object and a module-sharing mechanism first.** Plugins must get React, react-dom,
   react-router, lexical and one library instance from the host. The likely shape is an import map pointing
   bare specifiers at stable, unhashed host ESM entries (plus a frozen `@availabs/dms` public surface), built
   alongside the app. Without it nothing else works.
2. **Plugin entry = a `register(host)` function, not import-time side effects.** It returns or registers
   pattern types, section types, column types, format functions, widgets, map plugins, theme loaders and
   data-type pages. The host calls it at a known time, which makes per-site activation and re-registration
   possible.
3. **Load active plugins inside `dmsSiteFactory` and `buildRoutes`,** after the site row is read and before
   `pattern2routes`. The site (or tenant) row carries the active-plugin list. SSR payload names the plugins so
   `main.jsx` loads them before hydrating.
4. **Make lookups activation-aware, not just registration-aware,** because the hub's SSR process is shared
   across tenants: filter pattern types, section types and pickers by the site's active plugins; namespace
   plugin names.
5. **Turn `damaDataTypes` and the theme `loaders` map into registries** fed by plugins (and pass data-type
   pages to SSR), replacing `dataTypesByApp` with per-site activation.
6. **Decide CSS early.** Either keep the CDN Tailwind runtime (conflicts with the RSC performance plan), ship
   prebuilt plugin CSS, or compile a per-site sheet at install time on the server.
7. **"No restart" is realistic for the browser and for data-only themes; it is partial for SSR** (versioned
   `import()` in Node plus `invalidateRoutes()`, with old versions held in memory until a restart). The
   existing rebuild-and-promote site path is a fallback that already avoids restarts.
8. **Upgrades and uninstalls need a page reload on the client** (ES modules can't be unloaded; registries have
   no unregister). Design for "takes effect on next load".
9. **Plugin formats need a server-side install step per activating app** (`register-formats.js`), so activation
   is a server operation, not only a client one.
10. **Cover all three render paths** (SPA, SSR, RSC) with one registration contract, and remove the duplicated
    per-theme registration in `SectionIslands.jsx`.
