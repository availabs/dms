# Pattern-type registry

How the DMS library turns a pattern row's `pattern_type` into routes, and how a host app adds its own
pattern types. Added 2026-10-08 (`planning/tasks/current/pluggable-patterns-mapeditor-extraction.md`);
the admin, publish, CLI and server hooks came with the qa move, 2026-10-14
(`planning/tasks/completed/pluggable-patterns-qa-extraction.md`).

## The model

Every pattern type, built-in or app-supplied, is one **definition** in a module-level registry
(`packages/dms/src/patterns/registry.js`):

| API (exported from the library entry) | Does |
|---|---|
| `registerPatternTypes({ [name]: definition })` | Adds or replaces types. Throws if `siteConfig` isn't an array; warns (dev) when a name is replaced. |
| `getPatternType(name)` | One definition, or `undefined`. |
| `listPatternTypes()` | All definitions, sorted by `admin.order`, then registration order. |

The built-ins (`page`, `datasets`, `auth`, `admin`) register in `patterns/index.js`. A host app
registers its own **at module scope in a module that both its client entry and its SSR entry import**,
before `DmsSite` / `createSSRHandler` build routes. dms-template does this in `src/patterns/index.js`,
imported by `src/App.jsx` and `src/entry-ssr.jsx`.

## The definition

```js
{
  siteConfig,            // REQUIRED: array of config functions (the built-ins' siteConfig.jsx contract)
  label,                 // display name: pattern-type select, Add Pattern card
  description,           // one line on the Add Pattern card
  admin: {
    addable,             // offered in the pattern-type select and as an Add Pattern card
    order,               // position in those lists and the Sites table's type chips
    defaultName,         // the picker's suggested pattern name
    usesDmsEnv,          // the pattern's Settings show the dmsEnv picker
    duplicable,          // default true; false hides Duplicate and patternActions denies it
    beforeCreate,        // async ({ falcor, app, instance, row, siblings }) → { problem } | { row }
    afterCreate,         // async ({ falcor, app, siteId, siteInstance, patternId, instance, row, siblings })
    editorTabs,          // [{ name, path, icon, component }]: Pattern Editor tabs after Overview
  },
  onPagePublish,         // async ({ page, pattern, sitePatterns, type, app, baseUrl, apiLoad, apiUpdate })
  providesDatasources,   // its rows become internal datasources (CMSContext.datasources → source pickers)
  pageComponents,        // { elementType: entry } handed to the page pattern's registerComponents
  defaultTheme,          // every theme object the pattern uses → mounted at theme[themeKey ?? name]
  themeKey,              // only for a type whose key predates the registry (page → 'pages')
  registerFromTheme,     // (theme) => void, called with every theme the site loaded, at route build
}
```

### What each piece drives

- **Routing:** `pattern2routes` (`render/spa/utils/index.js`) calls `getPatternType(row.pattern_type)
  ?.siteConfig` for each pattern row and mount. A row whose type isn't registered is skipped, with one
  dev warning per type. Every config function also receives `sitePatterns` (the site's raw pattern
  rows), so a pattern or a section it ships can find other patterns by type.
- **Admin:** the `pattern_type` select options (a getter in `admin.format.js`), the Add Pattern picker
  cards (`AddPatternPicker.jsx`), the Sites table pill (`typePill<Type>`, else `typePillDefault`, else
  `typePillUnknown`) and chip order (`editSite.jsx`), and the Settings dmsEnv picker
  (`patternEditor/default/settings.jsx`).
  - **Creating a pattern** (`editSite.jsx`, and the generic `patterns` field editor
    `components/patternList.jsx`): `admin.beforeCreate` runs before the row is written. It may refuse
    (`{ problem }`, shown to the user) or hand back the row to write (`{ row }`, e.g. initial settings).
    `admin.afterCreate` runs once the site row listing the new pattern is saved (e.g. to create the
    pattern's datasets). `patternList.jsx` doesn't know the site row's id, so it runs `beforeCreate`
    only.
  - **`admin.duplicable: false`** hides Duplicate. `patternActions(user, app, site, row, typeAdmin)`
    takes the type's `admin` metadata from its callers, so `utils/adminPermissions.js` stays
    import-free.
  - **`admin.editorTabs`** become Pattern Editor tabs (`patternEditor/index.jsx`) and admin menu
    entries (`admin/siteConfig.jsx`). Each tab gets the editor's usual props (`value`, `apiLoad`,
    `apiUpdate`, `falcor`, …) and needs edit-pattern.
  - Built-in special cases stay hard-coded: auth/admin routing, the page pattern's own tabs, and
    `permissionOptionsFor`. An app type gets the default pattern-admin permission list.
- **Theme:** `defaultTheme` is set on the library default theme (`ui/defaultTheme.js`) at
  `themeKey ?? name`, or merged with `mergeTheme` if that key already holds a theme, and the merged-theme
  cache is reset (`resetBaseThemeCache`).
  - A site theme styles the pattern under that same key, e.g. `mapeditor.damaMap.container` in
    `src/themes/mny/theme.js`.
  - `ui/defaultTheme.js` itself imports no pattern theme.
  - Admin pages get only a site theme's **`admin`** key over the default theme (`getAdminTheme`), so an
    admin panel a type ships (an editor tab) is restyled under `admin.<key>`, not under the type's own key.
- **Section components:** `pageComponents` go to `registerComponents`, so the page pattern renders them
  like built-ins. The registration is app-wide, whether or not the site has a row of the type.
- **Theme-shipped code:** `registerFromTheme(theme)` runs for every loaded theme, so a site theme can
  ship code for the pattern under its key (e.g. map plugins at `mapeditor.mapPlugins`). It's site-wide,
  whichever pattern selected the theme.
- **Publishing a page:** after the page pattern's Publish writes the page (`pages/edit/editFunctions.jsx`
  `publish`), every registered type's `onPagePublish` runs, not awaited. A failure is logged and never
  touches the publish. The context comes from CMSContext (`pagesPane.jsx`), which also carries the
  page pattern's own row as `pattern`.
- **The CLI's `dms page publish`** runs the host app's hook module, if its config names one:
  `pagePublishHook` in `.dmsrc` (relative to that file) or `DMS_PAGE_PUBLISH_HOOK` (relative to the cwd).
  Its default export gets `{ falcor, config, pattern, page, helpers: { resolvePattern, parseData,
  patternInstance, loadDatasetRows } }`, and the object it returns is added to the command's output. It
  runs in plain Node, so it can't import the library entry; it imports only plain-ESM files of its own
  pattern, and takes everything else from `helpers`.
- **dms-server's no-access stub:** a pattern row a user can't read comes back as routing info only. It
  also carries the row's **`public`** settings, whatever the type: what the type chooses to show
  everyone, signed out included. dms-server has no type-specific code. The type writes `public` from
  its own settings whenever they change.

## Section-component registry hooks (generic, any section type)

A section's registry entry (`registerComponents`) may set:

| Field | Effect |
|---|---|
| `managesOwnState: true` | The section wrapper hands element-data back unconverted (`convertOldState`). The section menu takes this section's settings API from its handle's **`settingsAPI`** field instead of the dataWrapper's `dwAPI` (`sectionMenu.jsx`). |
| `derivePageVariables(elementData) → vars[]` | Page variables the section owns are auto-registered (`deriveSectionPageVariables` in `pages/_utils`, used by `getPageVariableRegistry`). Published and draft sections are read, the first entry per searchKey wins, and authored variables win over all of these. |

These replaced the page pattern's old Map-specific branches (name checks, `mapAPI`, the `symbologies`
state sniff, `deriveMapShareVariables`).

## Public building blocks for app patterns

An app pattern imports library code **only through the two entries**, never by deep `src/...` path:

- `~/dms/packages/dms/src` (the main entry) exports the registry functions and `registerComponents`.
  It also exports:
  - `UI`, `Icons`, `ThemeContext`, `getComponentTheme`, `getPatternTheme`, `CMSContext`, `PageContext`,
    `ComponentContext`, `initializePatternFormat`, `lazyComponent`, `dmsColumnTypes`, `getInstance`,
    `formatFunctions`
  - the comparison-series helpers (`resolveComparisonVariants`, `SELF_PARAM_KEY_SENTINEL`,
    `selfParamKey`)
  - the datasets authority helpers (`readAuthority`, `isAuthoritative`, `keyLabel`,
    `singleAuthoritativeViewId`, `sortAuthoritativeFirst`)
  - building blocks added for the qa pattern: `loadThemeFonts`, `registerWidget` (nav widgets), `PageView`, `defaultCheckAuth`,
    `preloadSectionComponents`, `pageSectionTypes`, `applyCreateDefaults`, `lexicalElementData`,
    `headingBodyLexicalState`, `AdminContext`, `getSourceIdsBySlug`, `CHANGE_HISTORY_COLUMNS`
  - six base component themes to build named styles from: `tableTheme`, `inputTheme`,
    `sectionArrayTheme`, `dataBarTheme`, `stackedBarTheme`, `flowStepTheme`
- A type that builds on another type's route config reads it from the registry when its route is built,
  e.g. `getPatternType('page').siteConfig[0]`, rather than importing it.
- `~/dms/packages/dms/src/map` (`map.js`, the map runtime) exports `AvlMap`, `AvlLayer`, `useMapTheme`,
  `useMapLegendTheme` and `getColorRange`. It's a separate entry so the main one doesn't pull the map
  runtime into every page's bundle.

## The worked example: dms-template's map editor

`dms-template/src/patterns/mapeditor/` (`index.js` is the definition):

- The editor routes (`siteConfig.jsx`) author `{instance}|symbology` rows.
- `pageComponents` ship the page pattern's **Map** section (`section/`) and its hidden legacy alias
  `Map: Dama Map`.
- `defaultTheme` mounts `{ damaMap }` at `theme.mapeditor`.
- `registerFromTheme` registers `theme.mapeditor.mapPlugins`.
- The module also exports **`registerMapPlugins({ name: plugin })`** for project-wide plugins. This
  replaced the old `damaMapPlugins` `DmsSite` prop.
- Tests: `src/patterns/mapeditor/mapeditor.test.js`.

## The second worked example: dms-template's qa pattern ("Tickets")

`dms-template/src/patterns/qa/` (`index.js` is the definition) uses every hook the map editor doesn't:

- `admin.addable: QA_PATTERN_ENABLED`: offered in Add Pattern only with `VITE_DMS_QA_PATTERN` set.
- `admin.duplicable: false`: a copy would drop the install's own settings and dataset refs.
- `admin.beforeCreate` (`install.js` `qaBeforeCreate`): refuses a taken URL or dataset name, and starts
  the install's switches off.
- `admin.afterCreate` (`qaAfterCreate` → `installQa`): creates the install's datasets.
- `admin.editorTabs`: the lazy Configure tab (`admin/configureTab.jsx`), styled under
  `admin.qaConfigure`.
- `onPagePublish` (`publish.js`): adds a published page to the installs that cover its pattern.
  - `qa/cli/onPagePublish.js` is the same for `dms page publish`
    (`DMS_PAGE_PUBLISH_HOOK=src/patterns/qa/cli/onPagePublish.js`).
- `public.qaIntake` (`intake.js`): what the Report an issue widget needs to file from a page an
  ungranted user can see. It's written with every change to the install's datasets or fields.
- The Report an issue nav widget: `registerWidget('ReportIssue', …)` in `siteConfig.jsx`, themed at
  `qa.reportIssue`.
- Tests: `src/patterns/qa/tests/`.
