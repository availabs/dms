# Pluggable pattern interface + move `mapeditor` (and the page Map section) out of the library into dms-template

**Initiatives:** [tes_licensing_open_core](../../../../../planning/initiatives/tes_licensing_open_core.md) (primary), [dms_map_stack](../../../../../planning/initiatives/dms_map_stack.md) · **Status:** built · **Release:** commit — library submodule + dms-template together (src/patterns/, package.json deps); transportNY sync after · **Created by:** amuro@albany.edu · **Edited by:** —

**Project:** DMS library (+ dms-template as the first external consumer) · **Topic:** patterns · **Started:** 2026-10-08

**▶ Next session, start here.** Phases 0–8 are **built and verified** (automated, builds, SSR parity, and
headless live checks). What's left:
- the authenticated live checks listed under Phase 8 (admin Add Pattern, the Map settings menu and
  symbology selector in the page editor, a symbology save, the signed-in TransportNY plugin pages)
- the owner's commit/deploy (the library and dms-template **together**)
- the transportNY sync items
- the optional avail forms-row data fix

## Objective

1. Make **pattern types a pluggable interface** in `@availabs/dms`. A host app registers its own pattern
   type from outside the library, and the library treats it exactly like a built-in type: routing, the
   admin "add pattern" list and pills, settings, permissions and SSR.
   - A registration can **optionally also register page-pattern section components** through the
     existing `registerComponents` mechanism.
2. **Prove it by moving the `mapeditor` pattern out of the library** into `dms-template/`, together with
   the page pattern's **Map section component**, which becomes part of the mapeditor pattern. The pattern
   is registered through the new interface, and its registration adds `Map` to the page pattern's
   section components. Afterwards the library holds no `mapeditor` code, no Map section, and no
   `'mapeditor'` or Map-specific branches in the page pattern.

**Why (open core):** the core library should hold the platform patterns (page, datasets, admin, auth, qa).
Domain-heavy patterns, and the section types that come with them, should live in the app that ships them.
That keeps the core small and licensable on its own terms, and it gives every future client pattern a
supported path that doesn't mean editing or forking the library.

The Tessera Open Sheet lists this exact coupling as an open-core blocker:
`planning/tessera/reports/open-sheet.html`, row "1 · Map section — the hard one", which says
`page/…/ComponentRegistry/map/` imports the mapeditor internals. This task removes it.

> **Design note (2026-10-08, owner direction).** The first draft of this plan kept the Map section in the
> page pattern and split a "shared map runtime" out of mapeditor, to break the page ↔ mapeditor import
> cycle. The owner chose the other way round: **move the Map section into the mapeditor pattern, and have
> the pattern's registration register it as a page component.** The cycle then becomes imports inside one
> pattern, and nothing has to be split. The cost is moving the page pattern's few Map-specific branches
> behind generic component-registry hooks (Phase 3), and widening the export surface to cover what the
> Map section uses from the page pattern (Phase 5).

> **Design note (2026-10-08, owner decisions):**
> - **Everything in the page pattern that references the map gets a generic replacement**, and the page
>   pattern stops knowing about the map.
> - **The export surface grows to named exports** (Open question 4, resolved).
> - **The release risk is accepted.** Any build without the registration loses Map sections.
> - **Pattern themes (Open question 7, resolved).**
>   - Every pattern has a **`defaultTheme` object** that collects all the theme objects in the pattern.
>     Those are the pattern's defaults.
>   - When the pattern is registered, that object is registered onto the theme **under the pattern's name**.
>   - Other themes style the pattern by adding keys under that name.
>   - So `damaMap` moves from the page pattern's theme to the mapeditor's: `theme.pages.damaMap` →
>     **`theme.mapeditor.damaMap`**.
> - **Map plugins (Open question 8, resolved).** `damaMapPlugins` must keep working, but its API may change.
>   - Plugins are to the pattern what section components are to the page pattern. So **the pattern
>     exports a way to register them**, and projects that want plugins call it in their `App.jsx`.
>   - It replaces the `DmsSite` `damaMapPlugins` prop.

## Scope

**In:**
- A pattern-type registry in the library. Built-ins register through it too, so there's one code path.
- An optional `pageComponents` slot on a pattern registration, wired to the existing `registerComponents`.
- A `defaultTheme` slot on every pattern registration, registered onto the theme under the pattern's
  name. Built-ins move onto it too, so `ui/defaultTheme.js` stops importing pattern themes. The mapeditor's
  `defaultTheme` holds `damaMap`, and the dms-template theme overrides and readers move to
  `mapeditor.damaMap`.
- A plugin-registration export on the mapeditor pattern (`registerMapPlugins`), called from a project's
  `App.jsx`. It replaces the `damaMapPlugins` `DmsSite` prop.
- Every place that hard-codes the list of pattern types reads the registry instead: the site factory, the
  admin pattern-type lists and pills, the settings dmsEnv list, permission options and tenant provisioning.
- Removing every Map- and mapeditor-specific branch from the page pattern, replaced by generic
  registry hooks that any section component can use:
  - the settings-menu API switch
  - the shareable-map page variables
  - map plugin registration
  - the symbology catalog keys
  - the `damaMap` theme default
- Moving the Map section (`PMAP`, 34 files, about 512K) into the mapeditor pattern.
- A deliberate public export surface: everything the moved pattern needs, imported by name rather than by
  deep `src/...` path.
- Moving the pattern to `dms-template/src/patterns/mapeditor/`, registered for the client and for SSR.
- Repointing the dms-template map plugins (transportny `macroview`, `routecreation`, `detour`, `routing`).
- Updating the docs and skills that cite the old paths, plus a new how-to for registering a pattern.

- **Removing every trace of the `forms` pattern type** from the project (owner decision, Q6). That covers
  the library, dms-server, the CLI, dms-template themes and docs. Historical planning docs are exempt.

**Out:**
- **Per-app pattern selection.** Every app gets mapeditor, because it's registered unconditionally in
  `App.jsx` (owner decision, Q5). The owner wants to look at per-app customization later, perhaps
  modelled on `src/data-types.js` `dataTypesByApp`, but not in this task.
- **transportNY** (`/home/alex/code/old/transportNY`). Its vendored library is synced from dms-template.
  Once this lands, the next sync must carry `src/patterns/` and the registration, or **every Map section
  on TransportNY pages** stops rendering, along with its mapeditor routes. That's recorded as a release
  hazard, not done here. Its legacy `pages/DataManager/MapEditor/` is untouched.
- `ui/components/map` (`AvlMap`, `AvlLayer`, `useMapTheme`, the base `map` theme) **stays in the library**.
  The datasets pattern's `gis_dataset` Map page uses it (`Map.jsx`, `Layer2.jsx`), and so does
  `ui/defaultTheme.js` and `tests/avlMapFloatActions.test.js`.
- Code-splitting the siteConfig modules with `await import()` per pattern (the async `resolvePatterns()`
  idea in [bundle-split-initial-graph.md](../completed/bundle-split-initial-graph.md)).
- Moving `qa`, `datasets` or any other built-in type out of the library.
- Server-side pattern registration. dms-server dispatches on the row *kind* (`pattern`, `page`, `source`,
  …), not on `pattern_type`. Nothing is needed there.
- Renaming stored data. Pattern rows keep `pattern_type: 'mapeditor'`, `{instance}|symbology` rows stay
  as they are, and sections keep the element-types `Map` and `Map: Dama Map`. There's no DB migration.
- The SSR handler not receiving `damaDataTypes`, which already differs from the client. This is noted
  but not fixed here.

## Current State

Audited 2026-10-08. Paths are relative to `src/dms/packages/dms/src` (`LIB`):
- `PMAP` = `patterns/page/components/sections/components/ComponentRegistry/map`
- `ME` = `patterns/mapeditor`

### How pattern types are resolved today

- **Registry:** `patterns/index.js` is a static map `{page, admin, auth, datasets, mapeditor, qa}` of
  `./<name>/siteConfig` imports. `resolvePatterns()` (:19) exists, but nothing calls it.
- **The one live consumer** is `render/spa/utils/index.js:11` (`pattern2routes`, :189, **synchronous**).
  - It is called from `dmsSiteFactory` (`render/spa/dmsSiteFactory.jsx:353,365,422`) and from `DmsSite`'s
    `useState` initializer (:82) and fast-path effect (:123).
  - Per pattern row: `const c = patternTypes[pattern.pattern_type]; if(!c) return acc;` (:416). An
    unknown type is **silently skipped**.
  - It calls each config function in the siteConfig array with one object (app, type, baseUrl,
    `format: pattern.config`, pattern, auth fields, `datasources`, `dmsEnvs`, `pgEnv`, `datasetPatterns`,
    themes, `API_HOST`, `damaDataTypes`, `damaMapPlugins`, …) (:462–504). It passes the returned dmsConfig
    to `dmsPageFactory` (:507).
- **siteConfig contract:** a module default-exports an **array of config functions**, e.g.
  `export default [mapeditorConfig]` (`ME/siteConfig.jsx:123`). `qa/siteConfig.jsx:24` reuses
  `pageConfig[0]`, which is a precedent for composition.
- **Type knowledge hard-coded in the factory:**
  - `datasetPatterns = …['forms','datasets','mapeditor'].includes(p.pattern_type)` (:297), which feeds
    the internal datasources
  - `qaPatterns` (:300)
  - auth/admin special-casing (:243, :293, :496, :512)
  - `datasets` for source links (:353, :388)
  - `damaMapPlugins` threaded through `dmsSiteFactory.jsx:45,58` and `render/spa/utils/index.js:203,502`
- **SSR:** `dms-template/src/entry-ssr.jsx` → `createSSRHandler` (`render/ssr2/handler.jsx:58`) → the same
  `pattern2routes`. **SSR needs the same registration.** Dev SSR re-runs `ssrLoadModule` on every
  request (`express/setup.mjs:49-80`). `render/ssr/dms_utils.js:43` is a dead legacy `patternTypes`.

### Admin lists: all hard-coded

| Where | What |
|---|---|
| `patterns/admin/admin.format.js:70-81` | `pattern_type` select options, used by `pages/editSite.jsx:600-609` and `components/patternList.jsx:372-376` |
| `patterns/admin/components/AddPatternPicker.jsx:7-14` | `NON_PAGE_OPTIONS` (datasets, **forms**, qa) and `AUTH_OPTION`. It offers the unregistered `forms` and omits `mapeditor`. |
| `patterns/admin/pages/editSite.jsx:184-193` | `TYPE_PILL_KEY` and `TYPE_ORDER`. The theme key `typePillMapeditor` is set at `editSite.theme.js:75`, and in tessera at `tessera-theme.js:1149`, `tessera-theme-v6.js:1545` and `admin.columnTypes.jsx:17`. |
| `patterns/admin/pages/patternEditor/default/settings.jsx:145` | `showDmsEnvConfig` type list |
| `patterns/admin/utils/adminPermissions.js:97-110,158,171` | `permissionOptionsFor` switch |
| `patterns/admin/utils/tenantProvisioning.js:329,353` | type checks |
| `editSite.jsx:402,425` · `patternEditor/index.jsx:121-127` | qa create hooks · editor tabs (built-in special cases, which stay) |

### The page-component registry (the mechanism to reuse)

`patterns/page/components/sections/componentRegistry.js` keeps `registeredComponents = {...ComponentRegistry}`
and offers:
- `registerComponent(name, def)`
- `registerComponents(map)`, exported from `LIB/index.js`
- `getRegisteredComponents()`
- `preloadSectionComponents(types)`, which calls an entry's optional `preload()`

Today apps reach it only through `theme.pageComponents`, which the page siteConfig registers at
`patterns/page/siteConfig.jsx:76-86`. The other theme-key extension points (`theme.columnTypes`,
`theme.sectionMenu…`, `theme.mapPlugins`) are registered in the same place.

**Map's entry:**
- `ComponentRegistry/index.jsx:17` imports `./map/config`.
- `:43` registers `Map`.
- `:48` registers the legacy alias `"Map: Dama Map": { ...Map, name: 'Map: Dama', hideInSelector: true }`.
- `PMAP/config.jsx` lazy-loads the section as `lazyComponent('section/Map', …)`, so the controls stay
  eager. Its `componentFunctions` declare the component-action providers and subscribers.

### Pattern themes today

- `ui/defaultTheme.js:43-47,207-211` statically imports each built-in pattern's `defaultTheme`, and mounts
  them under `pages`, `datasets`, `auth` and `qa`.
  - The admin theme is spread in at :280.
  - The **page pattern's key is `pages`**, not its type name `page`.
- Components read their pattern's keys through `getComponentTheme(theme, 'pages.sectionGroup')` (and
  similar). `getComponentTheme` (`ui/useTheme.js:453`) is just `get(theme, path)` plus style selection.
- `getBaseTheme` (`ui/useTheme.js:160-173`) merges `defaultTheme` with the selected theme and **caches the
  result per themes registry and selection** (`baseThemeCache`). A theme registered after the first build
  wouldn't be seen unless that cache is cleared.
- **`damaMap` is inconsistent today:**
  - The default is registered at **`theme.pages.damaMap`** (`patterns/page/defaultTheme.js:12,27`).
  - The Map section reads the **top-level** `damaMap`, with its local import as the fallback:
    - `PMAP/index.jsx:341`: `{...damaMapTheme, ...getComponentTheme(themeFromContext, 'damaMap')}`
    - `PMAP/LayerLibraryPanel/LayerLibraryPanel.jsx:87-88`: `damaMap.layerLibrary`
  - dms-template overrides it at the top level (`themes/mny/theme.js:1076`; also check `:17`).
  - The transportny plugins read `damaMap.layerLibrary` (`routecreation/components/RouteEditor.jsx:38`,
    `RouteIdentityPanel.jsx:31`, with comments in `routecreation.theme.js` and `macroview.theme.js`).
- The only theme file in `PMAP` or `ME` is `PMAP/map.theme.js` (`damaMapTheme`). Every other theme read
  goes to library-level keys that stay in the library:
  - `useMapTheme` / `useMapLegendTheme` read `theme.map` (`ui/components/map/map.theme.js`). These are
    also used by the datasets `gis_dataset` map.
  - Also read: `textSettings`, `dataCard`, `field` and `navigableMenu`.
- **Map plugins today:** `RegisterPlugin(name, plugin)` (`ME/MapEditor/pluginRegistry.js`) is fed from
  three places:
  - `theme.mapPlugins`, registered in `page/siteConfig.jsx:121-127` and `ME/siteConfig.jsx:51-52`.
    dms-template sets it in `themes/transportny/theme.js:36`.
  - The `DmsSite` `damaMapPlugins` prop, threaded through `dmsSiteFactory.jsx:45,58` and
    `render/spa/utils/index.js:203,502` into `page/siteConfig.jsx:60,149` and `ME/siteConfig.jsx:29,46`.
    dms-template doesn't pass it. transportNY's `App.jsx:77` does.

### The page ↔ mapeditor tangle

**The page pattern reaches into `ME`:**

| Importer | Imports | Used at |
|---|---|---|
| `patterns/page/siteConfig.jsx:37` | `RegisterPlugin` (`ME/MapEditor/pluginRegistry.js`) | :121-127 `theme.mapPlugins`; :149 `damaMapPlugins` (from the prop, :60) |
| `patterns/page/siteConfig.jsx:141-147` | builds `mapeditorKeys` from datasources whose `pattern_type === "mapeditor"` and puts it into CMSContext | :202 |
| `PMAP/index.jsx:15-18` | `PluginLayer`; `{PluginLibrary, PLUGIN_TYPE}` from the editor's **`index.jsx`** (which pulls the whole editor into the Map chunk); `ExternalPluginPanel`; `buildLayerUdaFilterOptions`, `fetchBoundsForFilter` | :1176, :1110/:1174, :1367, :850/:722 |
| `PMAP/index.jsx:25` | `mapeditorFormat`, used to `apiLoad` each `{instance}\|symbology` catalog | :331, :380-409 |
| `PMAP/{SymbologyViewLayer.jsx:11, controls/FilterControls.jsx:6, settings/filters.jsx:1}` | `normalizeLayerClickFilterConfig` | — |
| `PMAP/useComparisonSeriesLayers.js:44` | `fetchBoundsForFilter` | :315 |
| `PMAP/utils.js:2` | `fnumIndex` (`LayerEditor/datamaps`), which also has a copy at `PMAP/LegendPanel/LegendPanel.jsx:7` | — |

**`ME` reaches back into `PMAP`, which makes the cycle:**
`ME/MapEditor/components/{PluginLayer.jsx:5, ExternalPluginPanel/index.jsx:3, PluginControls/PluginControls.jsx:3}`
import `MapContext` from `PMAP/index.jsx:41`. Once both live in one pattern, these are internal imports.

**The page pattern's other Map-specific branches** (these must become generic before `PMAP` can leave):

| Where | What |
|---|---|
| `patterns/page/components/sections/sectionMenu.jsx:83-91` | `['Map', 'Map: Dama'].includes(currentComponent?.name) && mapAPI?.setState ? mapAPI : dwAPI`. The Map section supplies its own settings API in place of dataWrapper's. |
| `patterns/page/components/sections/components/index.jsx:21,49-50,72,117-120,138` · `section.jsx:224,246,264,508,520,536` | the `mapAPI` handle channel that carries it |
| `patterns/page/pages/_utils/index.js:475-560` (`deriveMapShareVariables`, called at :590), plus the comment at `pages/edit/editPane/settingsPane.jsx:122` | auto-registers page variables (`layers`, and each interactive layer's `searchParamKey`, `type: 'map_share'`) for Map sections with `display.shareableState`, by matching element-types `map` / `map: dama map` |
| `patterns/page/defaultTheme.js:12,27` | `damaMap: damaMapTheme`, imported from `PMAP/map.theme`. dms-template overrides it in `themes/mny/theme.js:1076`, and the transportny `routecreation` / `macroview` plugins read `damaMap.layerLibrary`. |
| `patterns/page/components/sections/components/ComponentRegistry/index.jsx:17,43-48` | the `Map` and `Map: Dama Map` registry entries |

**What `PMAP` takes from the rest of the library** (the import paths that leave the folder; `ME` excluded):

| Target | Symbols | Exported today? |
|---|---|---|
| `patterns/page/context(.js)` | `CMSContext`, `PageContext`, `ComponentContext` | only `CMSContext` |
| `page/.../dataWrapper/buildUdaConfig` | `resolveComparisonVariants`, `SELF_PARAM_KEY_SENTINEL`, `selfParamKey` | no |
| `page/.../dataWrapper/utils/utils.jsx` | `formatFunctions` | no |
| `ui/useTheme` | `ThemeContext`, `getComponentTheme` | no |
| `ui/components/map` · `useMapTheme` · `useMapLegendTheme` | `AvlMap`, `AvlLayer`, the two hooks | no |
| `ui/components/graph_new/colorRange` | `getColorRange` | no |
| `utils/lazyComponent` | `lazyComponent` | yes |

**What `ME` takes from the library** (about 50 imports, `PMAP` excluded):
- `ui/themeContext` (24 files), `ui/useTheme` (`getPatternTheme`, `getComponentTheme`), the default `UI`
  object (`siteConfig.jsx:5`), and `ui/icons` (`JoinQueryBuilder.jsx:6`)
- `ui/components/map` with `useMapTheme` and `useMapLegendTheme`, plus `DraggableList` and `Pill`
  (reachable through `UI`)
- `utils/type-utils` (`getInstance`), `patterns/datasets/utils/authority` (`SourceList.jsx:10`), and
  dataWrapper `formatFunctions`
- already exported: `initializePatternFormat`, `lazyComponent`, `dmsColumnTypes`

dms-template already deep-imports `src/...` in many places, because `packages/dms/package.json` has no
`exports` field (`"main": "dist/index.js"`). "Private" is a convention, not something the build enforces.

**npm:** `ME` and `PMAP` use react, react-router, lodash-es, maplibre-gl, use-immer, uuid and
`@availabs/avl-falcor`. All of them stay in the library too. dms-template's own `package.json` needs
`use-immer`, `uuid` and `@availabs/avl-falcor` added for files under `dms-template/src`.

**Format:** `ME/mapeditor.format.js` declares `type: "symbology"` (`name`, `description`, `symbology`
json, `categories` array). Rows are `{instance}|symbology`. After the move, the editor and the Map section
both read it inside one pattern.

**Hard-coded `'mapeditor'` in the library:**
- client: `admin/admin.format.js:79`, `admin/pages/editSite.jsx:187,193`, `editSite.theme.js:75`,
  `patternEditor/default/settings.jsx:145`, `patterns/index.js:6,15`, `page/siteConfig.jsx:143`,
  `render/spa/utils/index.js:297` (plus :348, :603), and the tests `tests/mountPath.test.js:16` and
  `tests/adminPermissions.test.js:229`
- dms-server: only the one-off scripts `migrate-dama-symbologies.js:140,146` and
  `backfill-component-symbology-names.js:225`

**dms-template importers of `ME`:**
- 7 × `mapeditor/context` (`MapEditorContext`), 2 × `MapEditor/stateUtils` and 1 × `LayerEditor/datamaps`,
  all in the transportny plugins
- These plugins run inside the editor and on page Map sections. They fall back to `CMSContext` when
  `MapEditorContext` is absent (`routecreation/comp.jsx:46-52`, `macroview/comp.jsx:130-135`).

**Docs that cite these paths:**
- `src/dms/skills/editing-map-symbologies.md`, `creating-a-map-section.md:342-344` and
  `creating-pages-from-a-design-pattern.md:178`
- `PMAP/settings/README.md`, `ui/components/map/README.md` and `packages/dms/CLAUDE.md:3`
- `planning/research/map-stack-architecture.md`

## Proposed Changes

### The interface

A small registry module in the library, `patterns/registry.js`. Built-ins register through it in
`patterns/index.js`, and an app registers at module scope in a file that **both** the client entry and the
SSR entry import:

```js
// dms-template/src/patterns/mapeditor/index.js — the pattern's public face
import mapeditorSiteConfig from './siteConfig'
import MapSection from './section/config'                   // was PMAP/config.jsx
import defaultTheme from './defaultTheme'                   // { damaMap: damaMapTheme, … } — every theme object in the pattern
export { registerMapPlugins } from './MapEditor/pluginRegistry'

export default {
  siteConfig: mapeditorSiteConfig,          // same array-of-config-fns contract as built-ins
  label: 'Map Editor',
  admin: { addable: true, order: 40, defaultName: 'Map Editor', usesDmsEnv: true,
           permissionOptions: [/* … */] },
  providesDatasources: true,                // replaces the ['forms','datasets','mapeditor'] list at render/spa/utils:297;
                                            //   mapeditor keeps it ONLY if Phase 0 finds its dmsEnvs need it (Q3)
  pageComponents: {                         // optional; handed to registerComponents()
    'Map': MapSection,
    'Map: Dama Map': { ...MapSection, name: 'Map: Dama', hideInSelector: true },
  },
  defaultTheme,                             // registered onto the theme at theme.mapeditor
}

// dms-template/src/App.jsx  (and src/entry-ssr.jsx, via a shared module)
import { registerPatternTypes } from '<lib>'
import mapeditor, { registerMapPlugins } from './patterns/mapeditor'
registerPatternTypes({ mapeditor })
registerMapPlugins({ /* name: plugin — what `damaMapPlugins` used to carry */ })
```

- **Registry API:** `registerPatternTypes(map)`, `getPatternType(name)` and `listPatternTypes()`.
  - Registering a name that already exists overrides it and logs a dev warning, so an app can replace a
    built-in.
  - The registry is a plain module-level object, like `componentRegistry.js`.
- **`pageComponents`:** `registerPatternTypes` passes these to the page pattern's existing
  `registerComponents`.
  - The registration is **app-wide and independent of pattern rows**. A site with page Map sections but
    no mapeditor pattern row still gets `Map`. That matches today, where `Map` is always registered.
  - The element-type keys stay `Map` and `Map: Dama Map`, and the lazy id stays `section/Map`, so stored
    sections, `preloadSectionComponents` and SSR lazy ids are unchanged.
- **`defaultTheme`:** every pattern registration carries one. It holds all of the pattern's theme objects
  and is registered onto the library default theme **under the pattern's name** (`theme.mapeditor`).
  - Site themes style the pattern by adding keys under that name, and they merge through the normal
    `getBaseTheme` → `mergeTheme(defaultTheme, selectedTheme)` path.
  - Registering clears `baseThemeCache` (`ui/useTheme.js:160`), so a late registration is still picked up.
  - **Built-ins move onto the same slot.** `ui/defaultTheme.js` stops importing the pattern themes
    (:43-47, :207-211, :280).
  - The theme key is the pattern name, with one exception: the page pattern keeps **`pages`**, because
    every site theme already writes `pages.*`. The registration takes an optional `themeKey` for that
    case. Admin's spread at :280 needs a look in Phase 0.
- **Pill style:** the theme key is derived as `typePill${Name}`, with a generic `typePillDefault`
  fallback. dms-template themes keep `typePillMapeditor`.
- **`pattern2routes`** warns **once per type** in dev when a row names an unregistered `pattern_type`.
- **Built-in special cases stay:** auth/admin routing, qa create hooks and the editor tabs.

### Generic component-registry hooks (replace the page pattern's Map branches)

Each one is a field on a section-component registry entry, so any registered component can use it, not
just Map:

1. **Component-supplied settings API.** The section handle carries a generic `componentAPI`, renamed from
   `mapAPI` in `components/index.jsx` and `section.jsx`.
   - `sectionMenu.jsx:89` uses it whenever the entry declares that it supplies its own API (for example
     `settingsAPI: 'component'`), instead of matching the names `Map` / `Map: Dama`.
   - The Map section's handle exposes `componentAPI`.
2. **Section-derived page variables.** A registry entry may have
   `derivePageVariables(elementData, ctx) → vars[]`.
   - `pages/_utils/index.js:590` loops over the page's sections, looks up each element-type's entry, and
     calls the hook. It keeps the existing de-duplication by searchKey.
   - `deriveMapShareVariables` moves into the Map section as its hook. The `type: 'map_share'` vars and
     the "one `layers` var per page" rule are unchanged.
3. **Map plugins** (owner decision, Open question 8). Plugins are to the mapeditor pattern what section
   components are to the page pattern, so the pattern owns their registration.
   - Map plugin registration leaves `page/siteConfig.jsx` (:37, :60, :121-127, :149).
   - **The pattern exports `registerMapPlugins(map)`.** It takes a name → plugin map, like
     `registerComponents`, and feeds `PluginLibrary`. A project that wants plugins calls it in its
     `App.jsx` (and in its SSR entry, if SSR renders plugin UI; checked in Phase 0). This is what
     replaces passing `damaMapPlugins` to `DmsSite`.
   - **The `damaMapPlugins` prop is removed** from `DmsSite` / `dmsSiteFactory.jsx:45,58`,
     `render/spa/utils/index.js:203,502` and the siteConfig args (`page/siteConfig.jsx:60`,
     `ME/siteConfig.jsx:29`). transportNY's `App.jsx:77` becomes a `registerMapPlugins(damaMapPlugins)`
     call when it next syncs, which goes on the release hazard list.
   - **Theme-provided plugins move to `theme.mapeditor.mapPlugins`** (owner decision, Open question 10),
     following the pattern-theme rule.
     - The Map section and the editor register plugins from the theme in context. The editor already
       does this from `theme.mapPlugins` at `ME/siteConfig.jsx:51-52`, and registering is idempotent.
     - Theme-scoped registration stays, so transportny's plugins still appear only on transportny-themed
       sites.
     - `themes/transportny/theme.js:36` moves its block under `mapeditor`.
4. **Symbology catalog keys** (owner decision, Q3). `mapeditorKeys` leaves `page/siteConfig.jsx:141-147,202`
   and CMSContext.
   - `pattern2routes` passes every siteConfig a generic **`sitePatterns`** argument: the site's pattern
     rows. The page siteConfig puts it into CMSContext.
   - The Map section finds mapeditor pattern instances there, by `pattern_type === 'mapeditor'`. That
     string now legitimately lives inside the pattern.
   - This no longer goes through `datasources`, so it no longer suffers from the `dmsEnvId` dedupe at
     `render/spa/utils/index.js:373-385`. That dedupe silently drops a mapeditor pattern sharing its
     dmsEnv with an earlier datasets pattern; this is a latent bug, found by reading the code.
5. **Theme** (owner decision, Open question 7).
   - `damaMap` leaves `page/defaultTheme.js:12,27`, and the mapeditor pattern's `defaultTheme` registers
     it at `theme.mapeditor.damaMap`.
   - The Map section reads `getComponentTheme(theme, 'mapeditor.damaMap')` and
     `'mapeditor.damaMap.layerLibrary'` (`PMAP/index.jsx:341`, `LayerLibraryPanel.jsx:87-88`).
   - dms-template's overrides and readers move to `mapeditor.damaMap`: the mny theme block, and the
     transportny `routecreation` panels and theme comments.
   - Any `damaMap` stored in DB theme rows or `pattern.theme` overrides is found in Phase 0 and either
     migrated or given a fallback read.

### Phases

#### Phase 0: Decisions + BC checks — DONE 2026-10-08
Baselines, kept in the session scratchpad: library vitest has 842 passing tests, with 3 known-red
(`avlGraphThemeDefaults`, and 2 in `syncDeltaConvergence`) plus 1 error (`adminPatternRow.integration`,
happy-dom). The client and SSR `vite build`s both pass (SSR bundle 2,787 kB). There's a JSON snapshot of
the fully merged default theme, and the registered section components are `AVLGraph, Card, Filter,
Footer:MNYFooter, Graph, Header:DefaultHeader, Header:MNYData, Item, Map, Map: Dama Map, PDFGenerator,
Spreadsheet, lexical`. The DB checks were all read-only (`BEGIN READ ONLY`) over the 75 non-test
`dms_*` schemas in `dms3` (mercury).

- [x] Answer the open questions. All ten were resolved by the owner on 2026-10-08; see Open questions
      and the Design notes.
- [x] **Q3: mapeditor does NOT need `providesDatasources`.**
  - The four mapeditor patterns are `mitigat-ny-prod` `prod|map_editor_test` and `npmrdsv5`
    `dev2|mapeditor`, `dev2|mapeditor_test` and `dev2|map_editor_test`.
  - All four have `dmsEnvId = null` and no `sources`.
  - Today they only add empty "managed" entries to the source pickers. Mapeditor registers without the
    flag.
- [x] **Q6: 6 `forms` pattern rows exist:**

  | App | Row | base_url | dmsEnv | Attached to site? | Covered by a datasets pattern's dmsEnv? |
  |---|---|---|---|---|---|
  | asm | `nhomb\|alex_data` 1066382 | — | 2060502 | yes | yes (asm datasets 2060502) |
  | avail | `site\|datasets` 1430697 ("Datasets") | `/datasets_old` | 2059572 | **yes** | **no** (avail datasets_2 uses 2059573) |
  | mitigat-ny-prod | `prod\|test_meta_forms` 736402 | `/forms` | 1676363 | yes | yes (prod\|datasets 1676363) |
  | mitigat-ny-prod | `prod\|plant_data` 1165589 | `/data` | 1676364 | no | — |
  | mitigat-ny-prod | `prod\|my_plant_database` 1197975 | `/data` | 1676365 | no | — |
  | wcdb | `prod\|datasets` 1471745 | `datasets_old` | 1957794 | no | — |

  - Data **loading** is unaffected by removing `forms`. The server's UDA `getSitePatterns`
    (`dms-server/src/routes/uda/utils.js:257`) resolves a section's `srcEnv` by pattern instance, whatever
    the `pattern_type`, so existing sections bound to these envs keep working.
  - **Authoring** loses something:
    - **avail**: the sources in dmsEnv 2059572 leave the page source pickers.
    - **MNY**: dmsEnv 1676363's picker entry switches from the `…+test_meta_forms` env key to
      `…+datasets`. The same sources stay; existing sections keep their stored `srcEnv`.
  - Optional data fix, which is the owner's call and a DB write not done here: convert avail 1430697 to
    `datasets`, or move its sources onto 2059573. Converting it would also make it routable at
    `/datasets_old`.
- [x] Q6: `initializePatternFormat` / `updateRegisteredFormats` (`dms-manager/_utils.jsx:21-27,107-121`)
      overwrite `format.app` on the root format and every registered format. The `app: "forms"` placeholder
      in `datasets.format.js` is therefore inert and safe to rename.
- [x] **Unregistered element-type:**
  - In edit mode, `section.jsx:105` falls back to `lexical`.
  - In view mode, `section.jsx:386` gets `undefined`, and the section renders without a component.
  - That's acceptable, because dms-template always registers mapeditor. No placeholder is added; this is
    recorded for library consumers that don't register it.
- [x] Theme checks:
  - The theme editor does **not** enumerate pattern theme keys. `ui/themeSettings.js:19,38` imports
    `pagesThemeSettings` directly, and that has no `damaMap` entry, so nothing changes there.
  - Admin's theme is `theme.admin = { navOptions, page, ...adminPatternTheme }`
    (`ui/defaultTheme.js:258-281`), so admin's `themeKey` is `admin`. The registry deep-merges a pattern's
    `defaultTheme` into whatever is already at that key.
  - In the stored DB themes, **0** `:theme` rows and **0** `pattern.theme` overrides contain `damaMap` or
    `mapPlugins`, so no data migration or fallback is needed. The dms-template code themes are the only
    overrides.
- [x] **Plugins + SSR:**
  - The SSR server preloads every lazy component and renders it (`utils/lazyComponent.js:9-27`), so a
    Map section, and any plugin panels it renders, can appear in server HTML.
  - Registrations made through `theme.mapeditor.mapPlugins` happen in the render path on both sides.
  - Any `registerMapPlugins(…)` call therefore belongs in the shared registration module that both
    `App.jsx` and `entry-ssr.jsx` import.
  - dms-template itself passes no `damaMapPlugins`; transportny uses the theme.
- [ ] Confirm that nothing else in the page pattern names Map. This moved into the Phase 3 gate.

#### Phase 1: Pattern registry in the library (no behaviour change) — DONE 2026-10-08
- [x] `patterns/registry.js` (new) provides `registerPatternTypes`, `getPatternType` and
      `listPatternTypes` (sorted by `admin.order`, then by registration order).
  - A definition without a `siteConfig` array throws. Re-registering a name replaces it and warns in dev.
  - `pageComponents` go to the page pattern's `registerComponents`.
  - `defaultTheme` is set on the library default theme at `themeKey ?? name`. If the key already holds
    a theme, the new one is merged in with `mergeTheme`.
  - Every registration calls the new `resetBaseThemeCache()` (`ui/useTheme.js`; `baseThemeCache` is now
    a `let`).
  - The header comment documents the definition shape.
- [x] `patterns/index.js` registers the six built-ins with their labels, picker descriptions, `admin`
      metadata (`addable`, `order`, `defaultName`, `usesDmsEnv`), `providesDatasources` (datasets;
      mapeditor still has it until Phase 2) and their `defaultTheme`s (page with `themeKey: 'pages'`).
  - Its default export (the static map) is gone. `resolvePatterns()` now returns a name → siteConfig
    map built from the registry.
- [x] `ui/defaultTheme.js` no longer imports any pattern theme. The admin pattern's inline `navOptions`
      and `page` defaults moved into `patterns/admin/defaultTheme.js`, so `theme.admin` is now built
      entirely by the admin registration.
- [x] `render/spa/utils/index.js` routes with `getPatternType(pattern_type)?.siteConfig`. A row whose type
      isn't registered is skipped, as before, but now logs a dev warning once per type
      (`warnUnregisteredPatternType`).
- [x] The registry functions are exported from `LIB/index.js`.
- [x] **Deleted the whole dead `render/ssr/` folder** (`dms_api.ts`, `dms.tsx`, `dms_utils.js`,
      `falcor.ts`, `index.tsx`). Nothing in the library, dms-server or dms-template referenced it, and
      `dms_utils.js` still imported a `forms/siteConfig.jsx` that no longer exists.
- [x] **Gate passed:** after `import "patterns"`, the merged default theme is **identical** to the
      Phase 0 snapshot (canonical deep-equal, key order ignored). The registered section components are
      identical too.
- [x] Tests:
  - New `tests/patternRegistry.test.js` (9 tests) covers built-in order and theme keys, routing an
    app type, the unregistered-type warn-once, `pageComponents`, `defaultTheme` mount plus site override
    through a pre-warmed cache, and re-register with a warning.
  - `qaPattern.test.js` now reads `getPatternType("qa").siteConfig`.
  - `qaDefaultTheme.test.js` and `adminThemeLogo.test.js` now `import "../src/patterns"` first, because
    pattern themes come from the registrations.

#### Phase 2: Factory + admin read the registry; `forms` removed — DONE 2026-10-08
- [x] `render/spa/utils/index.js`:
  - `datasetPatterns` now uses `getPatternType(p.pattern_type)?.providesDatasources`, which is
    datasets only. Mapeditor dropped the flag (Phase 0 finding).
  - Every siteConfig receives a generic **`sitePatterns`** argument (the site's raw pattern rows).
- [x] `patterns/page/siteConfig.jsx`:
  - `sitePatterns` goes into CMSContext.
  - Interim step: `mapeditorKeys` is derived from `sitePatterns` (`${app}+${getInstance(type) || doc_type}`)
    rather than from `datasources`. That fixes the `dmsEnvId` dedupe bug. Phase 3 moves the computation
    into the Map section.
- [x] `admin.format.js`: the `pattern_type` select options are a **getter** over `listPatternTypes()`
      (`admin.addable`; admin excluded). Formats are `cloneDeep`'d inside the config functions at call
      time, so types an app registers later still appear (tested).
- [x] `AddPatternPicker.jsx`:
  - The cards are built from the registry (`patternTypeCards`): addable types except `page`, with
    `auth` last and only when the site has none, and the `QA_PATTERN_ENABLED` filter kept.
  - The tag class is `tag<Type>`, falling back to a new `tagDefault`. The default name comes from
    `admin.defaultName`.
  - **Design note:** Map Editor now appears as a picker card. The picker never offered it before; the
    edit modal's select did.
- [x] `editSite.jsx`:
  - `typePillClass()` uses `typePill<Type>`, then `typePillDefault` for any registered type, then
    `typePillUnknown`.
  - The chip order is registered types in admin order, then any unregistered types the site still has
    rows of (e.g. old `forms` rows, so they stay filterable), then `?`.
  - `TYPE_PILL_KEY`, `TYPE_ORDER` and the `chipInactive` branch are gone.
  - `editSite.theme.js`: removed `typePillMapeditor`, `typePillForms` and `chipInactive`; added
    `typePillDefault` (the old mapeditor style).
- [x] `patternEditor/default/settings.jsx`: `showDmsEnvConfig` now reads `getPatternType(type)?.admin?.usesDmsEnv`.
- [x] `adminPermissions.js` `permissionOptionsFor` and `tenantProvisioning.js` are unchanged. They only
      name core types (admin/auth/page/datasets), and mapeditor already fell to the default branch.
- [x] **`forms` removed everywhere:**
  - **library:** `patterns/index.js` (the commented lines), `render/spa/utils/index.js` (the
    `datasetPatterns` list and comments, plus the whole dead trailing copy of `pattern2routes` and the
    now-done "Allow users to pass Pattern Configs" todo), the dead `render/ssr/` folder (Phase 1),
    `admin.format.js`, `AddPatternPicker.jsx` / `.theme.js`, `editSite.jsx` / `.theme.js`, `settings.jsx`,
    the `admin/siteConfig.jsx` comment, and `datasets.format.js`.
  - In `datasets.format.js`, the placeholders `app: "forms"` and `format: 'forms+…'` became
    `datasets`/`datasets+…`. They're inert, because `initializePatternFormat`, `updateRegisteredFormats`
    and `updateAttributes` overwrite them. `type: "form-manager"` is **kept**: it is part of stored row
    types, so it's a data identifier.
  - `page-pattern-guide.md`.
  - **CLI:** `commands/dataset.js`, `commands/site.js`, `utils/data.js`, `docs/TYPES.md`.
  - **dms-server:**
    - `scripts/migrate-site.js` and `migrate-to-dmsenv.js` handle `datasets` only.
    - `scripts/cleanup-db.js`'s orphan-source check now treats a source as owned by **any** legacy pattern
      row with a matching `doc_type`, whatever its type. That is conservative: dropping `'forms'` from a
      type list would have flagged forms-owned sources as orphans to delete.
    - `scripts/README.md`.
    - `tests/test-uda.js` fixtures now use `datasets`: **141/141 pass**.
  - **dms-template:** tessera `admin.columnTypes.jsx`, `tessera-theme.js` / `-v6.js` (`typeBadgeForms`),
    and `themes/transportny/qa_skills/tools/lib/cr.mjs` (the datasets-pattern lookup; npmrdsv5 has no
    forms rows).
  - **docs:** `src/dms/CLAUDE.md`, `src/dms/planning/planning-rules.md` (topic list), and the empty
    `### patterns/forms` heading in `src/dms/planning/todo.md`. `dms-template/CLAUDE.md` and
    `packages/dms/CLAUDE.md` are updated in Phase 7, together with the mapeditor move.
  - Kept on purpose:
    - `completed.md`'s historical `### patterns/forms` section (history)
    - `qaReportIssue.test.js:140`, where `url_slug: 'forms'` is a page slug
    - a "forms" section id in a `references/admin IA` mockup generator (an MNY form-coverage section)
- [x] Tests: `patternRegistry.test.js` adds 2 admin-list tests (select options from the registry, with
      no admin and no forms; a late registration appears). Full suite: **854 pass**, with only the
      baseline 3 known-red plus 1 happy-dom error.

#### Phase 3: Make the page pattern Map-agnostic, with Map still in place — DONE 2026-10-08
Three generic section-registry hooks and one pattern-registry hook replace every Map branch in the page
pattern.
- [x] **`managesOwnState` registry flag + `settingsAPI` handle field** (replacing the `mapAPI` channel and
      the `['Map','Map: Dama']` name check):
  - `components/index.jsx` (both NonData wrappers) caches and forwards a child's `settingsAPI`;
    `section.jsx` reads `dwHandle?.settingsAPI`.
  - `sectionMenu.jsx`: `componentAPI = currentComponent?.managesOwnState && settingsAPI?.setState ? settingsAPI : dwAPI`.
    It passes `settingsAPI` to menu-item types, arg options and extension builders.
  - The same flag makes `convertOldState(…, managesOwnState)` return element-data unconverted, replacing
    its `if (oldState?.symbologies)` map sniff.
  - `migrateToV2`'s map sniff was **dead code** and is deleted. Only dataWrapper components and the
    Spreadsheet/Card/Graph preload reach it.
  - Map: `config.jsx` sets `managesOwnState: true`, `index.jsx` emits `settingsAPI` (it was `mapAPI`),
    and the 9 `renderMenuField` adapters in `settings/controls.jsx` read `settingsAPI` (the Map's
    internals keep their local `mapAPI` name).
  - **Design note:** the flag is needed on top of the handle field. Without it, a section whose type was
    just switched away from Map could keep a stale cached `settingsAPI` (the old name check guarded
    this too).
- [x] **`derivePageVariables(elementData)` registry hook**:
  - `pages/_utils/index.js` has the new generic `deriveSectionPageVariables(item)`. It covers published
    and draft sections, does a case-insensitive element-type lookup through `getRegisteredComponents()`,
    and keeps the first entry per searchKey. `getPageVariableRegistry` uses it.
  - Map's logic moved to `map/map.pageVariables.js` (`deriveMapShareVariables(cfg)`, per section) and is
    registered in `config.jsx`. The legacy alias spreads the same entry.
  - The output is identical to the old code for single and multiple shareable maps (tested). The
    `settingsPane.jsx` comment was updated.
  - `_utils` now imports `componentRegistry`. Tests and both builds show no import-cycle problem.
- [x] **Map plugins: `registerFromTheme(theme)` pattern-registry hook + `registerMapPlugins(map)`**
      (owner decision Q8/Q10):
  - `pattern2routes` calls every registered type's `registerFromTheme` with every theme the site loaded,
    at route build. That's the same moment and the same site-wide reach as the page siteConfig's old
    registration.
  - Mapeditor's hook calls `registerMapPlugins(theme?.mapeditor?.mapPlugins)`. `registerMapPlugins` is
    new in `MapEditor/pluginRegistry.js`.
  - The `damaMapPlugins` prop/arg is removed from `dmsSiteFactory.jsx`, `pattern2routes`,
    `page/siteConfig.jsx` and `mapeditor/siteConfig.jsx`. `theme.mapPlugins` handling is gone from both
    siteConfigs.
  - **Design note: render-time registration from the Map section's own theme was tried and reverted.**
    A read-only check of `npmrdsv5` found pages on both `transportny` (7) and `transportnyv2` (10, which
    ships no plugins) themes, and all 3 mapeditor patterns on no theme at all. Meanwhile 88/25/24 Map
    sections use detour/macroview/routecreation. Theme-scoped registration would have dropped their
    plugins.
  - dms-template `themes/transportny/theme.js` moved `mapPlugins` under `mapeditor`.
- [x] **Symbology catalog keys:** `mapeditorKeys` left `page/siteConfig.jsx` and CMSContext. The Map
      section computes them with `useMemo` from `CMSContext.sitePatterns` (`pattern_type === 'mapeditor'`),
      and `getInstance` is imported from `utils/type-utils`.
- [x] **Theme:**
  - New `patterns/mapeditor/defaultTheme.js` (`{ damaMap }`), registered with mapeditor's `defaultTheme`,
    so it lives at `theme.mapeditor.damaMap`. `damaMap` was removed from `page/defaultTheme.js`.
  - Readers moved to `mapeditor.damaMap(.layerLibrary)`:
    - library: `map/index.jsx`, `LayerLibraryPanel.jsx`
    - dms-template transportny: `RouteEditor.jsx`, `RouteIdentityPanel.jsx`, `controlsPanel.jsx`,
      `contextPanel.jsx`, `downloadBuilder.jsx`, plus the comments in `routecreation.theme.js`,
      `macroview.theme.js`, `comp.jsx`
  - The MNY override in `themes/mny/theme.js` moved under `mapeditor`. No stored DB theme holds `damaMap`
    (Phase 0).
  - Theme snapshot vs Phase 0: the only diffs are `pages.damaMap` → `mapeditor.damaMap` (same content)
    and the intended Phase 2 admin keys.
- [x] **Gate passed:** outside `ComponentRegistry/map/` and `ComponentRegistry/index.jsx`, the page pattern
      has no `mapeditor`, `damaMap`, `mapAPI`, `RegisterPlugin`, `mapPlugin`, `map_share`, `mapeditorKeys`
      or `'Map'` / `'Map: Dama'` strings, and no `symbologies` sniffing.
- [x] Tests: new `tests/sectionPageVariables.test.js` (6 tests). Full suite: **860 pass**, with only the
      baseline 3 known-red plus 1 happy-dom error.
- [ ] Live check (the Map settings menu, shareable `?layers=`, plugins, the symbology selector) is folded
      into Phase 8.

#### Phase 4: Move the Map section into the mapeditor pattern, still in the library — DONE 2026-10-08
- [x] Moved `PMAP/**` (34 files) to **`patterns/mapeditor/section/**`**, using plain `mv` (no git; the
      owner handles version control).
  - A move script (session scratchpad `move_tree.py`) recomputed **40** relative specifiers: the moved
    files' imports that leave the tree, plus every outside import that points into it.
  - Outside imports covered: the 3 `MapContext` importers in `MapEditor/components/…`,
    `mapeditor/defaultTheme.js`, and in dms-template the 5 transportny `damaMapTheme` importers and
    `MeasurePicker/composeMapConfig.js` (`choroplethPaint`).
  - Path comments in 7 transportny files now say `mapeditor/section/…`.
  - `tests/avlMapFloatActions.test.js` reads the new source path. Its Map-section describe block moves to
    dms-template with the pattern in Phase 6.
- [x] `ComponentRegistry/index.jsx` no longer imports or lists Map. The built-in mapeditor registration
      in `patterns/index.js` registers `Map` and the hidden `'Map: Dama Map'` alias through
      **`pageComponents`**.
  - The lazy id `section/Map` is unchanged. The sorted registered-component keys are identical to
    Phase 0.
  - **Design note:** the section "Type" picker lists entries in registration order, so Map now appears
    after Graph rather than before it. This is cosmetic.
- [x] The page ↔ mapeditor cycle is now imports inside one pattern. Nothing under `patterns/page/`
      imports from `patterns/mapeditor/`.
- [x] `section/index.jsx` imports `PluginLibrary` and `PLUGIN_TYPE` from `MapEditor/pluginRegistry`, not
      the editor's `index.jsx` (done in Phase 3).
- [x] **`fnumIndex` NOT deduped (design note).** `section/LegendPanel/LegendPanel.jsx`'s copy is a
      different formatter from `MapEditor/.../datamaps`: it spaces the suffix, adds `Q`, handles values
      under 1, and maps NaN to `'0'`. Merging them would change legend labels, so both stay.
- [x] Gates:
  - vitest: **860 pass**, baseline reds only.
  - client `vite build` passes (1m39s). Chunk sizes against the baseline: the combined `index-*` chunks
    grew +1,455 B (the registry); the admin chunks shrank slightly.
  - SSR build passes (2,790 kB, up 3 kB).

#### Phase 5: Public export surface — DONE 2026-10-08
- [x] The main entry `LIB/index.js` now also exports:
  - `PageContext` and `ComponentContext` (next to `CMSContext`)
  - `UI`, `Icons`, `ThemeContext`, `getComponentTheme`, `getPatternTheme`, `getInstance`,
    `formatFunctions`
  - `resolveComparisonVariants`, `SELF_PARAM_KEY_SENTINEL`, `selfParamKey`
  - `readAuthority`, `isAuthoritative`, `keyLabel`, `singleAuthoritativeViewId`, `sortAuthoritativeFirst`
- [x] New second entry **`LIB/map.js`** exports `AvlMap`, `AvlLayer`, `useMapTheme`, `useMapLegendTheme`
      and `getColorRange`.
  - **Design note:** re-exporting the map runtime from the main entry would give it a static path from
    the eager bundle. Today it is its own `avl-map-*` chunk, and it still is: the map entry is imported
    only from the lazily loaded pattern code.
- [x] **Design note: the import rewrite happened in Phase 6, not here.** Pointing the editor's imports
      at the library entry while it still lived inside the library would have made a module cycle
      (index → patterns → mapeditor → index). Its siteConfig calls `lazyComponent()` at module load and
      could have hit an uninitialized binding.
- [x] `JoinQueryBuilder.jsx` took `DraggableList` and `Pill` from deep `ui/components/*` imports. It now
      gets them from the `UI` object (`const { DraggableList, Pill } = UI`), which is the library's
      ThemeContext/UI convention, so the export surface didn't need two more names.

#### Phase 6: Move the pattern into dms-template and register it — DONE 2026-10-08
- [x] Installed the dependencies the moved code needs into **dms-template's `package.json`**:
      `use-immer ^0.11.0`, `uuid ^11.1.1`, `@turf/bbox ^7.4.0`, `@turf/helpers ^7.4.0`, matching the
      library's majors. Backups of `package.json` and `package-lock.json` are in the session scratchpad.
  - **Side effect, verified harmless:** npm reported "removed 1009 packages". That was the on-disk
    `node_modules` being pruned to match the lockfile.
  - The lockfile diff is **one** entry removed (`@journeyapps/wa-sqlite`, which no `package.json` or
    source file references) and **no** version changes.
  - Every dependency of dms-template, the dms library and dms-server still resolves.
  - `happy-dom` is now in the root `node_modules`, which **fixed** the baseline vitest error in
    `adminPatternRow.integration.test.js`.
- [x] Moved `patterns/mapeditor/**` (editor plus `section/`) to **`dms-template/src/patterns/mapeditor/**`**
      using the session script `extract_pattern.py`.
  - **50** imports were rewritten to the main entry `~/dms/packages/dms/src` and **16** to
    `~/dms/packages/dms/src/map`. The `~` → `src` alias already exists in `vite.config.js`, and vitest
    and SSR use it too.
  - Every outside importer was repointed: the 7 `MapEditorContext`, 2 `stateUtils`, 1 `datamaps`,
    5 `map.theme` and 1 `section/utils` imports in the transportny plugins.
  - **Gate passed:** no relative import in `src/patterns/mapeditor/` leaves the folder.
- [x] New **`src/patterns/mapeditor/index.js`**: the definition (siteConfig, admin metadata,
      `pageComponents` Map plus the hidden `Map: Dama Map` alias, `defaultTheme`, and
      `registerFromTheme` → `registerMapPlugins(theme.mapeditor.mapPlugins)`). It also exports
      **`registerMapPlugins`**.
- [x] New **`src/patterns/index.js`** calls `registerPatternTypes({ mapeditor })`.
  - `src/App.jsx` and `src/entry-ssr.jsx` both `import './patterns'` ahead of `DmsSite` /
    `createSSRHandler`.
  - `main.jsx` imports App before `preloadLazyComponents(ssrData.lazy)`, so lazy ids are registered
    before hydration.
- [x] The library's `patterns/index.js` no longer registers mapeditor.
- [x] Tests:
  - New **`src/patterns/mapeditor/mapeditor.test.js`** (15 tests) covers registration, routing a
    mapeditor row, the Map components and alias flags, `theme.mapeditor.damaMap`, the admin option,
    `registerMapPlugins`, theme plugins registered at route build, and the old top-level
    `theme.mapPlugins` being ignored.
  - It also holds the Map share-state page-variable cases and the floatMapActions source contract,
    both **moved** out of the library's `sectionPageVariables.test.js` and `avlMapFloatActions.test.js`.
  - Library tests are app-agnostic now: `sectionPageVariables` uses fake components,
    `patternRegistry` asserts no mapeditor/Map/`pages.damaMap` and tests `registerFromTheme`, and
    `adminPermissions` uses a fake type.

#### Phase 7: Remove from the library + docs — DONE 2026-10-08
- [x] **Gate passed:** `grep -rniE "mapeditor|damaMap|mapAPI|mapPlugin|RegisterPlugin|['\"]Map: Dama|mapeditorKeys" packages/dms/src`
      finds **nothing**. Three registry comments that named the map editor as the example were
      reworded.
  - Intentionally kept: `tests/mountPath.test.js:16` (`"/mapeditor"` is a real npmrdsv5 **mount URL**
    in fixture data), and the dms-server one-off scripts that query stored `|symbology` rows.
- [x] **Docs:**
  - New **`src/dms/documentation/pattern-registry.md`** (reference) and
    **`src/dms/skills/registering-a-pattern-type.md`** (how-to, indexed in `skills/README.md`).
  - Updated to the new paths or model: `skills/creating-a-map-section.md`,
    `skills/editing-map-symbologies.md`, `skills/creating-page-section-components.md` (which now covers
    `pageComponents`, `derivePageVariables` and `deriveSectionPageVariables`),
    `skills/creating-pages-from-a-design-pattern.md` (pattern-type table without forms, plus qa and
    mapeditor-as-app-type), `skills/traversing-dms-pages.md`, `packages/dms/CLAUDE.md` (the patterns
    list, and theme registration through the registry), `packages/dms/cli/docs/TYPES.md`.
  - `dms-template/CLAUDE.md` (architecture: `src/patterns/`, the built-in list, no forms).
  - Repointed links and comments: `planning/shared/component-qa-prompt.md` (8 links into the old Map
    path), transportny `scripts/convert_old_reports_lib/route_map.py`, and 2 design-system HTML pages.
  - Left alone, as history or research: other people's task docs in both hubs, and
    `src/dms/research/map-page-state-and-filter-architecture.md`. Old → new path map for them:
    `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/` →
    `dms-template/src/patterns/mapeditor/section/`, and `src/dms/packages/dms/src/patterns/mapeditor/` →
    `dms-template/src/patterns/mapeditor/`.

#### Phase 8: Verification + release notes — DONE (except the authenticated checks) 2026-10-08
- [x] **Automated:**
  - library vitest: **857 pass / 3 skipped**, with only the 3 known reds; the happy-dom error is gone
  - app vitest (`src/themes` + `src/patterns`): **495/495**
  - `test-uda.js`: 141/141
  - eslint on every touched file: no `no-undef` and no new unused imports
- [x] **Builds:**
  - client `vite build` passes. The main `index` chunk is 1,807,519 → 1,809,097 B (+1.6 KB, the
    registry). The Map-section chunk (331 KB), `avl-map` and `maplibre` are unchanged.
  - SSR build passes. It's 2,787 → 2,200 kB, because `lexical`, `d3-scale-chromatic`, `use-immer` and
    `uuid` are now resolved from the root `node_modules` and externalized, not bundled.
  - **Deploy note:** the SSR runtime needs dms-template's `node_modules` installed (`npm ci`).
  - An import smoke test of the SSR bundle in Node resolves every external.
- [x] **SSR parity:**
  - Rendered `mapeditortest` (the app-registered editor route, lazy id `mapeditor/MapEditor`), the
    Chemung home page and `/the_risk` with the **baseline and the new SSR bundle**, both against the
    production API (read-only GETs). Status, HTML byte count and lazy ids are **identical**.
  - **Pre-existing, not from this task:** SSR of a Chemung page with Map sections
    (`/the_risk/natural_hazards/extreme_heat`) throws "Portals are not currently supported by the
    server renderer" **in the baseline bundle too**.
- [x] **Live, headless, read-only (anonymous page views on spare-port Vites :5191 and :5192, both stopped
      by PID afterwards):**
  - MNY Chemung `/the_risk/natural_hazards/extreme_heat`: both Map sections render a maplibre canvas,
    the choropleth plus boundary layers and the legends. The container class is MNY's
    **`mapeditor.damaMap.container`** override (`w-full relative h-full flex-1 min-h-[300px]`), so the
    theme move took effect. No page errors.
  - `/mapeditortest`: the editor renders from the app pattern ("Select / Create New Map" plus base map).
  - TransportNY `sandbox2` (a **transportnyv2**-themed pattern, whose theme ships no plugins):
    `/simple_detour` and `/detour_map` render the **detour plugin's** panels. That proves
    `registerFromTheme` registers the `transportny` theme's `mapeditor.mapPlugins` site-wide. No page
    errors.
  - The only new console line is the expected dev warning
    `pattern2routes: no pattern type "forms" is registered`, from the MNY site's attached forms row.
- [ ] **Still needs an authenticated session:**
  - Admin: Add Pattern shows the Map Editor card and pills; the settings dmsEnv picker.
  - The page editor: the Map settings menu through `settingsAPI`, the symbology selector listing the
    catalog, and Refresh.
  - Editing and saving a symbology.
  - `/npmrds/macro` and `/npmrds/route_creation`, which need sign-in.
- [ ] **Release (the owner handles git and deploys):**
  - Library submodule changes and dms-template changes must be committed **together**. The submodule
    pointer may only move with `src/patterns/` and the `package.json` deps.
  - **transportNY sync hazard** (release queue):
    - carry `src/patterns/` and the registration import, or every Map section is lost
    - replace `App.jsx:77`'s `damaMapPlugins` prop with `registerMapPlugins(…)`
    - move its `damaMap` / `mapPlugins` theme keys under `mapeditor`
    - add `use-immer`, `uuid`, `@turf/*`
  - **forms data (owner's call):** avail's attached forms pattern 1430697 (`/datasets_old`, dmsEnv
    2059572) no longer feeds the source pickers. Convert it to `datasets`, or move its sources to
    2059573. Existing sections are unaffected.

## Files Requiring Changes

**Library (`src/dms/packages/dms/src`):**
- **theme:** `ui/defaultTheme.js` (:43-47, :207-211, :280; pattern themes now come from the registry),
  `ui/useTheme.js` (clear `baseThemeCache` on registration), and possibly `ui/themeSettings.js` /
  `themeEditor.jsx` (Phase 0)
- **registry:** new `patterns/registry.js`; `patterns/index.js`; `index.js` (exports);
  `render/spa/utils/index.js` (:11, :203, :297, :348, :416, :502, :603); `render/spa/dmsSiteFactory.jsx`
  (:45, :58); delete `render/ssr/dms_utils.js`'s `patternTypes`
- **page pattern:**
  - `siteConfig.jsx` (:37, :60, :121-149, :202) and `defaultTheme.js` (:12, :27)
  - `components/sections/{sectionMenu.jsx, section.jsx, components/index.jsx, componentRegistry.js,
    components/ComponentRegistry/index.jsx}`
  - `pages/_utils/index.js` (:475-590) and `pages/edit/editPane/settingsPane.jsx` (comment)
- **move:** `PMAP/**` → `ME/section/**`, then `ME/**` → dms-template; delete `ME/`
- **admin:** `admin.format.js`, `components/AddPatternPicker.jsx`, `components/patternList.jsx`,
  `pages/editSite.jsx`, `pages/editSite.theme.js`, `pages/patternEditor/default/settings.jsx`,
  `utils/adminPermissions.js`, `utils/tenantProvisioning.js`
- **tests:** `tests/mountPath.test.js`, `tests/adminPermissions.test.js`, and a new
  `tests/patternRegistry.test.js`
- **docs:** `skills/editing-map-symbologies.md`, `skills/creating-a-map-section.md`,
  `skills/creating-pages-from-a-design-pattern.md`, `ui/components/map/README.md`, `packages/dms/CLAUDE.md`,
  plus the new skill and the documentation section

**dms-template:**
- new `src/patterns/index.js` and `src/patterns/mapeditor/**` (including `section/`, `index.js` and
  `defaultTheme.js`)
- `src/App.jsx`, `src/entry-ssr.jsx`: `registerPatternTypes`, plus `registerMapPlugins` where it's needed
- `src/themes/mny/theme.js` (`damaMap` → `mapeditor.damaMap`), `src/themes/transportny/theme.js:36`
  (`mapPlugins` → `mapeditor.mapPlugins`), and the transportny `routecreation` / `macroview` theme readers
  and comments
- `package.json` (`use-immer`, `uuid`, `@availabs/avl-falcor`, if needed)
- `src/themes/transportny/components/{macroview,routecreation,detour,routing}/**` (imports)

## Testing Checklist

**Automated:**
- [ ] `tests/patternRegistry.test.js`:
  - register, override with a warning, `listPatternTypes` order
  - `pageComponents` reaches `getRegisteredComponents()`
  - `pattern2routes` builds routes for a fake external type and skips an unregistered one with a single
    warning
- [ ] A `derivePageVariables` hook on a fake component shows up in the page's derived variables. Port the
      existing map-share cases to the Map hook.
- [ ] Phase 2 snapshot: the admin options, picker, pills and order are identical.
- [ ] Theme registry:
  - Phase 1 snapshot: the merged default theme is identical once the built-ins register through
    `defaultTheme`.
  - A fake pattern's `defaultTheme` appears at `theme.<name>`, and a site theme's keys under `<name>`
    override it.
  - Registering after a theme was built still shows up, because the cache is cleared.
- [ ] `registerMapPlugins({...})` puts the plugins in `PluginLibrary`. A `theme.mapeditor.mapPlugins`
      entry registers, and a top-level `theme.mapPlugins` entry no longer does.
- [ ] `mountPath` and `adminPermissions` tests pass with a fake type in place of `mapeditor`.
- [ ] Regression test for the Q3 dedupe bug: a mapeditor pattern that shares its `dmsEnvId` with an
      earlier datasets pattern still appears in the Map section's catalog lookup (through `sitePatterns`).
- [ ] Phase 2 snapshot note: the admin options **lose `forms`** on purpose. The snapshot is otherwise
      identical.
- [ ] The full vitest suite is no worse than baseline (three tests are known-red; see
      `reference_dms_vitest_happy_dom`).
- [ ] Grep gates: Phase 3 (the page pattern is Map-agnostic), Phase 5 (`ME` has no outward relative
      imports) and Phase 7 (no map or mapeditor strings left in the library).
- [ ] `npm run build` (dms-template) succeeds. The `section/Map` chunk doesn't contain the editor, and the
      mapeditor routes are their own lazy chunk.

**Live (dev; run before Phase 7 is called done):**
- [ ] MNY dev: open the mapeditor pattern, then list, edit and save a symbology. Check the Add Layer modal
      and the layer "…" menu.
- [ ] Page Map sections (MNY county page, transportny freight atlas):
  - rendering, legend, hover and filters
  - the settings menu: the Map controls appear, not dataWrapper's
  - the symbology selector lists the catalog, and Refresh works
  - `display.shareableState` still round-trips `?layers=` and the interactive `searchParamKey`s
  - `Map: Dama Map` legacy sections still render
- [ ] transportny `macroview` and `routecreation` plugins work inside the editor **and** on a page Map
      section, registered through `theme.mapeditor.mapPlugins`, and they don't appear on a non-transportny
      site. The `mapeditor.damaMap.layerLibrary` panel styling
      still applies.
- [ ] A plugin registered only through `registerMapPlugins` in `App.jsx` (a test plugin, or the
      transportny set moved there temporarily) shows up in the editor's plugin library and on a page Map
      section.
- [ ] The MNY `mapeditor.damaMap` override visibly applies to a county page map, matching how it looked
      before the move.
- [ ] Admin: Add Pattern offers Map Editor, the pill styles are right, the settings dmsEnv config shows,
      and the permission options are right. The section-type picker still offers `Map` and hides the alias.
- [ ] SSR: server-render a page with a Map section, and a mapeditor route, with no hydration mismatch.
- [ ] Unregistered: with the dms-template registration commented out, mapeditor rows warn once, and Map
      sections fall back as Phase 0 decides.

## Open questions

1. ~~**How does an app register a type?**~~ **Resolved 2026-10-08 (owner):** module-level
   `registerPatternTypes()` (and `registerMapPlugins()`), called from a module that both `App.jsx` and
   `entry-ssr.jsx` import.
2. ~~**Where does the Map section live inside the pattern?**~~ **Resolved 2026-10-08 (owner):**
   `mapeditor/section/`, beside `MapEditor/`. The registration imports `section/config`.
3. ~~**What does `provides: ['datasources']` mean, and does mapeditor need it?**~~ **Resolved
   2026-10-08 (owner), as recommended:**
   - Siteconfigs get a generic `sitePatterns` argument, and the Map section finds mapeditor rows there.
     This fixes the `dmsEnvId` dedupe bug.
   - The capability is a boolean, `providesDatasources`.
   - Mapeditor keeps it only if Phase 0 finds mapeditor dmsEnvs that no datasets pattern covers.
   - Background: `datasetPatterns` (`render/spa/utils/index.js:297`) turns those pattern rows into internal
     datasources, `{type:'internal', env:'<app>+<instance>', label:'managed', pattern}`, which are
     de-duplicated by `dmsEnvId` (:373-385). They are `CMSContext.datasources`, which the page source
     pickers query, and the server resolves env → pattern → `dmsEnvId` → sources.
4. ~~**What should the public surface be?**~~ **Resolved 2026-10-08 (owner):** named exports from the
   library entry. That's the licensing boundary, and the Phase 5 gate tests it.
5. ~~**Should every app get mapeditor, or only some?**~~ **Resolved 2026-10-08 (owner):** every app.
   It's registered in `App.jsx`. The owner wants to look at per-app customization later, perhaps
   modelled on `src/data-types.js` `dataTypesByApp`, but it's out of scope here.
6. ~~**What to do about `forms`?**~~ **Resolved 2026-10-08 (owner):** remove every trace of the forms
   pattern type from the project. Phase 2 has the full list. No legacy registration.
   - The code was already gone (no `patterns/forms/`, registry entry commented out), but the admin still
     offered it, and `datasetPatterns` still counts existing forms rows as datasource providers.
   - Phase 0 counts those rows so the owner knows the data impact. Deleting or converting them is a
     separate decision.
7. ~~**Where does the `damaMap` theme default come from?**~~ **Resolved 2026-10-08 (owner):** every
   pattern has a `defaultTheme` holding all of its theme objects. It is registered onto the theme under
   the pattern's name, and other themes style the pattern under that key. `theme.pages.damaMap` →
   `theme.mapeditor.damaMap`. Built-ins follow the same rule; the page pattern keeps `pages` as its key.
8. ~~**What happens to the `damaMapPlugins` DmsSite prop?**~~ **Resolved 2026-10-08 (owner):** the
   plugins must keep working, and the API may change. The pattern exports `registerMapPlugins(map)`,
   which projects call in `App.jsx`, the same way page components are registered. The `DmsSite` prop is
   removed.
9. ~~**Where do the map skills live?**~~ **Resolved 2026-10-08 (owner):** keep them in `src/dms/skills/`
   (they're DMS authoring how-tos), with paths into dms-template.

10. ~~**Should `theme.mapPlugins` move to `theme.mapeditor.mapPlugins`?**~~ **Resolved 2026-10-08
    (owner):** yes. Theme-provided plugins move under the pattern's key along with `damaMap`.

## Progress log

- 2026-10-08 · task filed; initiative chosen by the user (`tes_licensing_open_core`), `dms_map_stack`
  added as secondary. Two read-only audits run: (a) pattern-registry consumers + existing extension
  points, (b) mapeditor's inbound/outbound coupling.
- 2026-10-08 · first plan carved a "shared map runtime" out of mapeditor to break the page ↔ mapeditor
  cycle. **Owner redirected:** move the page Map section into the mapeditor pattern, and let a pattern
  registration optionally register page components through `registerComponents`. Re-audited what `PMAP`
  takes from the library (page contexts, comparison-series helpers, `formatFunctions`, ui map/theme) and
  found the page pattern's remaining Map-specific branches (`mapAPI` settings switch,
  `deriveMapShareVariables`, `damaMap` default theme, plugin registration, `mapeditorKeys`). Plan
  rewritten: Phase 3 makes those generic, Phase 4 moves `PMAP` into the pattern, and the per-file split
  table is gone because everything moves.
- 2026-10-08 · owner decisions recorded as a Design note:
  - The page pattern must be fully map-agnostic.
  - The export surface grows to named exports (Q4).
  - The release risk is accepted.
  - Pattern themes (Q7): every pattern has a `defaultTheme`, registered under the pattern's name, so
    `pages.damaMap` → `mapeditor.damaMap`. The built-ins move onto the same slot.
  - Plugins (Q8): the pattern exports `registerMapPlugins`, called from `App.jsx`, and the
    `damaMapPlugins` prop is removed.
  - Checked: `ui/defaultTheme.js` mounts pattern themes at `pages`/`datasets`/`auth`/`qa`; `getBaseTheme`
    caches merged themes, so registration must clear the cache; `damaMap` is registered at `pages.damaMap`
    but read at the top level today.
  - Added Q10 (`theme.mapPlugins` location).
- 2026-10-08 · Q10 resolved (owner): `theme.mapPlugins` → `theme.mapeditor.mapPlugins`. Updated the
  plugin hook, Phase 3, files, tests and the transportNY sync note.
- 2026-10-08 · Q1, Q2 and Q9 resolved (owner) as recommended. Q3, Q5 and Q6 expanded for the owner.
  - Q3: `datasetPatterns` → internal datasources; `mapeditorKeys` piggybacks on that list and is exposed
    to the `dmsEnvId` dedupe (latent bug, from reading the code).
  - Q5: per-app gating precedent in `src/data-types.js`.
  - Q6: forms rows still feed datasources.
- 2026-10-08 · Q3, Q5 and Q6 resolved (owner); every open question is now closed.
  - Q3: generic `sitePatterns` + boolean `providesDatasources`; mapeditor keeps it only if Phase 0 finds
    a need.
  - Q5: all apps, registered in `App.jsx`; per-app customization is a later topic.
  - Q6: remove every trace of `forms`. Inventory taken: about 30 references across the library, CLI,
    dms-server scripts and tests, the tessera theme and docs; none in the server runtime. Added to
    Phase 2, with Phase 0 row counts.
- 2026-10-08 · **Implemented Phases 0–8** (see each phase). Key design notes:
  - **`registerFromTheme` hook:** a read-only check found transportnyv2 pages and theme-less mapeditor
    patterns, so theme-scoped plugin registration would have broken detour/macroview/routecreation.
  - **A single `managesOwnState` flag** covers both the settings API and the unconverted element-data.
  - **A second library entry, `map.js`**, keeps the map runtime out of the eager bundle.
  - **The import rewrite happened at the move**, to avoid a lib-internal cycle.
  - **`fnumIndex` copies left as they are:** they format differently.
  - `npm install` pruned untracked `node_modules` (verified harmless, and it fixed the happy-dom
    baseline error).
  - SSR parity matches byte for byte, and live headless checks pass. Status → built.
