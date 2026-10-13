# Pattern-type registry

How the DMS library turns a pattern row's `pattern_type` into routes, and how a host app adds its own
pattern types. Added 2026-10-08 (`planning/tasks/current/pluggable-patterns-mapeditor-extraction.md`).

## The model

Every pattern type, built-in or app-supplied, is one **definition** in a module-level registry
(`packages/dms/src/patterns/registry.js`):

| API (exported from the library entry) | Does |
|---|---|
| `registerPatternTypes({ [name]: definition })` | Adds or replaces types. Throws if `siteConfig` isn't an array; warns (dev) when a name is replaced. |
| `getPatternType(name)` | One definition, or `undefined`. |
| `listPatternTypes()` | All definitions, sorted by `admin.order`, then registration order. |

The built-ins (`page`, `datasets`, `auth`, `admin`, `qa`) register in `patterns/index.js`. A host app
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
  },
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
  - Built-in special cases stay hard-coded: auth/admin routing, qa install hooks, editor tabs, and
    `permissionOptionsFor`. An app type gets the default pattern-admin permission list.
- **Theme:** `defaultTheme` is set on the library default theme (`ui/defaultTheme.js`) at
  `themeKey ?? name`, or merged with `mergeTheme` if that key already holds a theme, and the merged-theme
  cache is reset (`resetBaseThemeCache`).
  - A site theme styles the pattern under that same key, e.g. `mapeditor.damaMap.container` in
    `src/themes/mny/theme.js`.
  - `ui/defaultTheme.js` itself imports no pattern theme.
- **Section components:** `pageComponents` go to `registerComponents`, so the page pattern renders them
  like built-ins. The registration is app-wide, whether or not the site has a row of the type.
- **Theme-shipped code:** `registerFromTheme(theme)` runs for every loaded theme, so a site theme can
  ship code for the pattern under its key (e.g. map plugins at `mapeditor.mapPlugins`). It's site-wide,
  whichever pattern selected the theme.

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
  It also exports `UI`, `Icons`, `ThemeContext`, `getComponentTheme`, `getPatternTheme`, `CMSContext`,
  `PageContext`, `ComponentContext`, `initializePatternFormat`, `lazyComponent`, `dmsColumnTypes`,
  `getInstance`, `formatFunctions`, the comparison-series helpers (`resolveComparisonVariants`,
  `SELF_PARAM_KEY_SENTINEL`, `selfParamKey`), and the datasets authority helpers (`readAuthority`,
  `isAuthoritative`, `keyLabel`, `singleAuthoritativeViewId`, `sortAuthoritativeFirst`).
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
